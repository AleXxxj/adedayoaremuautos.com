"use server";

import Stripe from "stripe";
import { requireStaff } from "@/lib/auth";
import { isTestKey, providerConfigured } from "@/lib/payments/provider";
import { siteUrl } from "@/lib/siteUrl";

/** The events src/app/api/payments/stripe/webhook/route.ts acts on. */
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.expired",
  "checkout.session.async_payment_failed",
];

/**
 * Everything going live takes, in order.
 *
 * The live key alone is not enough, and saying it was would be worse than
 * saying nothing: Stripe signs live events with a different secret, and only
 * sends them to an endpoint created in live mode. With just the key swapped,
 * a customer's card is charged and the booking never confirms. The address
 * must be the one the site actually answers on — Stripe does not follow the
 * redirect from the bare domain to www.
 */
function goLiveSteps(): string {
  return (
    "To take real cards: (1) finish activating the Stripe account; " +
    `(2) in Stripe's live mode, add a webhook endpoint for exactly ${siteUrl()}/api/payments/stripe/webhook ` +
    `with the events ${WEBHOOK_EVENTS.join(", ")}; ` +
    "(3) in Vercel, set STRIPE_SECRET_KEY to the live secret key (it starts sk_live_) and STRIPE_WEBHOOK_SECRET to that endpoint's signing secret (it starts whsec_); " +
    "(4) redeploy, then run this check again."
  );
}

/**
 * Whether Stripe will actually tell us about live payments.
 *
 * Asked of Stripe rather than inferred: a live key lists the live-mode
 * endpoints, so a missing or disabled one, or one missing an event, shows up
 * here instead of as a paid booking that never confirmed. The signing secret
 * itself cannot be read back from Stripe, so that part stays a reminder.
 */
async function liveWebhookRow(stripe: Stripe): Promise<PaymentCheckRow & { ready: boolean }> {
  const url = `${siteUrl()}/api/payments/stripe/webhook`;
  try {
    const { data } = await stripe.webhookEndpoints.list({ limit: 100 });
    const endpoint = data.find((e) => e.url === url && e.status === "enabled");
    if (!endpoint) {
      return {
        label: "Stripe live webhook",
        state: "bad",
        ready: false,
        detail: `No enabled live endpoint for ${url}. Without one, customers are charged but bookings never confirm. ${goLiveSteps()}`,
      };
    }
    const missing = WEBHOOK_EVENTS.filter(
      (n) => !endpoint.enabled_events.includes("*") && !endpoint.enabled_events.includes(n as never),
    );
    if (missing.length) {
      return {
        label: "Stripe live webhook",
        state: "bad",
        ready: false,
        detail: `The live endpoint does not send ${missing.join(", ")}. Add them in Stripe.`,
      };
    }
    return {
      label: "Stripe live webhook",
      state: "ok",
      ready: true,
      detail: `Set up for ${url}. STRIPE_WEBHOOK_SECRET must be this endpoint's signing secret.`,
    };
  } catch (e) {
    return {
      label: "Stripe live webhook",
      state: "bad",
      ready: false,
      detail: `Could not ask Stripe about webhook endpoints: ${e instanceof Error ? e.message.slice(0, 120) : "unknown error"}`,
    };
  }
}

export interface PaymentCheckRow {
  label: string;
  /** "ok" | "missing" | "bad" */
  state: "ok" | "missing" | "bad";
  detail: string;
}

export interface PaymentCheckResult {
  usReady: boolean;
  ngReady: boolean;
  rows: PaymentCheckRow[];
}

/**
 * Whether card payments are actually working, per market.
 *
 * The customer-facing failure is quiet by design: with no keys the pay button
 * simply does not appear, and a visitor cannot tell the difference between
 * "this business does not take cards" and "this is broken". So the business
 * needs to be able to ask directly — the same reasoning as the lead-alert,
 * assistant and notification checks.
 *
 * The secret key is tested by using it, not by measuring it. A key can be the
 * right length and shape and still be revoked, from the wrong account, or a
 * live key pasted into a sandbox slot; the only way to know it works is to ask
 * Stripe something. Retrieving the account balance is read-only, moves no
 * money, and fails loudly when the key is wrong.
 */
export async function checkPaymentSetup(): Promise<PaymentCheckResult> {
  await requireStaff();

  const rows: PaymentCheckRow[] = [];

  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const paystackKey = process.env.PAYSTACK_SECRET_KEY?.trim();

  let stripeKeyOk = false;
  // Only asked when the key is live; a sandbox key needs no live endpoint.
  let liveWebhookReady = true;
  if (!stripeKey) {
    rows.push({
      label: "Stripe secret key",
      state: "missing",
      detail: "Not set. Add STRIPE_SECRET_KEY in Vercel and redeploy.",
    });
  } else {
    try {
      const stripe = new Stripe(stripeKey);
      const balance = await stripe.balance.retrieve();
      // A sandbox key on the live site works, in the sense that Stripe
      // answers, but it cannot take a real customer's card. providerConfigured
      // hides "Pay now" in that case, so say why here rather than leave the
      // owner wondering where the button went.
      const sandboxOnLiveSite =
        !balance.livemode && process.env.VERCEL_ENV === "production";
      stripeKeyOk = !sandboxOnLiveSite;
      rows.push(
        sandboxOnLiveSite
          ? {
              label: "Stripe secret key",
              state: "bad",
              detail: `This is a test key on the live site. Test checkout turns down every real card, so customers are not shown Pay now. ${goLiveSteps()}`,
            }
          : {
              label: "Stripe secret key",
              state: "ok",
              detail: `Working${balance.livemode ? " — LIVE account, real money" : " — sandbox, test money only"}.`,
            },
      );
      if (balance.livemode) {
        const { ready, ...row } = await liveWebhookRow(stripe);
        liveWebhookReady = ready;
        rows.push(row);
      }
    } catch (e) {
      rows.push({
        label: "Stripe secret key",
        state: "bad",
        detail: `Stripe rejected it: ${e instanceof Error ? e.message.slice(0, 120) : "unknown error"}`,
      });
    }
  }

  // There is no way to test a webhook secret without a real event to verify,
  // so this reports presence and shape only, and says so rather than implying
  // more confidence than it has.
  if (!webhookSecret) {
    rows.push({
      label: "Stripe webhook secret",
      state: "missing",
      detail:
        "Not set. Without it a customer's card is charged but the booking is never confirmed.",
    });
  } else if (!webhookSecret.startsWith("whsec_")) {
    rows.push({
      label: "Stripe webhook secret",
      state: "bad",
      detail: "Set, but does not look like a signing secret — those start with whsec_.",
    });
  } else {
    rows.push({
      label: "Stripe webhook secret",
      state: "ok",
      detail: "Set. Confirmed working the first time a real payment completes.",
    });
  }

  // The same rule the site applies (providerConfigured): a test key on the
  // live site counts as no key, so the check must not call it ready either.
  const paystackTestOnLiveSite =
    Boolean(paystackKey) && isTestKey(paystackKey!) && process.env.VERCEL_ENV === "production";
  rows.push(
    !paystackKey
      ? {
          label: "Paystack secret key",
          state: "missing",
          detail: "Not set. Nigerian bookings cannot be paid online yet.",
        }
      : paystackTestOnLiveSite
        ? {
            label: "Paystack secret key",
            state: "bad",
            detail:
              "This is a Paystack test key on the live site, so Nigerian customers are not shown Pay now. Put the live secret key (it starts sk_live_) in Vercel and redeploy.",
          }
        : { label: "Paystack secret key", state: "ok", detail: "Set — Nigeria can take payments." },
  );

  return {
    usReady:
      stripeKeyOk && liveWebhookReady && Boolean(webhookSecret?.startsWith("whsec_")),
    ngReady: providerConfigured("paystack"),
    rows,
  };
}
