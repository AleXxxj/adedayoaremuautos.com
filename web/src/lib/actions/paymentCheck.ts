"use server";

import Stripe from "stripe";
import { requireStaff } from "@/lib/auth";

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
  if (!stripeKey) {
    rows.push({
      label: "Stripe secret key",
      state: "missing",
      detail: "Not set. Add STRIPE_SECRET_KEY in Vercel and redeploy.",
    });
  } else {
    try {
      const balance = await new Stripe(stripeKey).balance.retrieve();
      stripeKeyOk = true;
      rows.push({
        label: "Stripe secret key",
        state: "ok",
        detail: `Working${balance.livemode ? " — LIVE account, real money" : " — sandbox, test money only"}.`,
      });
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

  rows.push(
    paystackKey
      ? { label: "Paystack secret key", state: "ok", detail: "Set — Nigeria can take payments." }
      : {
          label: "Paystack secret key",
          state: "missing",
          detail: "Not set. Nigerian bookings cannot be paid online yet.",
        },
  );

  return {
    usReady: stripeKeyOk && Boolean(webhookSecret?.startsWith("whsec_")),
    ngReady: Boolean(paystackKey),
    rows,
  };
}
