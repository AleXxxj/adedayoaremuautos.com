import { money, type CurrencyCode, type Money } from "./money";

/**
 * Rental pricing across daily, weekly and monthly tiers.
 *
 * The naive approach — take whole months, then whole weeks, then days — is
 * wrong, and wrong in the direction that overcharges. A six-day hire priced at
 * six daily rates can easily cost more than one weekly rate. A customer who
 * works that out has been quoted a worse price than the tariff allows, which is
 * exactly the sort of thing that ends up in a review.
 *
 * So this solves it properly: the cheapest combination of tiers that covers at
 * least the requested duration, allowing deliberate overshoot where a longer
 * tier is cheaper. Small dynamic program over days — exact, not greedy.
 */

export interface RentalTariff {
  dailyMinor: number;
  weeklyMinor: number | null;
  monthlyMinor: number | null;
  depositMinor: number;
  currency: CurrencyCode;
  minDays: number;
  maxDays: number | null;
  withDriverAvailable: boolean;
  driverDailyMinor: number | null;
}

export interface RentalQuoteLine {
  /** "monthly" | "weekly" | "daily" */
  tier: "monthly" | "weekly" | "daily";
  quantity: number;
  unitMinor: number;
  subtotalMinor: number;
  /** Days this line covers. */
  days: number;
}

export interface RentalQuote {
  days: number;
  lines: RentalQuoteLine[];
  hireMinor: number;
  driverMinor: number;
  subtotalMinor: number;
  depositMinor: number;
  /** Hire + driver. The deposit is refundable and is quoted separately. */
  totalMinor: number;
  currency: CurrencyCode;
  /** Days actually charged, which may exceed `days` when a longer tier is cheaper. */
  chargedDays: number;
  /** Set when a longer tier undercut the exact-days price. */
  savingNote: string | null;
}

export class RentalError extends Error {}

const DAYS_IN_WEEK = 7;
const DAYS_IN_MONTH = 30;

/** Whole days between two dates, rounded up — any part of a day is a day. */
export function rentalDays(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

export function quoteRental(
  tariff: RentalTariff,
  days: number,
  opts: { withDriver?: boolean } = {},
): RentalQuote {
  if (!Number.isInteger(days) || days <= 0) {
    throw new RentalError("Choose at least one day.");
  }
  if (days < tariff.minDays) {
    throw new RentalError(`Minimum hire is ${tariff.minDays} day${tariff.minDays === 1 ? "" : "s"}.`);
  }
  if (tariff.maxDays && days > tariff.maxDays) {
    throw new RentalError(`Maximum hire is ${tariff.maxDays} days.`);
  }
  if (opts.withDriver && !tariff.withDriverAvailable) {
    throw new RentalError("A driver is not available for this vehicle.");
  }

  // best[i] = cheapest way to cover at least i days.
  const best: number[] = new Array(days + 1).fill(Number.POSITIVE_INFINITY);
  const choice: ("daily" | "weekly" | "monthly" | null)[] = new Array(days + 1).fill(null);
  best[0] = 0;

  for (let i = 1; i <= days; i++) {
    const daily = best[Math.max(0, i - 1)] + tariff.dailyMinor;
    if (daily < best[i]) {
      best[i] = daily;
      choice[i] = "daily";
    }
    if (tariff.weeklyMinor != null) {
      const w = best[Math.max(0, i - DAYS_IN_WEEK)] + tariff.weeklyMinor;
      if (w < best[i]) {
        best[i] = w;
        choice[i] = "weekly";
      }
    }
    if (tariff.monthlyMinor != null) {
      const m = best[Math.max(0, i - DAYS_IN_MONTH)] + tariff.monthlyMinor;
      if (m < best[i]) {
        best[i] = m;
        choice[i] = "monthly";
      }
    }
  }

  // Walk the choices back into countable lines.
  const counts = { monthly: 0, weekly: 0, daily: 0 };
  let cursor = days;
  while (cursor > 0) {
    const pick = choice[cursor];
    if (!pick) break;
    counts[pick]++;
    cursor = Math.max(
      0,
      cursor - (pick === "monthly" ? DAYS_IN_MONTH : pick === "weekly" ? DAYS_IN_WEEK : 1),
    );
  }

  const lines: RentalQuoteLine[] = [];
  if (counts.monthly) {
    lines.push({
      tier: "monthly",
      quantity: counts.monthly,
      unitMinor: tariff.monthlyMinor!,
      subtotalMinor: counts.monthly * tariff.monthlyMinor!,
      days: counts.monthly * DAYS_IN_MONTH,
    });
  }
  if (counts.weekly) {
    lines.push({
      tier: "weekly",
      quantity: counts.weekly,
      unitMinor: tariff.weeklyMinor!,
      subtotalMinor: counts.weekly * tariff.weeklyMinor!,
      days: counts.weekly * DAYS_IN_WEEK,
    });
  }
  if (counts.daily) {
    lines.push({
      tier: "daily",
      quantity: counts.daily,
      unitMinor: tariff.dailyMinor,
      subtotalMinor: counts.daily * tariff.dailyMinor,
      days: counts.daily,
    });
  }

  const hireMinor = lines.reduce((s, l) => s + l.subtotalMinor, 0);
  const chargedDays = lines.reduce((s, l) => s + l.days, 0);
  const driverMinor = opts.withDriver ? (tariff.driverDailyMinor ?? 0) * days : 0;
  const subtotalMinor = hireMinor + driverMinor;

  const atDailyRate = days * tariff.dailyMinor;
  const savingNote =
    hireMinor < atDailyRate
      ? `Priced on the ${lines[0].tier} rate — cheaper than ${days} days at the daily rate.`
      : null;

  return {
    days,
    lines,
    hireMinor,
    driverMinor,
    subtotalMinor,
    depositMinor: tariff.depositMinor,
    totalMinor: subtotalMinor,
    currency: tariff.currency,
    chargedDays,
    savingNote,
  };
}

export const asMoney = (minor: number, currency: CurrencyCode): Money =>
  money(minor, currency);
