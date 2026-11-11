"use server";

import { violates } from "@/lib/dbError";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, gt, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { rentalBookings, leads, vehicles, rentalRates } from "@/db/schema";
import { MARKETS, isMarketCode } from "@/lib/market";
import { quoteRental, rentalDays, RentalError } from "@/lib/rental";
import { notifyStaffOfLead } from "@/lib/notify";
import { parseTstzRange } from "@/lib/pgRange";
import { RENTAL_TERMS_VERSION } from "@/content/rentalTerms";
import { storeLicence, removeLicences } from "@/lib/licence";
import { todayIn } from "@/lib/localDate";
import { formatMoney, money } from "@/lib/money";
import { providerFor, providerConfigured } from "@/lib/payments/provider";
import { referralPartnerForRenter } from "@/lib/partner";
import { releaseExpiredHolds, findOwnHold } from "@/lib/rentalHolds";
import { sendReservation } from "@/lib/mail/reservation";
import { listLocations, formatPhone } from "@/lib/repositories/locations";
import { phoneDigitsKey, phoneKeySql } from "@/lib/phoneKey";
import { siteUrl } from "@/lib/siteUrl";
import {
  holdForPickup,
  holdRemaining,
  MAX_OPEN_RESERVATIONS,
} from "@/lib/reservation";
import { syncRentalEarning } from "@/lib/partnerEarnings";

/**
 * Every public vehicle page, as a route pattern for revalidatePath(…, "page").
 * Not exported: a "use server" file may export only async functions.
 */
const RENTAL_PAGES = "/[market]/rentals/[slug]";

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
  /** How long the vehicle is held, e.g. "2 days". Absent if it is not held. */
  heldFor?: string;
  /** Whether the pay-later link went out by email. */
  emailed?: boolean;
  /**
   * The request matched a reservation this person already holds — a retry
   * after a lost reply — so the existing booking is reported, not a new one.
   */
  alreadyReserved?: boolean;
  /**
   * The pay-later link itself, returned only to the person who just made the
   * booking. Without an email address this response is the one place they
   * can get it, so the confirmation panel shows it when nothing was sent.
   */
  reservationUrl?: string;
}

const schema = z.object({
  marketCode: z.enum(["us", "ng"]),
  vehicleSlug: z.string().trim().min(1),
  from: z.string({ message: "Choose a pickup date" }).min(1, "Choose a pickup date"),
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
    .max(40)
    // Ten digits at least: a US number with its area code, or a Nigerian one.
    // Holds and retries are matched on the last ten, so fewer can't be matched.
    .refine((v) => v.replace(/\D/g, "").length >= 10, "Please enter your full phone number, with the area code"),
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
    message: "Please confirm you meet the rental requirements",
  }),
  note: z.string().trim().max(2000).optional(),
  /*
   * The honeypot: any value in "leave_empty" means a bot, answered with a
   * quiet "success" so it learns nothing. Never a validation error.
   *
   * "website", the old name, is accepted and ignored. Browsers autofill a
   * field by that name, so it was never a reliable signal: a renter was
   * refused for it, and treating it as a bot would hand a page opened before
   * this change a false "success" instead.
   */
  website: z.string().optional(),
  leave_empty: z.string().optional(),
  /**
   * How long the form was open, by the phone's own clock. A bot submits in
   * well under a second and a person can't. Measured on one clock, so a
   * phone whose clock is wrong is not mistaken for a bot — comparing the
   * phone's time with the server's dropped real bookings without a word.
   */
  elapsedMs: z.coerce.number().int().min(0).optional(),
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
    Object.entries(raw).map(([k, v]) => [k, v === "" ? undefined : v]),
  );

  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }
  const f = parsed.data;

  // Bots fill the honeypot, or submit faster than anyone can type; both are
  // answered as if it worked, so they learn nothing.
  if (f.leave_empty) return { ok: true, reference: "—" };
  if (f.elapsedMs !== undefined && f.elapsedMs < 1500) return { ok: true, reference: "—" };

  if (!isMarketCode(f.marketCode)) return { ok: false, error: "Unknown market." };
  const market = MARKETS[f.marketCode];

  const from = new Date(`${f.from}T00:00:00Z`);
  const to = new Date(`${f.to}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { ok: false, error: "Those dates could not be read." };
  }

  // Today where the business is: in UTC, "today" became tomorrow at 7 PM in
  // Greensboro. Dates are YYYY-MM-DD, so they compare as strings.
  if (f.from < todayIn(market.timezone)) {
    return { ok: false, fieldErrors: { from: ["Pickup can't be in the past"] } };
  }

  const days = rentalDays(from, to);
  if (days <= 0) {
    return { ok: false, fieldErrors: { to: ["Return must be after pickup"] } };
  }

  const [row] = await db
    .select({ v: vehicles, r: rentalRates })
    .from(vehicles)
    .innerJoin(rentalRates, eq(rentalRates.vehicleId, vehicles.id))
    .where(
      and(
        eq(vehicles.marketCode, f.marketCode),
        eq(vehicles.slug, f.vehicleSlug),
        // The same test the rental list uses: a car that has been sold, or
        // taken off rental, can't be booked from a page someone kept open.
        or(eq(vehicles.listingKind, "rental"), eq(vehicles.listingKind, "both")),
        or(eq(vehicles.status, "available"), eq(vehicles.status, "pending")),
      ),
    )
    .limit(1);

  if (!row) return { ok: false, error: "That vehicle is not available to rent." };

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
   * The same reservation, arriving twice.
   *
   * A phone can lose the reply after this function has saved the booking —
   * a dropped signal, or iOS suspending the tab — and the form then offers to
   * try again. The retry used to collide with the renter's own hold and tell
   * them the car "has just been booked", after uploading their documents a
   * second time. Same vehicle, same dates, same phone number and still held:
   * it is theirs, so it is reported as it stands and nothing new is stored.
   *
   * Checked before the documents are stored. The reservation link is not
   * returned: anyone who knew the number and the dates could otherwise fetch
   * it. The booking id is, so the renter can still pay from this screen.
   */
  const already = await findOwnHold({ vehicleId: row.v.id, period, phone: f.phone });
  if (already) {
    return {
      ok: true,
      alreadyReserved: true,
      reference: already.id.slice(0, 8).toUpperCase(),
      bookingId: already.id,
      amount: formatMoney(money(already.totalMinor, already.currency), market.locale),
      canPay: providerConfigured(providerFor(f.marketCode)),
      heldFor: already.heldUntil ? holdRemaining(already.heldUntil) : undefined,
    };
  }
  const phoneKey = phoneDigitsKey(f.phone);

  /*
   * Everything that can refuse the request without its documents, before
   * any are stored. A refusal after the upload used to leave a license photo
   * in storage with no booking to explain it, and nothing ever removed it.
   */
  await releaseExpiredHolds();

  /*
   * Dates someone else already has.
   *
   * The database refuses an overlap at the insert, but only for bookings that
   * hold the car, and only after the renter's documents were uploaded. Asked
   * here first, so the answer comes before the upload, and so a request too
   * late in the pickup day to be held is still not taken for dates that are
   * confirmed to someone else.
   */
  const [clash] = await db
    .select({ id: rentalBookings.id })
    .from(rentalBookings)
    .where(
      and(
        eq(rentalBookings.vehicleId, row.v.id),
        sql`${rentalBookings.period} && ${period}::tstzrange`,
        or(
          inArray(rentalBookings.status, ["confirmed", "active"]),
          and(eq(rentalBookings.status, "quote"), gt(rentalBookings.paymentHoldUntil, new Date())),
        ),
      ),
    )
    .limit(1);
  if (clash) {
    return {
      ok: false,
      error: "That vehicle is already booked for some of those dates. Please choose different dates.",
    };
  }

  /*
   * The hold lasts through the pickup day, where the business is.
   *
   * It used to end at the UTC midnight that starts the pickup date — 7 PM the
   * evening before, in Greensboro. A next-day pickup booked at 3 PM was held
   * for four hours, one booked after 6 PM was not held at all, and a same-day
   * pickup never was: the cars most likely to be taken were the ones left
   * unprotected.
   */
  const now = new Date();
  const reservedUntil = holdForPickup(f.from, market.timezone, now);
  const reserving = reservedUntil !== null;

  if (reserving) {
    /*
     * One person cannot hold the forecourt.
     *
     * The expiry does most of the work, but nothing otherwise stops somebody
     * reserving every car for two days from one phone. Counted on the number
     * rather than the email because the number is the one field this form has
     * always required — and on its digits rather than as typed, so writing it
     * differently does not make a new person.
     */
    const [open] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(rentalBookings)
      .where(
        and(
          phoneKey
            ? sql`${phoneKeySql(rentalBookings.customerPhone)} = ${phoneKey}`
            : eq(rentalBookings.customerPhone, f.phone),
          eq(rentalBookings.status, "quote"),
          isNotNull(rentalBookings.paymentHoldUntil),
          gt(rentalBookings.paymentHoldUntil, now),
        ),
      );

    if ((open?.n ?? 0) >= MAX_OPEN_RESERVATIONS) {
      return {
        ok: false,
        error: `You're already holding ${MAX_OPEN_RESERVATIONS} cars. Let one of those holds end before reserving another, or call us and we'll help.`,
      };
    }
  }

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
        licenceFile: ["Please attach a photo of your driver's license."],
      },
    };
  }

  // Checked before anything is stored, so a missing document leaves nothing behind.
  if (f.insuranceChoice === "own" && !(insuranceFile instanceof File && insuranceFile.size > 0)) {
    return {
      ok: false,
      fieldErrors: {
        insuranceFile: ["Please attach proof of insurance, or choose a different option above."],
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
  if (f.insuranceChoice === "own" && insuranceFile instanceof File) {
    const storedInsurance = await storeLicence(insuranceFile, "insurance");
    if (!storedInsurance.ok) {
      // The license went in a moment ago; nothing will refer to it now.
      await removeLicences([licenceKey]);
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
   *
   * By the renter's history first, then the link: a partner earns on every
   * week their renter rents with the same phone number, long after the
   * link's 90 days. The rules are in referralPartnerForRenter.
   */
  let referralPartnerId: string | null = null;
  try {
    referralPartnerId = await referralPartnerForRenter(f.marketCode, f.phone);
  } catch (e) {
    console.error("[rentals] referral lookup failed; booking taken without a partner", e);
  }

  /*
   * The reservation.
   *
   * Every request now holds the car, not just one that reaches a checkout.
   * Before this a quote held nothing, so a customer told "we have it" could
   * drive over and find it gone — and plenty of people will not pay for a car
   * they have not seen, which made the unpaid path the common one. Whether it
   * is held, and until when, was settled above, before the documents.
   */
  const reservationToken = reserving
    ? randomBytes(24).toString("base64url")
    : null;

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
        // The hold itself. The exclusion constraint reads this column, so
        // setting it is what turns a request into a car nobody else can take.
        paymentHoldUntil: reservedUntil,
        reservedUntil,
        reservationToken,
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
    /*
     * The documents go only when the database refused the row: then nothing
     * was written and nothing will refer to them. Any other failure (a
     * connection dropped after the insert, say) may have saved the booking,
     * so they stay with it rather than leave a booking without its license.
     */
    if (violates(e, "rental_bookings_no_overlap")) {
      await removeLicences([licenceKey, insuranceKey]);
      return {
        ok: false,
        error: "That vehicle has just been booked for those dates. Please choose different dates.",
      };
    }
    if (violates(e, "rental_bookings_period")) {
      await removeLicences([licenceKey, insuranceKey]);
      return { ok: false, error: "Those dates are not a valid rental period." };
    }
    console.error("[rental] insert failed", e);
    return {
      ok: false,
      error: "Something went wrong saving your request. Please call us and we will sort it out.",
    };
  }

  /*
   * Tell the customer their car is held, and how to pay for it later.
   *
   * After the reply, never before it: the reservation exists in the database
   * whatever the mail does, and failing a booking over a mail server would be
   * the worse outcome by far. But through after(), not a promise left
   * running: on a serverless host a function can be frozen once its reply is
   * sent, and this is the email that makes "come and see it, pay when you
   * are happy" possible at all — the link in it is the only way back to an
   * unpaid booking once the tab is closed.
   */
  if (reservedUntil && reservationToken && f.email) {
    const payUrl = `${siteUrl()}/${f.marketCode}/rentals/reserved/${reservationToken}`;
    // The showroom line, so "Questions? Call …" has a number in it. Looked up
    // the same way the receipt does; a lookup failure costs the email one
    // sentence, never the booking.
    let businessPhone: string | null = null;
    try {
      const sites = await listLocations(f.marketCode);
      businessPhone = formatPhone(sites.find((s) => s.phone)?.phone ?? null);
    } catch (e) {
      console.error("[rental] showroom phone lookup failed", e);
    }
    const reservation = {
      to: f.email,
      name: f.name,
      vehicle: [row.v.year, row.v.make, row.v.model].filter(Boolean).join(" "),
      dates: `${f.from} → ${f.to}`,
      reference: bookingId.slice(0, 8).toUpperCase(),
      amount: formatMoney(money(quote.totalMinor, market.currency), market.locale),
      depositDue:
        quote.depositMinor > 0
          ? formatMoney(money(quote.depositMinor, market.currency), market.locale)
          : null,
      heldUntil: new Intl.DateTimeFormat(market.locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "numeric",
        minute: "2-digit",
        timeZone: market.timezone,
      }).format(reservedUntil),
      payUrl,
      businessPhone,
      payOnline: providerConfigured(providerFor(f.marketCode)),
    };
    after(() => sendReservation(reservation).catch((e) => console.error("[rental] reservation email failed", e)));
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
  // The vehicle's page lists held dates as taken now, and it is cached for
  // five minutes; without this a hold would not show until the cache expired.
  if (reservedUntil) revalidatePath(`/${f.marketCode}/rentals/${f.vehicleSlug}`);

  // Offered only where a provider is actually configured, so a customer is
  // never shown a payment button that cannot work.
  const canPay = providerConfigured(providerFor(f.marketCode));

  return {
    ok: true,
    reference: bookingId.slice(0, 8).toUpperCase(),
    bookingId,
    amount: formatMoney(money(quote.totalMinor, market.currency), market.locale),
    canPay,
    heldFor: reservedUntil ? holdRemaining(reservedUntil) : undefined,
    emailed: Boolean(reservedUntil && reservationToken && f.email),
    reservationUrl: reservationToken
      ? `${siteUrl()}/${f.marketCode}/rentals/reserved/${reservationToken}`
      : undefined,
  };
}

/* ── Admin ─────────────────────────────────────────────────────────────── */

const holdSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["extend", "release"]),
});

/**
 * Extending or releasing a hold by hand.
 *
 * Both halves are needed by the same person on the same phone call. A
 * customer rings to say they are coming Saturday and the hold runs out
 * Friday — extend it. A customer rings to cancel, or simply never comes —
 * release it, so the car is back on the market now rather than when the
 * timer happens to run out.
 *
 * Extending is from now, not from the existing expiry: the point is "another
 * two days from this conversation", and compounding an expiry that has
 * already been pushed twice is how a car ends up held for a fortnight.
 */
export async function adjustHold(
  _prev: RentalResult | null,
  formData: FormData,
): Promise<RentalResult> {
  const { requireStaff, assertMarketAccess } = await import("@/lib/auth");
  const user = await requireStaff();

  const parsed = holdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Could not read that request." };
  const v = parsed.data;

  const [booking] = await db
    .select()
    .from(rentalBookings)
    .where(eq(rentalBookings.id, v.id));
  if (!booking) return { ok: false, error: "Booking not found." };
  assertMarketAccess(user, booking.marketCode);

  if (booking.status !== "quote") {
    return { ok: false, error: "That booking is already confirmed." };
  }

  if (v.action === "release") {
    await db
      .update(rentalBookings)
      .set({ paymentHoldUntil: null, reservedUntil: null })
      .where(eq(rentalBookings.id, v.id));
    console.log(`[rental] ${user.email} released the hold on ${v.id}`);
    revalidatePath("/admin/rentals");
    revalidatePath(RENTAL_PAGES, "page"); // the dates are open again
    return { ok: true };
  }

  const range = parseTstzRange(booking.period as unknown as string);
  if (!range) return { ok: false, error: "Could not read those dates." };
  // The same rule as a new request: through the pickup day, where the
  // business is. The period starts at the UTC midnight of the pickup date.
  const market = MARKETS[booking.marketCode as keyof typeof MARKETS];
  const until = holdForPickup(range.start.toISOString().slice(0, 10), market.timezone, new Date());
  if (!until) {
    return {
      ok: false,
      error: "The pickup day is nearly over, so the hold can't be extended.",
    };
  }

  try {
    await db
      .update(rentalBookings)
      .set({ paymentHoldUntil: until, reservedUntil: until })
      .where(eq(rentalBookings.id, v.id));
  } catch (e) {
    if (violates(e, "rental_bookings_no_overlap")) {
      // The hold lapsed and somebody else took the dates in the meantime.
      return {
        ok: false,
        error: "Cannot re-hold — another booking now covers those dates.",
      };
    }
    return { ok: false, error: "Could not extend the hold." };
  }

  console.log(`[rental] ${user.email} extended the hold on ${v.id}`);
  revalidatePath("/admin/rentals");
  revalidatePath(RENTAL_PAGES, "page");
  return { ok: true };
}

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
    if (violates(e, "rental_bookings_no_overlap")) {
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
   * A referred booking's commission follows its status: confirmed once the
   * car is back (the agreement's "the rental has completed"), written off
   * with a reason if it is cancelled, and worked out again on any other
   * change — so reopening a cancelled booking brings its commission back.
   *
   * The status has already changed by this point, so a problem here is
   * logged rather than reported as a failed update; the next payment or
   * status change works the commission out again.
   */
  if (booking.referralPartnerId) {
    try {
      await syncRentalEarning(id, status);
    } catch (e) {
      console.error("[rentals] commission not updated for booking", id, e);
    }
  }

  revalidatePath("/admin/rentals");
  revalidatePath("/partner");
  // Confirming, cancelling or closing a booking changes which dates show as
  // taken on the vehicle's public page.
  revalidatePath(RENTAL_PAGES, "page");
  return { ok: true };
}
