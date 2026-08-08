/**
 * Money is stored and computed in integer minor units (cents, kobo) with an
 * explicit currency. Never floats.
 *
 * This is not pedantry: this system computes loan amortisation and multi-day
 * rental totals. Binary floating point cannot represent 0.1 exactly, so
 * repeated addition drifts. A dealership that is off by a cent per instalment
 * across a 24-month contract has a contract that does not foot.
 */

export type CurrencyCode = "USD" | "NGN";

export interface Money {
  /** Integer. Cents for USD, kobo for NGN. */
  readonly minor: number;
  readonly currency: CurrencyCode;
}

/** Decimal places in the minor unit. Both our currencies use 2. */
const EXPONENT: Record<CurrencyCode, number> = { USD: 2, NGN: 2 };

export function money(minor: number, currency: CurrencyCode): Money {
  if (!Number.isInteger(minor)) {
    throw new TypeError(
      `Money must be integer minor units, received ${minor}. ` +
        `Use fromMajor() to convert from a decimal amount.`,
    );
  }
  return { minor, currency };
}

/** 6_800_000 NGN -> 680_000_000 kobo. Rounds half away from zero. */
export function fromMajor(major: number, currency: CurrencyCode): Money {
  const factor = 10 ** EXPONENT[currency];
  return money(Math.round(major * factor), currency);
}

export function toMajor(m: Money): number {
  return m.minor / 10 ** EXPONENT[m.currency];
}

function assertSame(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    // Guards the exact bug the legacy site shipped: a currency switcher that
    // FX-converted a Lagos price into dollars and presented the result as a
    // purchasable US price. Cross-currency arithmetic is always a mistake here.
    throw new TypeError(`Cannot combine ${a.currency} with ${b.currency}.`);
  }
}

export const add = (a: Money, b: Money): Money => (
  assertSame(a, b), money(a.minor + b.minor, a.currency)
);

export const subtract = (a: Money, b: Money): Money => (
  assertSame(a, b), money(a.minor - b.minor, a.currency)
);

/** Multiply by a scalar (e.g. rental days). Rounds half away from zero. */
export const multiply = (m: Money, factor: number): Money =>
  money(Math.round(m.minor * factor), m.currency);

export const isZero = (m: Money): boolean => m.minor === 0;

/**
 * Format for display. `compact` gives "₦6.8M" / "$18.5K" for dense card grids.
 */
export function formatMoney(
  m: Money,
  locale: string,
  { compact = false, showDecimals }: { compact?: boolean; showDecimals?: boolean } = {},
): string {
  const major = toMajor(m);
  const decimals = showDecimals ?? (m.currency === "USD" && major % 1 !== 0);

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: m.currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : decimals ? 2 : 0,
    minimumFractionDigits: compact ? 0 : decimals ? 2 : 0,
  }).format(major);
}

/**
 * Standard amortised monthly payment.
 *
 *     P = L · i / (1 − (1 + i)^−n)
 *
 * where i is the periodic (monthly) rate and n the term in months.
 * Returns minor units, rounded to the cent.
 */
export function monthlyPayment(
  principal: Money,
  annualRatePercent: number,
  termMonths: number,
): Money {
  if (termMonths <= 0) throw new RangeError("termMonths must be positive");
  if (annualRatePercent < 0) throw new RangeError("rate cannot be negative");

  // Zero-interest plans are common in the Nigerian in-house instalment market.
  if (annualRatePercent === 0) {
    return money(Math.round(principal.minor / termMonths), principal.currency);
  }

  const i = annualRatePercent / 100 / 12;
  const payment = (principal.minor * i) / (1 - Math.pow(1 + i, -termMonths));
  return money(Math.round(payment), principal.currency);
}

/** Total of all payments minus principal — the cost of the credit. */
export function totalInterest(
  principal: Money,
  annualRatePercent: number,
  termMonths: number,
): Money {
  const perMonth = monthlyPayment(principal, annualRatePercent, termMonths);
  return money(perMonth.minor * termMonths - principal.minor, principal.currency);
}
