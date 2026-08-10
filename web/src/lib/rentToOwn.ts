import { money, type CurrencyCode, type Money } from "./money";
import { quoteRental, type RentalTariff } from "./rental";

/**
 * Rent to own.
 *
 * A customer hires a vehicle; every payment counts toward a threshold, and
 * when the accumulated rent reaches it the vehicle is theirs. The maths has to
 * be exact, because it is the promise the whole offer rests on and the figure
 * a US rental-purchase disclosure is legally required to state.
 *
 * Integer minor units throughout, and every projection is derived from the
 * same `quoteRental` the booking engine charges with — so "yours after 125
 * days" is the same arithmetic the customer will actually be billed, not a
 * marketing approximation that drifts from the invoices.
 */

export interface OwnershipTier {
  slug: string;
  name: string;
  tagline: string | null;
  dailyMinor: number;
  weeklyMinor: number | null;
  monthlyMinor: number | null;
  ownershipThresholdMinor: number | null;
  depositMinor: number;
  currency: CurrencyCode;
}

/** The tier as the booking engine sees it, so both price identically. */
export function tariffFor(tier: OwnershipTier): RentalTariff {
  return {
    dailyMinor: tier.dailyMinor,
    weeklyMinor: tier.weeklyMinor,
    monthlyMinor: tier.monthlyMinor,
    depositMinor: tier.depositMinor,
    currency: tier.currency,
    minDays: 1,
    maxDays: null,
    withDriverAvailable: false,
    driverDailyMinor: null,
  };
}

export interface OwnershipPath {
  /** Hire days needed before the threshold is met. */
  days: number;
  /** What will actually have been paid by then — at or just over the line. */
  totalPaid: Money;
  threshold: Money;
  /** Anything paid beyond the threshold on the final booking. */
  overshoot: Money;
  /** Cheapest achievable cost per day over the whole path. */
  effectiveDailyMinor: number;
}

/**
 * How long until the vehicle is theirs, hiring continuously.
 *
 * Uses the cheapest legitimate combination of monthly, weekly and daily rates
 * for each duration — the same optimisation the booking engine applies — so
 * the answer reflects what a customer would really pay rather than the daily
 * rate multiplied out, which would overstate the cost and understate the time.
 *
 * Cost is non-decreasing in days, so the first day whose cumulative cost
 * reaches the threshold is the answer; found by doubling then bisecting rather
 * than counting up, which matters because a cheap tier against a high
 * threshold can run to thousands of days.
 */
export function pathToOwnership(tier: OwnershipTier): OwnershipPath | null {
  const threshold = tier.ownershipThresholdMinor;
  if (threshold == null || threshold <= 0) return null;

  const tariff = tariffFor(tier);
  // `hireMinor`, deliberately, not the total. Only rent counts toward
  // ownership: a chauffeur fee buys a service, and a deposit is the
  // customer's own money held and returned. Counting either would hand over a
  // vehicle before the agreed amount of rent had actually been paid.
  const costOf = (days: number) => quoteRental(tariff, days).hireMinor;

  // Doubling search for an upper bound. The daily rate is always positive, so
  // this terminates.
  let hi = 1;
  while (costOf(hi) < threshold) {
    hi *= 2;
    // A threshold no amount of hiring reaches would be a configuration error,
    // not a product. Guard rather than loop forever.
    if (hi > 1_000_000) return null;
  }

  let lo = 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (costOf(mid) >= threshold) hi = mid;
    else lo = mid + 1;
  }

  const totalMinor = costOf(lo);
  return {
    days: lo,
    totalPaid: money(totalMinor, tier.currency),
    threshold: money(threshold, tier.currency),
    overshoot: money(totalMinor - threshold, tier.currency),
    effectiveDailyMinor: Math.round(totalMinor / lo),
  };
}

export interface OwnershipProgress {
  paid: Money;
  threshold: Money;
  remaining: Money;
  /** 0–100, clamped. Rounded for display only; never used in arithmetic. */
  percent: number;
  owned: boolean;
}

/**
 * Where a customer stands against the threshold.
 *
 * Ownership is `paid >= threshold`, compared in minor units. Never compare a
 * rounded percentage: at 99.6% displayed as 100 the customer is told the
 * vehicle is theirs while cents remain owed.
 */
export function ownershipProgress(
  paidMinor: number,
  tier: OwnershipTier,
): OwnershipProgress | null {
  const threshold = tier.ownershipThresholdMinor;
  if (threshold == null || threshold <= 0) return null;

  const paid = Math.max(0, paidMinor);
  const owned = paid >= threshold;
  return {
    paid: money(paid, tier.currency),
    threshold: money(threshold, tier.currency),
    remaining: money(Math.max(0, threshold - paid), tier.currency),
    percent: Math.min(100, Math.floor((paid / threshold) * 100)),
    owned,
  };
}

/**
 * The disclosure figures a US rental-purchase agreement has to state.
 *
 * Under state Rental-Purchase Agreement Acts the customer must be told the
 * total of all payments required to acquire ownership before they sign — not
 * just the periodic rate. Deriving it here means the page and the paperwork
 * cannot disagree.
 */
export interface OwnershipDisclosure {
  totalToOwn: Money;
  paymentsDescription: string;
  days: number;
}

export function disclosureFor(
  tier: OwnershipTier,
  locale: string,
  formatMoney: (m: Money, locale: string) => string,
): OwnershipDisclosure | null {
  const path = pathToOwnership(tier);
  if (!path) return null;

  const weeks = Math.floor(path.days / 7);
  const spare = path.days % 7;
  const parts: string[] = [];
  if (weeks > 0) parts.push(`${weeks} week${weeks === 1 ? "" : "s"}`);
  if (spare > 0) parts.push(`${spare} day${spare === 1 ? "" : "s"}`);

  return {
    totalToOwn: path.totalPaid,
    days: path.days,
    paymentsDescription:
      `${formatMoney(path.totalPaid, locale)} in total rent — about ` +
      `${parts.join(" and ")} of continuous hire — transfers ownership.`,
  };
}
