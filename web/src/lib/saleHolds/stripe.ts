import "server-only";
import Stripe from "stripe";
import { PaymentError, isTestKey } from "@/lib/payments/provider";
import { CHECKOUT_MINUTES } from "./settings";
import type { HoldStripe, PaidCheckout } from "./core";

/**
 * Stripe's hosted checkout, for a hold's deposit.
 *
 * The same position as the rental payment (src/lib/payments/stripe.ts): the
 * buyer leaves for a page Stripe serves, so no card number reaches this
 * application. It is a separate file because a hold's checkout carries a
 * hold's id, not a booking's, and because the rental code is not this
 * feature's to change.
 *
 * Three calls and no more: open a checkout, read one back, close an unpaid
 * one. There is no refund here on purpose. Returning a deposit is something
 * a member of staff does in Stripe's dashboard.
 */

/** How a session says it belongs to a hold. Read by the webhook to route it. */
export const HOLD_METADATA_KEY = "saleHoldId";

/** "live", "test" or "none": which Stripe key is set, without revealing it. */
export function stripeKeyMode(): "live" | "test" | "none" {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return "none";
  return isTestKey(key) ? "test" : "live";
}

let client: Stripe | null = null;

function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new PaymentError("Card payments are not set up yet.", false);
  client ??= new Stripe(key);
  return client;
}

/** A Stripe checkout session, reduced to what a hold needs to know. */
export function paidCheckoutFrom(session: Stripe.Checkout.Session): PaidCheckout | null {
  const holdId = session.metadata?.[HOLD_METADATA_KEY];
  if (!holdId) return null;
  const intent = session.payment_intent;
  return {
    holdId,
    sessionId: session.id,
    // "complete" alone is not money: only payment_status says it arrived.
    paid: session.payment_status === "paid",
    amountMinor: session.amount_total ?? 0,
    currency: (session.currency ?? "").toUpperCase(),
    paymentRef: typeof intent === "string" ? intent : (intent?.id ?? null),
    livemode: session.livemode,
  };
}

export const holdStripe: HoldStripe = {
  async createCheckout(req) {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      // Cards only, so "paid" is known the moment the buyer returns. A bank
      // debit can take days to clear, and a car cannot be held on a maybe.
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: req.currency.toLowerCase(),
            unit_amount: req.amountMinor,
            product_data: { name: req.description },
          },
        },
      ],
      metadata: { [HOLD_METADATA_KEY]: req.holdId },
      client_reference_id: req.holdId,
      // On the payment too, so staff looking at it in Stripe's dashboard can
      // see what it was for.
      payment_intent_data: {
        description: req.description,
        metadata: { [HOLD_METADATA_KEY]: req.holdId },
      },
      customer_email: req.customerEmail?.trim() || undefined,
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_MINUTES * 60,
    });
    if (!session.url) throw new PaymentError("Stripe did not return a payment page.");
    return { url: session.url, reference: session.id };
  },

  async retrieve(sessionId) {
    return paidCheckoutFrom(await stripe().checkout.sessions.retrieve(sessionId));
  },

  async expire(sessionId) {
    await stripe().checkout.sessions.expire(sessionId);
  },
};

/** Where staff see, and refund, a payment: Stripe's own dashboard. */
export function stripePaymentUrl(paymentRef: string, livemode: boolean | null): string {
  return `https://dashboard.stripe.com/${livemode === false ? "test/" : ""}payments/${encodeURIComponent(paymentRef)}`;
}
