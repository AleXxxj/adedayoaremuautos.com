"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { rentalBookings, leads, vehicles, rentalRates } from "@/db/schema";
import { MARKETS, isMarketCode } from "@/lib/market";
import { quoteRental, rentalDays, RentalError } from "@/lib/rental";
import { notifyStaffOfLead } from "@/lib/notify";
import { RENTAL_TERMS_VERSION } from "@/content/rentalTerms";
import { storeLicence } from "@/lib/licence";
import { formatMoney, money } from "@/lib/money";
import { providerFor, providerConfigured } from "@/lib/payments/provider";
import { resolveReferralPartner } from "@/lib/partner";
import { confirmRentalEarning, cancelEarningFor } from "@/lib/partnerEarnings";

export interface RentalResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** Set when the booking succeeded, for the confirmation panel. */
  reference?: string;
  /** The booking itself, so the panel can offer to take payment for it. */
  bookingId?: string;
  /** The hire charge, formatted. Not the deposit — that is taken at pickup. */
  amount?: string;
  /** False when this market has no payment provider configured yet. */
  canPay?: boolean;
}

const schema = z.object({
  marketCode: z.enum(["us", "ng"]),
  vehicleSlug: z.string().trim().min(1),
  from: z.string({ message: "Choose a pick-up date" }).min(1, "Choose a pick-up date"),
  to: z.string({ message: "Choose a return date" }).min(1, "Choose a return date"),
  withDriver: z.coerce.boolean().default(false),
  name: z
    .string({ message: "Please enter your name" })
    .trim()
    .min(2, "Please enter your name")
    .max(120),
  phone: z
    .string({ message: "Please enter a reachable phone number" })
    .trim()
    .min(7, "Please enter a reachable phone number")
    .max(40),
  email: z.string().trim().email("That email does not look right").optional().or(z.literal("")),
  licenceNo: z.string().trim().max(60).optional(),

  /**
   * How the vehicle is covered while they have it.
   *
   * Required, with no default. Defaulting it either bills somebody for a
   * cover they never chose or implies cover nobody arranged — and a quietly assumed
   * answer to "who is insuring this car" is not an answer at all.
   */
  insuranceChoice: z.enum(["own", "company", "declined"], {
    message: "Please choose how you will be covered",
  }),
  insuranceProvider: z.string().trim().max(120).optional(),
  insurancePolicyNo: z.string().trim().max(80).optional(),

  /**
   * Confirmed rather than collected.
   *
   * Age eligibility needs the renter's date of birth, and their licence
   * already carries it — so this is a declaration checked against the document
   * at verification, not a second copy of their DOB in our database. Collecting
   * what the document already proves is how a booking form turns into a
   * liability.
   */
  confirmEligible: z.literal("on", {
    message: "Please confirm you meet the hire requirements",
  }),
  note: z.string().trim().max(2000).optional(),
  website: z.string().max(0).optional(),
  renderedAt: z.coerce.number().optional(),
  /**
   * Refused rather than defaulted. A booking that proceeds without this is a
   * booking nobody can later show the terms were put to — and clause 4, the
   * renter confirming their own cover for delivery work, is the one that
   * matters most and the one they are least likely to have thought about.
   */
  acceptTerms: z.literal("on", {
    message: "Please read and accept the rental terms to continue.",
  }),
  /** Echoed back from the form so the exact wording shown is what is recorded. */
  termsVersion: z.string().trim().max(40).optional(),
});

/**
 * Requests a rental.
 *
 * The booking is created as `quote`, not `confirmed` — staff verify the licence
 * and take the deposit before it holds the vehicle. Quotes are deliberately
 * excluded from the overlap constraint so a speculative request never blocks a
 * paying customer.
 */
export async function requestRental(
  _prev: RentalResult | null,
  formData: FormData,
): Promise<RentalResult> {
  const licenceFile = formData.get("licenceFile");
  const insuranceFile = formData.get("insuranceFile");
  const raw = Object.fromEntries(formData.entries());
  // A File would otherwise be handed to zod as an object and fail the string
  // schema; it is validated separately by its own bytes.
  delete (raw as Record<string, unknown>).licenceFile;
  delete (raw as Record<string, unknown>).insuranceFile;
  const cleaned = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v === "" && k !== "website" ? undefined : v]),
  );

  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }
  const f = parsed.data;

  // Bots fill the honeypot; fail silently so they learn nothing.
  if (f.website) return { ok: true, reference: "—" };
  if (f.renderedAt && Date.now() - f.renderedAt < 1500) return { ok: true, reference: "—" };

  if (!isMarketCode(f.marketCode)) return { ok: false, error: "Unknown market." };
  const market = MARKETS[f.marketCode];

  const from = new Date(`${f.from}T00:00:00Z`);
  const to = new Date(`${f.to}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { ok: false, error: "Those dates could not be read." };
  }

  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  if (from < startOfToday) {
    return { ok: false, fieldErrors: { from: ["Pick-up cannot be in the past"] } };
  }

  const days = rentalDays(from, to);
  if (days <= 0) {
    return { ok: false, fieldErrors: { to: ["Return must be after pick-up"] } };
  }

  const [row] = await db
    .select({ v: vehicles, r: rentalRates })
    .from(vehicles)
    .innerJoin(rentalRates, eq(rentalRates.vehicleId, vehicles.id))
    .where(and(eq(vehicles.marketCode, f.marketCode), eq(vehicles.slug, f.vehicleSlug)))
    .limit(1);

  if (!row) return { ok: false, error: "That vehicle is not available for hire." };

  const tariff = {
    dailyMinor: row.r.dailyMinor,
    weeklyMinor: row.r.weeklyMinor,
    monthlyMinor: row.r.monthlyMinor,
    depositMinor: row.r.depositMinor,
    currency: row.r.currency,
    minDays: row.r.minDays,
    maxDays: row.r.maxDays,
    withDriverAvailable: row.r.withDriverAvailable,
    driverDailyMinor: row.r.driverDailyMinor,
    injuryCoverDailyMinor: row.r.injuryCoverDailyMinor,
  };

  // Price on the server. The figure shown in the browser is a preview.
  let quote;
  try {
    quote = quoteRental(tariff, days, {
      withDriver: f.withDriver,
      injuryCover: f.insuranceChoice === "company",
    });
  } catch (e) {
    if (e instanceof RentalError) return { ok: false, error: e.message };
    throw e;
  }

  const h = await headers();
  const period = `[${from.toISOString()},${to.toISOString()})`;

  /*
   * Documents, stored before the booking row.
   *
   * A rejected file stops the request with a message the visitor can act on,
   * rather than leaving a booking that claims a licence it does not have.
   *
   * The licence is now required where it used to be optional. A hire could
   * previously be booked and paid for with no licence detail of any kind, and
   * the terms merely had the renter *represent* that they held one — a
   * sentence nobody ever checked against anything.
   */
  if (!(licenceFile instanceof File) || licenceFile.size === 0) {
    return {
      ok: false,
      fieldErrors: {
        licenceFile: ["Please attach a photo of your driving licence."],
      },
    };
  }

  const storedLicence = await storeLicence(licenceFile, "licence");
  if (!storedLicence.ok) {
    return {
      ok: false,
      fieldErrors: { licenceFile: [storedLicence.error ?? "Could not read that file."] },
    };
  }
  const licenceKey = storedLicence.key ?? null;

  /*
   * Proof of insurance, required only of those claiming to have it.
   *
   * A renter may legitimately have none of their own: the business's policy
   * covers the vehicle, so it is willing to hire to them provided they
   * understand that their own injury is not covered. Demanding a certificate
   * from somebody who has already said they do not have one would turn a
   * disclosure into a refusal, which is not the business's position.
   *
   * But a renter who says they are insured has to show it, or the question
   * was never really asked.
   */
  let insuranceKey: string | null = null;
  if (f.insuranceChoice === "own") {
    if (!(insuranceFile instanceof File) || insuranceFile.size === 0) {
      return {
        ok: false,
        fieldErrors: {
          insuranceFile: [
            "Please attach your insurance certificate, or change your answer above.",
          ],
        },
      };
    }

    const storedInsurance = await storeLicence(insuranceFile, "insurance");
    if (!storedInsurance.ok) {
      return {
        ok: false,
        fieldErrors: {
          insuranceFile: [storedInsurance.error ?? "Could not read that file."],
        },
      };
    }
    insuranceKey = storedInsurance.key ?? null;
  } else if (insuranceFile instanceof File && insuranceFile.size > 0) {
    // Attached anyway. Kept, because it costs nothing and is useful at
    // pickup, but never allowed to fail a booking that did not require it.
    const stored = await storeLicence(insuranceFile, "insurance");
    insuranceKey = stored.ok ? (stored.key ?? null) : null;
  }

  /*
   * Who sent them, if anybody.
   *
   * Looked up before the insert and never allowed to fail it: an unknown,
   * suspended or cross-market code credits nobody rather than costing the
   * dealership the booking. Until now this happened for enquiries only, so a
   * partner whose customer hired a car for a week earned nothing the system
   * could see — on the one path that actually takes money.
   */
  const referralPartnerId = await resolveReferralPartner(f.marketCode);

  let bookingId = "";
  try {
    const [booking] = await db
      .insert(rentalBookings)
      .values({
        vehicleId: row.v.id,
        marketCode: f.marketCode,
        referralPartnerId,
        period,
        customerName: f.name,
        customerEmail: f.email || null,
        customerPhone: f.phone,
        driverLicenseNo: f.licenceNo,
        withDriver: f.withDriver,
        status: "quote",
        totalMinor: quote.totalMinor,
        depositMinor: quote.depositMinor,
        currency: market.currency,
        notes: f.note,
        // What they accepted, and when. The version is stored because terms
        // change and the question later is what THIS person agreed to.
        termsVersion: f.termsVersion || RENTAL_TERMS_VERSION,
        termsAcceptedAt: new Date(),
        licenceStorageKey: licenceKey,
        licenceUploadedAt: licenceKey ? new Date() : null,

        // What they chose, and what it cost. The rate is stored alongside the
        // total so the amount on the invoice can still be explained after the
        // fee changes — the same reason a commission stores its own rate.
        insuranceChoice: f.insuranceChoice,
        injuryCoverDailyMinor:
          f.insuranceChoice === "company"
            ? (row.r.injuryCoverDailyMinor ?? null)
            : null,
        injuryCoverTotalMinor: quote.injuryCoverMinor,
        // When they were shown, in so many words, that their own injury is
        // not covered by the business's policy. Stamped for everybody, not
        // only those who decline: a renter with their own insurance should
        // also know where our cover stops.
        injuryNoticeAckAt: new Date(),
        insuranceStorageKey: insuranceKey,
        insuranceUploadedAt: insuranceKey ? new Date() : null,
        insuranceProvider: f.insuranceProvider || null,
        insurancePolicyNo: f.insurancePolicyNo || null,
      })
      .returning({ id: rentalBookings.id });
    bookingId = booking.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("rental_bookings_no_overlap")) {
      return {
        ok: false,
        error: "That vehicle has just been booked for those dates. Please choose different dates.",
      };
    }
    if (msg.includes("rental_bookings_period")) {
      return { ok: false, error: "Those dates are not a valid hire period." };
    }
    console.error("[rental] insert failed", e);
    return {
      ok: false,
      error: "Something went wrong saving your request. Please call us and we will sort it out.",
    };
  }

  // Mirror it into the lead pipeline so rental enquiries appear alongside
  // every other enquiry rather than in a separate silo nobody checks.
  try {
    const [lead] = await db
      .insert(leads)
      .values({
        marketCode: f.marketCode,
        type: "rental",
        status: "new",
        vehicleId: row.v.id,
        name: f.name,
        email: f.email || null,
        phone: f.phone,
        message:
          `Rental request: ${f.from} to ${f.to} (${days} day${days === 1 ? "" : "s"})` +
          (f.withDriver ? ", with driver" : "") +
          (f.note ? `\n\n${f.note}` : ""),
        source: "website",
        landingPath: `/${f.marketCode}/rentals/${f.vehicleSlug}`,
        ipCountry: h.get("x-vercel-ip-country") ?? null,
      })
      .returning({ id: leads.id });

    await notifyStaffOfLead({
      leadId: lead.id,
      type: "rental",
      market: f.marketCode,
      name: f.name,
      email: f.email,
      phone: f.phone,
      message: `${row.v.year} ${row.v.make} ${row.v.model} · ${f.from} → ${f.to}`,
      vehicle: `${row.v.year} ${row.v.make} ${row.v.model}`,
      adminUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/admin/rentals`,
    });
  } catch (e) {
    // The booking is safe; alerting is not allowed to undo it.
    console.error("[rental] lead mirror failed", e);
  }

  revalidatePath("/admin/rentals");
  revalidatePath("/admin/leads");

  // Offered only where a provider is actually configured, so a customer is
  // never shown a payment button that cannot work.
  const canPay = providerConfigured(providerFor(f.marketCode));

  return {
    ok: true,
    reference: bookingId.slice(0, 8).toUpperCase(),
    bookingId,
    amount: formatMoney(money(quote.totalMinor, market.currency), market.locale),
    canPay,
  };
}

/* ── Admin ─────────────────────────────────────────────────────────────── */

const documentsSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["verified", "rejected"]),
  reason: z.string().trim().max(500).optional(),
});

/**
 * A member of staff has looked at the documents.
 *
 * This is the step that makes requiring documents mean anything. Payment
 * confirms the dates — the webhook marks a paid booking `confirmed` so the
 * exclusion constraint holds the vehicle — but it establishes nothing about
 * the person. Without a human check, a renter could pay online with an expired
 * licence and a lapsed policy and the system would show a confirmed booking
 * ready to collect.
 *
 * Deliberately NOT entangled with `status`. The overlap constraint is built on
 * status, and adding a document condition to it would mean a failed check
 * silently releasing dates somebody has already paid for. So the dates stay
 * held, the money stays taken, and this flag decides whether keys change
 * hands — which is a conversation, not a cancellation.
 */
export async function reviewBookingDocuments(
  _prev: RentalResult | null,
  formData: FormData,
): Promise<RentalResult> {
  const { requireStaff, assertMarketAccess } = await import("@/lib/auth");
  const user = await requireStaff();

  const parsed = documentsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Could not read that request." };
  const v = parsed.data;

  if (v.decision === "rejected" && !v.reason) {
    return {
      ok: false,
      fieldErrors: { reason: ["Say what is wrong — the customer is told."] },
    };
  }

  const [booking] = await db
    .select()
    .from(rentalBookings)
    .where(eq(rentalBookings.id, v.id));
  if (!booking) return { ok: false, error: "Booking not found." };
  assertMarketAccess(user, booking.marketCode);

  const now = new Date();
  await db
    .update(rentalBookings)
    .set(
      v.decision === "verified"
        ? {
            documentsVerifiedAt: now,
            documentsVerifiedByEmail: user.email,
            // Clearing the refusal together with its reason: the constraint
            // requires the two to travel as a pair.
            documentsRejectedAt: null,
            documentsRejectedReason: null,
          }
        : {
            documentsRejectedAt: now,
            documentsRejectedReason: v.reason ?? null,
            documentsVerifiedAt: null,
            documentsVerifiedByEmail: null,
          },
    )
    .where(eq(rentalBookings.id, v.id));

  console.log(
    `[rental] ${user.email} marked documents ${v.decision} on booking ${v.id}`,
  );

  revalidatePath("/admin/rentals");
  revalidatePath(`/admin/rentals/${v.id}/agreement`);
  return { ok: true };
}

export async function updateBookingStatus(
  _prev: RentalResult | null,
  formData: FormData,
): Promise<RentalResult> {
  const { requireStaff, assertMarketAccess } = await import("@/lib/auth");
  const user = await requireStaff();

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const allowed = ["quote", "confirmed", "active", "returned", "cancelled"];
  if (!id || !allowed.includes(status)) {
    return { ok: false, error: "Invalid status." };
  }

  const [booking] = await db
    .select()
    .from(rentalBookings)
    .where(eq(rentalBookings.id, id));
  if (!booking) return { ok: false, error: "Booking not found." };
  assertMarketAccess(user, booking.marketCode);

  try {
    await db
      .update(rentalBookings)
      .set({ status: status as never })
      .where(eq(rentalBookings.id, id));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("rental_bookings_no_overlap")) {
      // Confirming a quote is exactly when the clash surfaces: two quotes can
      // overlap freely, but only one of them can become confirmed.
      return {
        ok: false,
        error:
          "Cannot confirm — another confirmed booking already covers those dates for this vehicle.",
      };
    }
    return { ok: false, error: `Could not update: ${msg}` };
  }

  /*
   * A referred booking's commission follows its status.
   *
   * The agreement says a commission is earned when the money has cleared and
   * the hire has completed, so "returned" is the moment it becomes genuinely
   * owed — not the moment the card cleared, because a customer who pays on
   * Monday and cancels on Tuesday is a refund rather than a payout.
   *
   * Cancelling writes it off with a reason the partner reads on their own
   * dashboard. A commission that silently disappears from somebody's earnings
   * is how a partner concludes they are being short-changed.
   */
  if (booking.referralPartnerId) {
    if (status === "returned") {
      await confirmRentalEarning(id);
    } else if (status === "cancelled") {
      await cancelEarningFor({ bookingId: id }, "The hire was cancelled.");
    }
  }

  revalidatePath("/admin/rentals");
  revalidatePath("/partner");
  return { ok: true };
}
