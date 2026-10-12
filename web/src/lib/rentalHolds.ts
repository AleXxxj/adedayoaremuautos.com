import "server-only";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { rentalBookings, rentalPayments } from "@/db/schema";

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
