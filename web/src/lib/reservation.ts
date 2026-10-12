/**
 * How long a car is held for somebody who has not paid.
 *
 * Pure, so the rule can be checked without a database — it decides whether a
 * customer who drives over finds their car waiting, which is the whole point
 * of offering a reservation at all.
 */

/**
 * Two days. Long enough to come and look at the car tomorrow or the day
 * after; short enough that somebody who changes their mind and says nothing
 * has not cost the business a week's hire.
 *
 * Changing this changes what the confirmation page and the email promise, so
 * they read it from here rather than restating it.
 */
export const RESERVATION_HOURS = 48;

/**
 * The hold always ends by the time the hire starts.
 *
 * Holding a car for 48 hours when the customer is collecting it tomorrow
 * morning is nonsense twice over: it outlasts the thing it protects, and it
 * blocks the car for a day after the booking it was protecting has already
 * failed to happen.
 */
export function reservationExpiry(pickup: Date, now = new Date()): Date {
  const fortyEightHours = new Date(now.getTime() + RESERVATION_HOURS * 3_600_000);
  return fortyEightHours < pickup ? fortyEightHours : pickup;
}

/**
 * Whether a reservation is worth offering at all.
 *
 * A hire starting within the hour cannot meaningfully be held "while you come
 * and look" — the customer is already on their way or they are not coming.
 * Below this the booking is still taken; it is simply not dressed up as a
 * reservation with an expiry the business cannot honour.
 */
export const MIN_RESERVATION_MINUTES = 60;

export function canReserve(pickup: Date, now = new Date()): boolean {
  return pickup.getTime() - now.getTime() >= MIN_RESERVATION_MINUTES * 60_000;
}

/** "2 days", "6 hours", "45 minutes" — for a sentence, not a table. */
export function holdRemaining(until: Date, now = new Date()): string {
  const ms = until.getTime() - now.getTime();
  if (ms <= 0) return "expired";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.round(hours / 24)} days`;
}

/**
 * How many cars one person may hold at once without paying.
 *
 * The hold expiring on its own does most of the work, but nothing stops one
 * person reserving the whole fleet for two days from a phone. Two is enough
 * for somebody genuinely choosing between cars and far short of enough to
 * empty the forecourt.
 */
export const MAX_OPEN_RESERVATIONS = 2;
