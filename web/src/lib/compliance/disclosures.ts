/**
 * Per-market advertising disclosure rules.
 *
 * The rule this encodes: in the US, quoting a monthly payment figure is a
 * "triggering term" under the Truth in Lending Act (Reg Z). Stating "$576/mo"
 * legally obliges disclosing the amount financed, the repayment term, the APR,
 * and the down payment in the same context.
 *
 * The legacy site quoted "₦212,500/mo" across the homepage, listings and detail
 * pages with no disclosure anywhere. Rather than rely on remembering, the
 * payment component cannot render a monthly figure without a disclosure — see
 * components/PaymentDisplay.tsx.
 *
 * This is engineering to reduce risk, not legal advice. The wording below
 * should be reviewed by counsel before launch.
 */

import { formatMoney, type Money } from "../money";
import type { MarketConfig } from "../market";

/** Bump when wording changes, so applications record what the user saw. */
export const DISCLOSURE_VERSION = "2026-08-us-1";

export interface PaymentTerms {
  price: Money;
  downPayment: Money;
  aprPercent: number;
  termMonths: number;
}

export interface Disclosure {
  version: string;
  text: string;
}

/**
 * Returns the disclosure that must accompany a monthly payment figure, or null
 * if this market imposes no such requirement.
 */
export function paymentDisclosure(
  market: MarketConfig,
  terms: PaymentTerms,
): Disclosure | null {
  if (!market.compliance.monthlyPaymentRequiresDisclosure) return null;

  const amountFinanced = formatMoney(terms.price, market.locale);
  const down = formatMoney(terms.downPayment, market.locale);

  return {
    version: DISCLOSURE_VERSION,
    text:
      `Estimated payment based on ${amountFinanced} financed at ` +
      `${terms.aprPercent.toFixed(2)}% APR for ${terms.termMonths} months ` +
      `with ${down} down, on approved credit. This is an estimate, not an ` +
      `offer of credit or a commitment to lend. Actual terms depend on ` +
      `creditworthiness. Tax, title, registration and dealer fees are excluded.`,
  };
}

/**
 * Whether a used vehicle in this market must display an FTC Buyers Guide.
 * Surfaced in the admin so staff know a physical window sticker is required.
 */
export function requiresBuyersGuide(
  market: MarketConfig,
  condition: string,
): boolean {
  return (
    market.compliance.requiresBuyersGuide &&
    condition.toLowerCase() !== "new"
  );
}
