"use server";

import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { rentalBookings, rentalPayments, vehicles } from "@/db/schema";
import { MARKETS, isMarketCode, type MarketCode } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import { siteUrl } from "@/lib/siteUrl";
import { parseTstzRange } from "@/lib/pgRange";
import {
  PaymentError,
  providerFor,
  providerConfigured,
  checkoutRequirements,
} from "@/lib/payments/provider";
import { createStripeCheckout } from "@/lib/payments/stripe";
import { createPaystackCheckout } from "@/lib/payments/paystack";

export interface StartPaymentResult {
  ok: boolean;
  /** Where to send the customer. The client navigates to it. */
  url?: string;
  error?: string;
}

/** How long a customer has at the checkout before the dates are released. */
const HOLD_MINUTES = 30;

/**
 * Releases holds that have run out.
 *
 * Lazy rather than scheduled. A hold only matters when somebody else wants
 * those dates, and that is exactly when this runs — so a cron job to sweep
 * them would be a moving part earning nothing. Cheap, indexed, and it means
 * an abandoned checkout cannot block a vehicle indefinitely.
 */
async function releaseExpiredHolds(): Promise<void> {
  await db
    .update(rentalBookings)
    .set({ paymentHoldUntil: null })
    .where(
      and(
        eq(rentalBookings.status, "quote"),
        isNotNull(rentalBookings.paymentHoldUntil),
        lt(rentalBookings.paymentHoldUntil, new Date()),
      ),
    );

  // The attempts behind those holds are dead too, and a row left "pending"
  // forever is a payment nobody can account for.
  await db
    .update(rentalPayments)
    .set({ status: "expired" })
    .where(
      and(
        eq(rentalPayments.status, "pending"),
        lt(rentalPayments.createdAt, new Date(Date.now() - HOLD_MINUTES * 60_000)),
      ),
    );
}

/**
 * Starts a card payment for a booking that has already been requested.
 *
 * Deliberately a second step rather than part of the booking form. Paying is
 * optional — a customer who would rather be called back still gets a booking —
 * and splitting it means the request is safely recorded before anybody is sent
 * away to a payment page. Someone who abandons the checkout has still made an
 * enquiry the business can act on.
 *
 * Only the hire charge is taken. The refundable deposit is collected at
 * pickup, where damage can actually be assessed, and where a disagreement is a
 * conversation rather than a card chargeback.
 */
export async function startRentalPayment(
  _prev: StartPaymentResult | null,
  formData: FormData,
): Promise<StartPaymentResult> {
  const bookingId = String(formData.get("bookingId") ?? "").trim();
  if (!bookingId) return { ok: false, error: "Missing booking." };

  await releaseExpiredHolds();

  const [row] = await db
    .select({ b: rentalBookings, v: vehicles })
    .from(rentalBookings)
    .leftJoin(vehicles, eq(vehicles.id, rentalBookings.vehicleId))
    .where(eq(rentalBookings.id, bookingId))
    .limit(1);

  if (!row) return { ok: false, error: "We could not find that booking." };
  const { b, v } = row;

  if (b.status === "confirmed" || b.status === "active") {
    return { ok: false, error: "This booking is already confirmed — nothing to pay." };
  }
  if (b.status !== "quote") {
    return { ok: false, error: "This booking can no longer be paid for online." };
  }
  if (!isMarketCode(b.marketCode)) return { ok: false, error: "Unknown market." };

  const market = b.marketCode as MarketCode;
  const provider = providerFor(market);
  if (!providerConfigured(provider)) {
    return { ok: false, error: "Online payment is not available yet. We will call you." };
  }

  const missing = checkoutRequirements(market, b.customerEmail);
  if (missing) return { ok: false, error: missing };

  const cfg = MARKETS[market];
  const range = parseTstzRange(b.period as unknown as string);
  const dates = range
    ? `${range.start.toISOString().slice(0, 10)} to ${range.end.toISOString().slice(0, 10)}`
    : "";
  const label = v ? [v.year, v.make, v.model].filter(Boolean).join(" ") : "Vehicle rental";
  const description = `${label}${dates ? ` · ${dates}` : ""}`;

  /*
   * Take the hold before creating the checkout, not after.
   *
   * This write is what the exclusion constraint watches, so if the dates went
   * to somebody else while this customer was deciding, it fails here — before
   * a payment page exists and before any money moves. Doing it the other way
   * round would mean discovering the clash with a paid card in hand.
   */
  const holdUntil = new Date(Date.now() + HOLD_MINUTES * 60_000);
  try {
    await db
      .update(rentalBookings)
      .set({ paymentHoldUntil: holdUntil })
      .where(eq(rentalBookings.id, bookingId));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("rental_bookings_no_overlap")) {
      return {
        ok: false,
        error:
          "Those dates have just been taken for this vehicle. Please choose another window — nothing has been charged.",
      };
    }
    console.error("[payments] hold failed", e);
    return { ok: false, error: "We could not start the payment. Please try again." };
  }

  const base = siteUrl();
  try {
    const request = {
      bookingId,
      market,
      amountMinor: b.totalMinor,
      currency: cfg.currency,
      description,
      customerEmail: b.customerEmail,
      successUrl: `${base}/${market}/rentals/paid?booking=${bookingId}`,
      cancelUrl: `${base}/${market}/rentals?payment=cancelled`,
    };

    const session =
      provider === "stripe"
        ? await createStripeCheckout(request)
        : await createPaystackCheckout(request);

    await db.insert(rentalPayments).values({
      bookingId,
      marketCode: market,
      provider,
      providerRef: session.reference,
      amountMinor: b.totalMinor,
      currency: cfg.currency,
      status: "pending",
    });

    console.log(
      `[payments] ${provider} checkout for ${bookingId} — ${formatMoney(money(b.totalMinor, cfg.currency), cfg.locale)}`,
    );

    return { ok: true, url: session.url };
  } catch (e) {
    // The hold only exists to protect a payment that is about to happen. If
    // one cannot be started, holding the vehicle would keep it off the market
    // for half an hour for nothing.
    await db
      .update(rentalBookings)
      .set({ paymentHoldUntil: null })
      .where(eq(rentalBookings.id, bookingId));

    if (e instanceof PaymentError) return { ok: false, error: e.message };
    console.error("[payments] checkout failed", e);
    return { ok: false, error: "We could not start the payment. Please try again." };
  }
}

/** Whether a market can take card payments at all, for hiding the button. */
export async function paymentAvailable(market: string): Promise<boolean> {
  if (!isMarketCode(market)) return false;
  return providerConfigured(providerFor(market as MarketCode));
}

/** What a customer sees on the confirmation page after returning. */
export async function paymentStateFor(
  bookingId: string,
): Promise<{ status: string; reference: string; amount: string } | null> {
  if (!bookingId) return null;
  const [row] = await db
    .select({ b: rentalBookings })
    .from(rentalBookings)
    .where(eq(rentalBookings.id, bookingId))
    .limit(1);
  if (!row) return null;

  const cfg = MARKETS[row.b.marketCode as MarketCode];
  const [paid] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rentalPayments)
    .where(and(eq(rentalPayments.bookingId, bookingId), eq(rentalPayments.status, "paid")));

  return {
    status: (paid?.n ?? 0) > 0 ? "paid" : row.b.status,
    reference: bookingId.slice(0, 8).toUpperCase(),
    amount: formatMoney(money(row.b.totalMinor, cfg.currency), cfg.locale),
  };
}
