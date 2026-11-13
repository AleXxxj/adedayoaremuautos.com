import { quoteRental, RentalError, type RentalTariff } from "@/lib/rental";
import type { CurrencyCode } from "@/lib/money";

/**
 * "Keep it another week": the rules, without a database.
 *
 * Pure, so the price a renter is shown, the price staff approve and the price
 * the test suite checks are one calculation. Every figure comes from
 * quoteRental in src/lib/rental.ts; nothing here knows a rate.
 */

/**
 * Off unless the setting says otherwise. The feature writes a request, alerts
 * staff and (with the scheduler) emails renters, so it ships switched off.
 */
export function extensionsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const v = env.RENTAL_EXTENSIONS_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true";
}

/** The most days one request can add. Longer than this is a phone call. */
export const MAX_EXTENSION_DAYS = 28;

/** Requests one booking may file in total, so the link can't be used to pester staff. */
export const MAX_REQUESTS_PER_BOOKING = 6;

/** The reminder goes out this many days before the return date. */
export const REMINDER_DAYS_BEFORE = 2;

/** "2026-11-20" plus n days. Calendar days, counted in UTC like the bookings. */
export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b`, both "YYYY-MM-DD". Negative when b is earlier. */
export function daysBetween(a: string, b: string): number {
  const at = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(b) - at(a)) / 86_400_000);
}

/** What the pricing needs to know about the booking being lengthened. */
export interface ExtendableBooking {
  /** Days the booking covers today. */
  currentDays: number;
  /** What the renter already agreed to pay. Never repriced. */
  totalMinor: number;
  withDriver: boolean;
  /** They chose to be added to the business's policy. */
  injuryCover: boolean;
  /** The daily cover fee as it stood when they booked. */
  injuryCoverDailyMinor: number | null;
}

export interface ExtensionQuote {
  addedDays: number;
  newDays: number;
  /** What the extra days cost. Zero when a longer rate already covered them. */
  addedMinor: number;
  /** The part of `addedMinor` that is injury cover. */
  addedCoverMinor: number;
  /** The booking's total once approved: what was agreed plus `addedMinor`. */
  newTotalMinor: number;
  /**
   * How much less the extra days cost than booking them on their own, when
   * the longer rental reaches a better rate. Zero otherwise.
   */
  savingMinor: number;
  currency: CurrencyCode;
}

/**
 * The price of keeping the car `addedDays` longer.
 *
 * The added cost is the tariff's price for the whole new length minus its
 * price for the current length, both at today's rates. That is what lets the
 * better-rate-for-longer rule work across the join: 3 weeks plus 1 more is
 * priced as the month it has become, not as 3 weeks and a separate week.
 *
 * It is added to the total already agreed, never substituted for it. Rates
 * may have changed since the booking was made, and staff may have agreed a
 * figure by hand; neither is reopened because somebody asked for more days.
 *
 * Throws RentalError (longest rental passed, driver no longer offered) with a
 * sentence fit to show.
 */
export function quoteExtension(
  tariff: RentalTariff,
  booking: ExtendableBooking,
  addedDays: number,
): ExtensionQuote {
  if (!Number.isInteger(addedDays) || addedDays <= 0) {
    throw new RentalError("Choose at least one more day.");
  }
  if (!Number.isInteger(booking.currentDays) || booking.currentDays <= 0) {
    throw new RentalError("This booking's dates could not be read.");
  }

  const opts = { withDriver: booking.withDriver, injuryCover: booking.injuryCover };
  // Cover stays at the fee they were quoted when they bought it.
  const priced: RentalTariff = booking.injuryCover
    ? {
        ...tariff,
        injuryCoverDailyMinor: booking.injuryCoverDailyMinor ?? tariff.injuryCoverDailyMinor,
      }
    : tariff;
  // The shortest-rental rule is about new bookings. A 3-day rental staff
  // agreed to, or 2 extra days, must still be priceable.
  const noMinimum: RentalTariff = { ...priced, minDays: 1 };

  const newDays = booking.currentDays + addedDays;
  // The longest-rental rule does apply, to the whole new length.
  const after = quoteRental(noMinimum, newDays, opts);
  const before = quoteRental({ ...noMinimum, maxDays: null }, booking.currentDays, opts);
  const alone = quoteRental({ ...noMinimum, maxDays: null }, addedDays, opts);

  const addedMinor = Math.max(0, after.totalMinor - before.totalMinor);
  const addedCoverMinor = Math.min(
    addedMinor,
    Math.max(0, after.injuryCoverMinor - before.injuryCoverMinor),
  );

  return {
    addedDays,
    newDays,
    addedMinor,
    addedCoverMinor,
    newTotalMinor: booking.totalMinor + addedMinor,
    savingMinor: Math.max(0, alone.totalMinor - addedMinor),
    currency: tariff.currency,
  };
}

export type ExtendBlock =
  /** Not confirmed yet, finished, or cancelled. */
  | "status"
  /** Another booking starts the day this one ends. */
  | "booked-next"
  /** The tariff's longest rental is already reached. */
  | "longest";

export interface ExtensionWindow {
  /** Fewest days that can be asked for: the new return date must be after today. */
  minDays: number;
  /** Most days that can be asked for. Below `minDays` when nothing can be. */
  maxDays: number;
  block: ExtendBlock | null;
}

/**
 * Which extra days can be asked for at all.
 *
 * `freeDays` is how many days after the current return date the car is free
 * of other bookings (null when nothing follows). It decides what is offered;
 * it does not decide who gets the car. That stays with the database
 * constraint when staff approve.
 */
export function extensionWindow(q: {
  status: string;
  endDate: string;
  today: string;
  currentDays: number;
  tariffMaxDays: number | null;
  freeDays: number | null;
}): ExtensionWindow {
  // An overdue car can still be extended, but only to a date still ahead.
  const minDays = Math.max(1, daysBetween(q.endDate, q.today) + 1);
  if (q.status !== "confirmed" && q.status !== "active") {
    return { minDays, maxDays: 0, block: "status" };
  }

  let maxDays = MAX_EXTENSION_DAYS;
  let block: ExtendBlock | null = null;
  if (q.tariffMaxDays != null && q.tariffMaxDays - q.currentDays < maxDays) {
    maxDays = q.tariffMaxDays - q.currentDays;
    if (maxDays < minDays) block = "longest";
  }
  if (q.freeDays != null && q.freeDays < maxDays) {
    maxDays = Math.max(0, q.freeDays);
    if (maxDays < minDays) block = "booked-next";
  }
  return { minDays, maxDays, block: maxDays < minDays ? (block ?? "booked-next") : null };
}
