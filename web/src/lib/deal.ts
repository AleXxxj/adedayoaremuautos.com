import { money, monthlyPayment, type CurrencyCode, type Money } from "./money";
import type { MarketConfig } from "./market";

/**
 * Deal arithmetic — the out-the-door calculation.
 *
 * Every figure is integer minor units. A dealership quotes a monthly payment
 * that a customer signs for over five years; being a cent out per instalment
 * is a contract that does not foot.
 *
 * Percentages are basis points (integer): 3% is 300, 7.9% APR is 790. Storing
 * a rate as a float and multiplying is how rounding drift gets into money.
 */

export interface Fee {
  label: string;
  amountMinor: number;
  /** Whether this fee is itself subject to sales tax. */
  taxable: boolean;
}

export interface DealInput {
  currency: CurrencyCode;
  /** Agreed selling price, not necessarily the list price. */
  vehiclePriceMinor: number;
  /** What we credit the customer for their old vehicle. */
  tradeInAllowanceMinor?: number;
  /** What we must settle with their existing lender. */
  tradeInPayoffMinor?: number;
  downPaymentMinor?: number;
  fees?: Fee[];
  taxRateBps?: number;
  isFinanced?: boolean;
  aprBps?: number;
  termMonths?: number;
  /**
   * Whether a trade-in reduces the taxable amount.
   *
   * In North Carolina and most US states it does — you are taxed on the
   * difference, which can be worth hundreds to the customer and is a genuine
   * reason to trade in rather than sell privately. Getting this wrong
   * overcharges the customer on tax.
   */
  tradeReducesTaxableBase?: boolean;
}

export interface DealBreakdown {
  vehiclePrice: Money;
  feesTotal: Money;
  taxableFees: Money;
  taxableBase: Money;
  tax: Money;
  /** Price + fees + tax, before any credits. */
  outTheDoor: Money;
  tradeInAllowance: Money;
  tradeInPayoff: Money;
  /** Allowance minus payoff. Negative means the customer is upside down. */
  netTradeEquity: Money;
  downPayment: Money;
  /** What remains after down payment and trade equity. */
  amountFinanced: Money;
  monthlyPayment: Money | null;
  totalOfPayments: Money | null;
  financeCharge: Money | null;
  /** True when the trade is worth less than what is owed on it. */
  hasNegativeEquity: boolean;
}

export function computeDeal(input: DealInput): DealBreakdown {
  const c = input.currency;
  const m = (n: number) => money(Math.round(n), c);

  const price = input.vehiclePriceMinor;
  const allowance = input.tradeInAllowanceMinor ?? 0;
  const payoff = input.tradeInPayoffMinor ?? 0;
  const down = input.downPaymentMinor ?? 0;
  const fees = input.fees ?? [];
  const bps = input.taxRateBps ?? 0;

  const feesTotal = fees.reduce((sum, f) => sum + f.amountMinor, 0);
  const taxableFees = fees
    .filter((f) => f.taxable)
    .reduce((sum, f) => sum + f.amountMinor, 0);

  // Trade credit cannot push the taxable base below zero — a trade worth more
  // than the car does not generate a tax refund.
  const taxablePrice = input.tradeReducesTaxableBase
    ? Math.max(0, price - allowance)
    : price;

  const taxableBase = taxablePrice + taxableFees;
  const tax = Math.round((taxableBase * bps) / 10_000);

  const outTheDoor = price + feesTotal + tax;
  const netTradeEquity = allowance - payoff;

  // Negative equity legitimately increases the financed amount — the balance
  // owed on the old car is rolled into the new loan.
  const amountFinanced = Math.max(0, outTheDoor - down - netTradeEquity);

  let payment: Money | null = null;
  let totalOfPayments: Money | null = null;
  let financeCharge: Money | null = null;

  if (input.isFinanced && input.termMonths && input.termMonths > 0) {
    const apr = (input.aprBps ?? 0) / 100; // bps -> percent
    payment = monthlyPayment(m(amountFinanced), apr, input.termMonths);
    totalOfPayments = m(payment.minor * input.termMonths);
    financeCharge = m(totalOfPayments.minor - amountFinanced);
  }

  return {
    vehiclePrice: m(price),
    feesTotal: m(feesTotal),
    taxableFees: m(taxableFees),
    taxableBase: m(taxableBase),
    tax: m(tax),
    outTheDoor: m(outTheDoor),
    tradeInAllowance: m(allowance),
    tradeInPayoff: m(payoff),
    netTradeEquity: m(netTradeEquity),
    downPayment: m(down),
    amountFinanced: m(amountFinanced),
    monthlyPayment: payment,
    totalOfPayments,
    financeCharge,
    hasNegativeEquity: netTradeEquity < 0,
  };
}

/** Default fee lines per market, as a starting point for a new deal. */
export function defaultFees(market: MarketConfig): Fee[] {
  if (market.code === "us") {
    return [
      { label: "Documentation fee", amountMinor: 0, taxable: true },
      { label: "Title & registration", amountMinor: 0, taxable: false },
    ];
  }
  return [
    { label: "Documentation", amountMinor: 0, taxable: false },
    { label: "Registration & plates", amountMinor: 0, taxable: false },
  ];
}

/** Sequential, human-quotable deal reference: AAA-US-2026-0001. */
export function formatDealNumber(
  market: string,
  year: number,
  sequence: number,
): string {
  return `AAA-${market.toUpperCase()}-${year}-${String(sequence).padStart(4, "0")}`;
}
