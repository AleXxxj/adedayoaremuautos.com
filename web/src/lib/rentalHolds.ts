import "server-only";
import { and, eq, gt, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { rentalBookings, rentalPayments } from "@/db/schema";
import { violates } from "@/lib/dbError";
import { phoneDigitsKey, phoneKeySql } from "@/lib/phoneKey";

/** How long a customer has at the checkout before the dates are released. */
export const HOLD_MINUTES = 30;

/**
 * Releases holds that have run out.
 *
 * Lazy rather than scheduled. A hold only matters when somebody else wants
 * those dates, and that is exactly when this runs — so a cron job to sweep
 * them would be a moving part earning nothing. Cheap, indexed, and it means
 * neither an abandoned checkout nor a reservation nobody came back for can
 * block a vehicle indefinitely.
 *
 * Shared, and server-only rather than exported from an action file: every
 * export of a `"use server"` module is an endpoint a stranger can call, and a
 * database sweep is not something to leave on the open web for no reason.
 *
 * It has to run everywhere availability is decided. It was called only when a
 * payment started, which was enough while a hold lasted thirty minutes and
 * nothing else set one; now that an ordinary request holds the car for two
 * days, an unswept expired hold would have the constraint refuse dates that
 * are in fact free.
 */
export async function releaseExpiredHolds(): Promise<void> {
  const now = new Date();

  await db
    .update(rentalBookings)
    // `reservedUntil` is cleared with it. It is what the customer was
    // promised rather than what the constraint reads, so leaving it set on a
    // released booking would have the admin showing a car as held that
    // anybody can now book.
    .set({ paymentHoldUntil: null, reservedUntil: null })
    .where(
      and(
        eq(rentalBookings.status, "quote"),
        isNotNull(rentalBookings.paymentHoldUntil),
        lt(rentalBookings.paymentHoldUntil, now),
      ),
    );

  // The attempts behind those holds are dead too, and a row left "pending"
  // forever is a payment nobody can account for.
  await db
    .update(rentalPayments)
    .set({ status: "expired" })
    .where(
      and(
        eq(rentalPayments.status, "pending"),
        lt(rentalPayments.createdAt, new Date(now.getTime() - HOLD_MINUTES * 60_000)),
      ),
    );
}

/**
 * A reservation this person already holds for exactly this car and these
 * dates — what a retry after a lost reply looks like.
 *
 * Matched on the phone's digits (see src/lib/phoneKey.ts), the vehicle, the
 * exact period, and a hold that is still running. All four, so it can only
 * ever find the caller's own booking: a different number, car or date range,
 * or a hold that has lapsed, finds nothing and the request proceeds as new.
 */
export async function findOwnHold(
  q: { vehicleId: string; period: string; phone: string },
  database: typeof db = db,
) {
  const key = phoneDigitsKey(q.phone);
  if (!key) return null;
  const [row] = await database
    .select({
      id: rentalBookings.id,
      totalMinor: rentalBookings.totalMinor,
      currency: rentalBookings.currency,
      heldUntil: rentalBookings.paymentHoldUntil,
    })
    .from(rentalBookings)
    .where(
      and(
        eq(rentalBookings.vehicleId, q.vehicleId),
        eq(rentalBookings.status, "quote"),
        gt(rentalBookings.paymentHoldUntil, new Date()),
        sql`${rentalBookings.period} = ${q.period}::tstzrange`,
        sql`${phoneKeySql(rentalBookings.customerPhone)} = ${key}`,
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Puts a booking's hold back after one of its checkouts ends unpaid.
 *
 * Opening the payment page stretches the hold to cover the checkout (see
 * startRentalPayment). When that checkout expires or fails, the hold becomes
 * the later of what is still legitimately running:
 *
 *  - the reservation the customer was promised, if it has not ended, and
 *  - any other checkout for this booking that is still open — a customer who
 *    backed out of one and opened another must not have the second one's
 *    half hour taken away when the first expires.
 *
 * If neither is running, the dates go back on the market. It used to clear
 * the hold outright, so anybody who reserved, opened the payment page and
 * closed it lost the car the moment the session expired, despite being told
 * it was held for two days.
 *
 * One statement, so nothing can change between reading the booking and
 * writing it — and a hold staff have already released (no hold at all) is left
 * released rather than revived. The open-checkout subquery compares with the
 * booking id directly: a bare `id` in there would resolve to the payments
 * table's own id column, not the booking's.
 *
 * `database` is a parameter so the statement can be run against a throwaway
 * Postgres in scripts/verify-holds.mts.
 */
export async function restoreHoldAfterCheckout(
  bookingId: string,
  database: typeof db = db,
): Promise<void> {
  const reservation = sql`case when ${rentalBookings.reservedUntil} > now() then ${rentalBookings.reservedUntil} end`;
  const openCheckout = sql`(
    select max(p.created_at) + make_interval(mins => ${sql.raw(String(HOLD_MINUTES))})
    from rental_payments p
    where p.booking_id = ${bookingId} and p.status = 'pending'
  )`;
  const restored = sql`(
    select case when latest > now() then latest end
    from (select greatest(${reservation}, ${openCheckout}) as latest) as held
  )`;

  const target = and(
    eq(rentalBookings.id, bookingId),
    eq(rentalBookings.status, "quote"),
    isNotNull(rentalBookings.paymentHoldUntil),
  );

  try {
    await database
      .update(rentalBookings)
      // reservedUntil follows the reservation alone, as releaseExpiredHolds
      // does, so the admin never shows a car as held that anybody can book.
      .set({ paymentHoldUntil: restored, reservedUntil: reservation })
      .where(target);
  } catch (e) {
    // Not expected — the booking keeps or drops a hold it already had — but
    // if the dates are somehow someone else's now, theirs stands.
    if (!violates(e, "rental_bookings_no_overlap")) throw e;
    await database
      .update(rentalBookings)
      .set({ paymentHoldUntil: null, reservedUntil: null })
      .where(target);
  }
}
