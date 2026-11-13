import "server-only";
import type Stripe from "stripe";
import { db } from "@/db";
import type { SaleHold } from "@/db/schema";
import type { LeadNotification } from "@/lib/notify";
import { siteUrl } from "@/lib/siteUrl";
import {
  activateSaleHold,
  closeOtherCheckouts,
  dropUnpaidCheckout,
  ensureHoldLead,
  type ActivateResult,
  type HoldStripe,
  type PaidCheckout,
} from "./core";
import { holdReference } from "./settings";
import { HOLD_METADATA_KEY, paidCheckoutFrom } from "./stripe";

/**
 * What happens when Stripe reports on a hold's checkout.
 *
 * Called by the Stripe webhook route after it has verified the signature,
 * and by the return page with what Stripe's own API said. Both are Stripe
 * speaking; nothing here is ever handed what a browser claimed.
 *
 * It does not look at SALE_HOLD_ENABLED. The switch decides whether a new
 * checkout can start. A buyer who paid a minute before it was turned off
 * has still paid, and dropping that would be losing somebody's money.
 */

export interface HoldEventDeps {
  database?: typeof db;
  /** Tells staff. Captured in tests; never sent from one. */
  notify: (lead: LeadNotification) => Promise<unknown>;
  /** To close other buyers' open checkouts for the same car. */
  stripe?: Pick<HoldStripe, "expire">;
  /** Refreshes the cached car pages. Left out where that is not allowed. */
  revalidate?: (hold: SaleHold) => void;
}

/** Whether a Stripe event is about a hold, not a rental. */
export function isSaleHoldEvent(event: Stripe.Event): boolean {
  if (!event.type.startsWith("checkout.session.")) return false;
  const session = event.data.object as Stripe.Checkout.Session;
  return Boolean(session.metadata?.[HOLD_METADATA_KEY]);
}

/** Routes one verified Stripe event. Throwing asks Stripe to deliver it again. */
export async function handleSaleHoldEvent(
  event: Stripe.Event,
  deps: HoldEventDeps,
): Promise<ActivateResult | null> {
  if (!isSaleHoldEvent(event)) return null;
  const session = event.data.object as Stripe.Checkout.Session;
  const checkout = paidCheckoutFrom(session);
  if (!checkout) return null;

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    return recordPaidHold(checkout, deps);
  }
  if (
    event.type === "checkout.session.expired" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    await dropUnpaidCheckout(checkout.holdId, checkout.sessionId, deps.database ?? db);
  }
  return null;
}

/**
 * A paid checkout, start to finish: the hold, the lead, the alert to staff,
 * and the other buyers' checkouts for the same car.
 *
 * Only the first two can fail the call. Telling staff and tidying up are
 * best effort on top of a hold that is already recorded: a mail outage must
 * not make Stripe redeliver, and must not undo a hold.
 */
export async function recordPaidHold(
  checkout: PaidCheckout,
  deps: HoldEventDeps,
): Promise<ActivateResult> {
  const database = deps.database ?? db;
  const result = await activateSaleHold(checkout, database);
  const hold = result.hold;
  if (!hold || !hold.paidAt) return result;

  const alert = await ensureHoldLead(hold, database);
  if (alert) {
    try {
      await deps.notify({ ...alert, adminUrl: `${siteUrl()}${alert.adminUrl}` });
    } catch (e) {
      console.error(`[sale-hold] staff alert failed for ${holdReference(hold.id)}`, e);
    }
  }

  if (result.outcome === "activated") {
    try {
      for (const ref of await closeOtherCheckouts(hold, database)) {
        await deps.stripe?.expire(ref).catch(() => {});
      }
    } catch (e) {
      console.error("[sale-hold] could not close other checkouts", e);
    }
    console.log(`[sale-hold] ${holdReference(hold.id)} paid and held`);
  }

  try {
    deps.revalidate?.(hold);
  } catch (e) {
    console.error("[sale-hold] revalidate failed", e);
  }
  return result;
}
