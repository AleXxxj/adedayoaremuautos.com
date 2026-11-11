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

import { endOfLocalDay } from "@/lib/localDate";

/**
 * Whether a request for this pickup date is held, and until when.
 *
 * Through the pickup day, where the business is: the renter comes in some
 * time that day, and the car has to be there when they do. Never longer than
 * the two days, and not at all in the last hour of the pickup day.
 *
 * It used to be held until the start of the pickup date in UTC — 7 PM the
 * evening before in Greensboro — so a next-day pickup booked at 3 PM was
 * held for four hours, one booked after 6 PM not at all, and a same-day
 * pickup never.
 */
export function holdForPickup(pickupDate: string, timeZone: string, now = new Date()): Date | null {
  // A minute before midnight, so the email and the admin screen say "until
  // Thursday at 11:59 PM" rather than "until Friday at 12:00 AM", which reads
  // as a day longer than the hold really lasts.
  const dayEnds = new Date(endOfLocalDay(pickupDate, timeZone).getTime() - 60_000);
  return canReserve(dayEnds, now) ? reservationExpiry(dayEnds, now) : null;
}

/**
 * The hold always ends by the time the rental is over its pickup day.
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

/**
 * The hold a booking returns to when a checkout ends without payment.
 *
 * Opening the payment page may lengthen a hold but never shortens it (see
 * startRentalPayment). When that checkout then fails, expires or is abandoned,
 * the hold goes back to what the customer was promised before they tapped
 * "Pay now": the reservation, if it is still running, and nothing otherwise.
 *
 * Both exits used to clear the hold outright. A customer who reserved for two
 * days, glanced at the payment page and closed it lost the car thirty minutes
 * later, after the confirmation screen had told them nobody else could book
 * those dates.
 *
 * `promised` is the hold to restore: the booking's reservation end when a
 * checkout expires, or the hold as it stood before this attempt when a
 * checkout could not be started.
 */
export function holdAfterCheckout(promised: Date | null, now = new Date()): Date | null {
  return promised && promised.getTime() > now.getTime() ? promised : null;
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
