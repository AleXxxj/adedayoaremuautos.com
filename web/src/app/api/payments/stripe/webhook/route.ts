import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { rentalBookings, rentalPayments } from "@/db/schema";
import { verifyStripeWebhook } from "@/lib/payments/stripe";
import { sendBookingReceipt } from "@/lib/payments/receipt";

export const dynamic = "force-dynamic";

/**
 * Stripe telling us what happened.
 *
 * This is the only thing in the system allowed to mark a booking paid. The
 * page the customer lands on afterwards is not evidence — it is a URL they
 * could type — so it reports what this endpoint has already recorded and
 * never decides anything itself.
 *
 * Two properties this has to have, and both come from how Stripe behaves
 * rather than from good manners:
 *
 *  - Verified against the raw body. Reading the request as JSON and
 *    re-serialising it changes bytes and the signature stops matching, so the
 *    text is taken exactly as sent. Without the check this is a public URL
 *    that confirms bookings on request.
 *  - Idempotent. Stripe delivers the same event more than once by design —
 *    on retry, and on its own schedule — so every write here is written to be
 *    harmless the second time.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ ok: false }, { status: 400 });

  // Must be the unparsed text.
  const raw = await request.text();

  let event;
  try {
    event = verifyStripeWebhook(raw, signature);
  } catch (e) {
    console.error("[payments] stripe signature rejected", e);
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      await markPaid(session.id, session.metadata?.bookingId ?? null);
    } else if (
      event.type === "checkout.session.expired" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      const session = event.data.object;
      await markUnpaid(session.id, session.metadata?.bookingId ?? null);
    }
  } catch (e) {
    // A 500 asks Stripe to retry, which is what we want if our own write
    // failed — better a duplicate delivery than a payment we never recorded.
    console.error("[payments] stripe webhook handling failed", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Records the money and confirms the booking.
 *
 * Confirming is the point: it moves the booking out of quote, which is what
 * the exclusion constraint enforces properly, and releases the temporary hold
 * that was standing in for it.
 */
async function markPaid(sessionId: string, bookingId: string | null) {
  const [payment] = await db
    .update(rentalPayments)
    .set({ status: "paid", paidAt: new Date() })
    .where(
      and(
        eq(rentalPayments.provider, "stripe"),
        eq(rentalPayments.providerRef, sessionId),
      ),
    )
    .returning({ id: rentalPayments.id, bookingId: rentalPayments.bookingId });

  // Fall back to the session metadata: the payment row is written after the
  // session is created, so a webhook that overtakes that write would otherwise
  // find nothing and silently drop a real payment.
  const target = payment?.bookingId ?? bookingId;
  if (!target) {
    console.error("[payments] paid session with no booking", sessionId);
    return;
  }

  const [booking] = await db
    .select({ status: rentalBookings.status })
    .from(rentalBookings)
    .where(eq(rentalBookings.id, target))
    .limit(1);
  if (!booking) return;

  // Already confirmed by an earlier delivery of this same event.
  if (booking.status === "confirmed" || booking.status === "active") {
    await db
      .update(rentalBookings)
      .set({ paymentHoldUntil: null })
      .where(eq(rentalBookings.id, target));
    return;
  }

  try {
    await db
      .update(rentalBookings)
      .set({ status: "confirmed", paymentHoldUntil: null })
      .where(eq(rentalBookings.id, target));
  } catch (e) {
    /*
     * The hold should have made this impossible, so if it happens the business
     * has money for dates it cannot honour and a person must deal with it. The
     * hold is left in place rather than cleared, so the vehicle is not handed
     * to somebody else while that is sorted out.
     */
    console.error(
      `[payments] PAID BUT COULD NOT CONFIRM booking ${target} — needs a refund or new dates`,
      e,
    );
    return;
  }

  console.log(`[payments] booking ${target} paid and confirmed`);

  /*
   * The receipt, outside the try above so a mail problem is never mistaken for
   * a booking that could not be confirmed.
   *
   * Sent from this branch specifically — the one that actually made the
   * transition. Stripe delivers the same event more than once by design, and
   * the early return further up means a repeat finds the booking already
   * confirmed and stops, so the receipt goes exactly once without needing a
   * flag to remember whether it has been sent. It swallows its own failures:
   * throwing here would make Stripe retry the delivery, and that retry would
   * take the already-confirmed path and drop the receipt for good over a
   * momentary mail outage.
   */
  await sendBookingReceipt(target);
}

/** A checkout that expired or failed. The dates go back on the market. */
async function markUnpaid(sessionId: string, bookingId: string | null) {
  const [payment] = await db
    .update(rentalPayments)
    .set({ status: "expired" })
    .where(
      and(
        eq(rentalPayments.provider, "stripe"),
        eq(rentalPayments.providerRef, sessionId),
        eq(rentalPayments.status, "pending"),
      ),
    )
    .returning({ bookingId: rentalPayments.bookingId });

  const target = payment?.bookingId ?? bookingId;
  if (!target) return;

  await db
    .update(rentalBookings)
    .set({ paymentHoldUntil: null })
    .where(and(eq(rentalBookings.id, target), eq(rentalBookings.status, "quote")));
}
