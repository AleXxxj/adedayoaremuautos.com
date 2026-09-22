import "server-only";
import Stripe from "stripe";
import { PaymentError, type CheckoutRequest, type CheckoutSession } from "./provider";

/**
 * Stripe Checkout, for the United States.
 *
 * Hosted checkout rather than an embedded form: the customer leaves for a page
 * Stripe serves, so no card number ever reaches this application. That is the
 * whole PCI position and it is not a detail — a card field on this site would
 * make the business responsible for a compliance regime it has no reason to
 * take on.
 */

let client: Stripe | null = null;

function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new PaymentError("Card payments are not set up yet.", false);
  // The SDK pins its own API version; not overriding it means an upgrade is a
  // deliberate act rather than something that drifts with the account setting.
  client ??= new Stripe(key);
  return client;
}

export async function createStripeCheckout(
  req: CheckoutRequest,
): Promise<CheckoutSession> {
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: req.currency.toLowerCase(),
            // Stripe wants the smallest unit, which is what we store.
            unit_amount: req.amountMinor,
            product_data: { name: req.description },
          },
        },
      ],
      // Both are read back by the webhook. metadata is the one that survives
      // every Stripe object we might later look at, so the booking id lives
      // there rather than only in client_reference_id.
      metadata: { bookingId: req.bookingId },
      client_reference_id: req.bookingId,
      customer_email: req.customerEmail?.trim() || undefined,
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      // Long enough to find a card, short enough that a held vehicle is not
      // held all day. The booking's own hold is set to match.
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    if (!session.url) {
      throw new PaymentError("Stripe did not return a payment page.");
    }
    return { url: session.url, reference: session.id };
  } catch (e) {
    if (e instanceof PaymentError) throw e;
    // Stripe's own messages are written for developers; the customer gets
    // something they can act on and the detail goes to the log.
    console.error("[payments] stripe checkout failed", e);
    throw new PaymentError("We could not start the payment. Please try again.");
  }
}

/**
 * Verifies that a webhook really came from Stripe.
 *
 * The raw body is required — parsing and re-serialising it changes bytes and
 * the signature no longer matches. Without this check the endpoint would be a
 * public URL that marks bookings paid on request.
 */
export function verifyStripeWebhook(rawBody: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new PaymentError("Stripe webhook secret is not set.", false);
  return stripe().webhooks.constructEvent(rawBody, signature, secret);
}

/** Refunds a completed payment, by the session that took it. */
export async function refundStripeSession(sessionId: string): Promise<void> {
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  const intent = session.payment_intent;
  if (!intent) throw new PaymentError("That payment cannot be refunded.", false);
  await stripe().refunds.create({
    payment_intent: typeof intent === "string" ? intent : intent.id,
  });
}
