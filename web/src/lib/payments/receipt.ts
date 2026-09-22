import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rentalBookings, vehicles } from "@/db/schema";
import { MARKETS, type MarketCode } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import { parseTstzRange } from "@/lib/pgRange";
import { rentalDays } from "@/lib/rental";
import { listLocations, formatPhone } from "@/lib/repositories/locations";
import { siteUrl } from "@/lib/siteUrl";
import { sendBookingPaidEmail } from "@/lib/mail/bookingPaid";

/**
 * Gathers what a receipt needs and sends it.
 *
 * Kept apart from the webhook so that route stays about Stripe and this stays
 * about the customer. Every failure is swallowed: the payment is already
 * recorded and the booking already confirmed by the time this runs, so nothing
 * here is allowed to unwind either.
 */
export async function sendBookingReceipt(bookingId: string): Promise<void> {
  try {
    const [row] = await db
      .select({ b: rentalBookings, v: vehicles })
      .from(rentalBookings)
      .leftJoin(vehicles, eq(vehicles.id, rentalBookings.vehicleId))
      .where(eq(rentalBookings.id, bookingId))
      .limit(1);

    if (!row) return;
    const { b, v } = row;

    // Email is optional on the booking form and that is deliberate — plenty of
    // customers give only a phone number. No address, no receipt, no fuss.
    if (!b.customerEmail?.trim()) return;

    const market = b.marketCode as MarketCode;
    const cfg = MARKETS[market];
    const fmt = (minor: number) => formatMoney(money(minor, cfg.currency), cfg.locale);

    const range = parseTstzRange(b.period as unknown as string);
    const dateFmt = new Intl.DateTimeFormat(cfg.locale, {
      dateStyle: "long",
      // The booked window is a set of calendar days, not an instant. Rendering
      // it in the server's zone would shift a date across midnight and tell
      // somebody their car is ready a day early.
      timeZone: "UTC",
    });

    const sites = await listLocations(market);
    const site = sites[0];
    const address = site
      ? [site.addressLine1, site.city, site.region, site.postalCode].filter(Boolean).join(", ")
      : null;

    await sendBookingPaidEmail({
      customerName: b.customerName,
      customerEmail: b.customerEmail.trim(),
      reference: bookingId.slice(0, 8).toUpperCase(),
      vehicle: v ? [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ") : "Your vehicle",
      startLabel: range ? dateFmt.format(range.start) : "—",
      endLabel: range ? dateFmt.format(range.end) : "—",
      days: range ? rentalDays(range.start, range.end) : 0,
      amountPaid: fmt(b.totalMinor),
      depositDue: b.depositMinor > 0 ? fmt(b.depositMinor) : null,
      pickupLocation: b.pickupLocation || address,
      businessPhone: site?.phone ? formatPhone(site.phone) : null,
      bookingUrl: `${siteUrl()}/${market}/rentals`,
    });

    console.log(`[payments] receipt sent for booking ${bookingId}`);
  } catch (e) {
    console.error(`[payments] receipt for ${bookingId} failed`, e);
  }
}
