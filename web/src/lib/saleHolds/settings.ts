import type { MarketCode } from "@/lib/market";

/**
 * Holding a car for sale with a refundable deposit: every number and every
 * sentence a buyer agrees to, in one place.
 *
 * FOUNDER TO CONFIRM, all of it. These are placeholders the developer chose
 * so the feature could be built. Nothing here is live until SALE_HOLD_ENABLED
 * is set, and it should not be set until the amount, the time and the four
 * terms have been confirmed by the founder and read by a lawyer.
 *
 * No server-only import: the car page's card (a client component) is handed
 * these as props, and the test suite reads them directly.
 */

/**
 * The deposit, in minor units (cents), per market.
 *
 * FOUNDER TO CONFIRM: $200 in the United States.
 *
 * Nigeria has none, so the card never shows there: card payments in Nigeria
 * go through Paystack, and holds are built on Stripe only.
 */
export const HOLD_DEPOSIT_MINOR: Record<MarketCode, number | null> = {
  us: 200_00,
  ng: null,
};

/** FOUNDER TO CONFIRM: how long a paid deposit holds the car. */
export const HOLD_HOURS = 48;

/**
 * Changes whenever a term below changes, so each hold records which wording
 * its buyer agreed to.
 */
export const HOLD_TERMS_VERSION = "2026-11-draft";

/**
 * How long Stripe keeps the payment page open. Thirty minutes is the
 * shortest Stripe allows; the extra minute keeps a slow request from landing
 * under it.
 */
export const CHECKOUT_MINUTES = 31;

/**
 * The terms, in plain words: four short lines, each one thing.
 *
 * FOUNDER AND LAWYER TO CONFIRM, sentence by sentence. `amount` and `hours`
 * are filled in from the settings above, never typed.
 */
export function holdTerms(amount: string, hours: number = HOLD_HOURS): string[] {
  return [
    `Fully refundable. Change your mind, or find the car isn't as described, and you get your ${amount} back.`,
    `If you buy the car, the ${amount} comes off the price.`,
    `The hold lasts ${hours} hours and ends at the time shown after you pay.`,
    "One hold per car. While it runs, we don't sell the car to anyone else.",
  ];
}

/** The switch. Off unless SALE_HOLD_ENABLED is exactly 1 or true. */
export function saleHoldEnabled(): boolean {
  const v = process.env.SALE_HOLD_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true";
}

/** What a buyer and staff quote to each other. Same shape as a rental's. */
export function holdReference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/** "Sun, Nov 15, 3:42 PM EST": the end of a hold, on the dealership's clock. */
export function formatHoldEnd(at: Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(at);
}

/** "31 hr left", "40 min left": for the admin, from the server's clock. */
export function timeLeft(until: Date, now: Date = new Date()): string {
  const mins = Math.max(0, Math.floor((until.getTime() - now.getTime()) / 60_000));
  if (mins < 60) return `${mins} min left`;
  return `${Math.floor(mins / 60)} hr left`;
}
