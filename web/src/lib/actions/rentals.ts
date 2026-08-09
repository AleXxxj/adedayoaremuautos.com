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

export interface RentalResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** Set when the booking succeeded, for the confirmation panel. */
  reference?: string;
}

const schema = z.object({
  marketCode: z.enum(["us", "ng"]),
  vehicleSlug: z.string().trim().min(1),
  from: z.string().min(1, "Choose a pick-up date"),
  to: z.string().min(1, "Choose a return date"),
  withDriver: z.coerce.boolean().default(false),
  name: z.string().trim().min(2, "Please enter your name").max(120),
  phone: z.string().trim().min(7, "Please enter a reachable phone number").max(40),
  email: z.string().trim().email("That email does not look right").optional().or(z.literal("")),
  licenceNo: z.string().trim().max(60).optional(),
  note: z.string().trim().max(2000).optional(),
  website: z.string().max(0).optional(),
  renderedAt: z.coerce.number().optional(),
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
  const raw = Object.fromEntries(formData.entries());
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
  };

  // Price on the server. The figure shown in the browser is a preview.
  let quote;
  try {
    quote = quoteRental(tariff, days, { withDriver: f.withDriver });
  } catch (e) {
    if (e instanceof RentalError) return { ok: false, error: e.message };
    throw e;
  }

  const h = await headers();
  const period = `[${from.toISOString()},${to.toISOString()})`;

  let bookingId = "";
  try {
    const [booking] = await db
      .insert(rentalBookings)
      .values({
        vehicleId: row.v.id,
        marketCode: f.marketCode,
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

  return { ok: true, reference: bookingId.slice(0, 8).toUpperCase() };
}

/* ── Admin ─────────────────────────────────────────────────────────────── */

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

  revalidatePath("/admin/rentals");
  return { ok: true };
}
