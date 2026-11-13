import "server-only";
import { MARKETS, type MarketCode } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import { holdDepositFor, sweepSaleHolds } from "./core";
import { HOLD_HOURS, holdTerms, saleHoldEnabled } from "./settings";
import { stripeKeyMode } from "./stripe";

/** What the car page's card needs, already worded and formatted. */
export interface SaleHoldOffer {
  /** "$200" */
  amount: string;
  hours: number;
  terms: string[];
  /** Stripe has a test key: the card says so and only staff can use it. */
  testMode: boolean;
}

/**
 * Whether this car's page shows "Hold this car", and with what.
 *
 * Null, and so no card at all, when the switch is off, Stripe has no key,
 * the market has no deposit, or the car is not on sale right now.
 */
export function saleHoldOffer(
  market: MarketCode,
  v: { status: string; listingKind: string; priceMinor: number | null },
): SaleHoldOffer | null {
  if (!saleHoldEnabled()) return null;
  const mode = stripeKeyMode();
  if (mode === "none") return null;
  const deposit = holdDepositFor(market, v);
  if (!deposit) return null;

  const cfg = MARKETS[market];
  const amount = formatMoney(money(deposit, cfg.currency), cfg.locale);
  return { amount, hours: HOLD_HOURS, terms: holdTerms(amount), testMode: mode === "test" };
}

/**
 * For pages that show whether a car is on hold: ends any hold whose time is
 * up before the car is read, so it comes back as available. Does nothing,
 * and asks the database nothing, while the switch is off.
 */
export async function refreshSaleHolds(): Promise<void> {
  if (saleHoldEnabled()) await sweepSaleHolds();
}
