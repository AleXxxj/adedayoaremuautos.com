import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rentalBookings, rentalPayments } from "@/db/schema";
import { MARKETS, type MarketCode } from "@/lib/market";
import { formatMoney, fromMajor, money } from "@/lib/money";
import { violates } from "@/lib/dbError";

export type CounterMethod = "cash" | "card" | "other";

export type CounterOutcome =
  | {
      ok: true;
      bookingId: string;
      /** The amount, formatted in the booking's currency. */
      amount: string;
      /** A reservation this payment turned into a confirmed booking. */
      confirmed: boolean;
      /** The same submit arriving twice: nothing new was written. */
      duplicate: boolean;
    }
  | { ok: false; error: string };

/**
 * Takes money at the counter for a rental: the part that touches the
 * database, apart from the action so scripts/verify-referrals.mts can run it.
 *
 * One transaction, with the booking row locked for its length, so the three
 * things that must agree do:
 *
 * - The balance. Two staff members recording the same handover at once used
 *   to both see the full amount owed and both write it; the second now waits
 *   for the first and sees what is left.
 * - The duplicate. A submit retried after a lost reply carries the same key,
 *   and is recognized before the balance check — otherwise a retry of a
 *   payment in full is told "already paid in full", which reads as an error.
 * - The reservation. Money taken for a reservation confirms it, as an online
 *   payment does. Left as a reservation, its hold would lapse, the dates
 *   could go to someone else, and the customer's page would still offer to
 *   charge them the full price. If the dates have already gone to another
 *   confirmed booking, nothing is recorded, and staff are told why.
 */
export async function takeCounterPayment(
  input: { bookingId: string; amountMajor: number; method: CounterMethod; clientKey: string },
  staff: { id: string; mayTakeFor: (market: MarketCode) => boolean },
  database: typeof db = db,
): Promise<CounterOutcome> {
  try {
    return await database.transaction(async (tx) => {
      const [booking] = await tx
        .select({
          id: rentalBookings.id,
          marketCode: rentalBookings.marketCode,
          currency: rentalBookings.currency,
          totalMinor: rentalBookings.totalMinor,
          status: rentalBookings.status,
        })
        .from(rentalBookings)
        .where(eq(rentalBookings.id, input.bookingId))
        .for("update")
        .limit(1);

      // One answer for "no such booking" and "not yours", so this can't be
      // used to find out which bookings exist in another market.
      if (!booking || !staff.mayTakeFor(booking.marketCode as MarketCode)) {
        return { ok: false, error: "That booking is not one you can take payment for." } as const;
      }

      const market = MARKETS[booking.marketCode as MarketCode];
      const fmt = (minor: number) => formatMoney(money(minor, booking.currency), market.locale);
      const amountMinor = fromMajor(input.amountMajor, booking.currency).minor;

      const [already] = await tx
        .select({ amountMinor: rentalPayments.amountMinor })
        .from(rentalPayments)
        .where(
          and(eq(rentalPayments.provider, "counter"), eq(rentalPayments.providerRef, input.clientKey)),
        )
        .limit(1);
      if (already) {
        return {
          ok: true,
          bookingId: booking.id,
          amount: fmt(Number(already.amountMinor)),
          confirmed: false,
          duplicate: true,
        } as const;
      }

      if (booking.status === "cancelled") {
        return {
          ok: false,
          error: "This booking is cancelled. Reopen it before taking payment for it.",
        } as const;
      }

      const [paid] = await tx
        .select({ total: sql<number>`coalesce(sum(${rentalPayments.amountMinor}), 0)::bigint` })
        .from(rentalPayments)
        .where(and(eq(rentalPayments.bookingId, booking.id), eq(rentalPayments.status, "paid")));
      const owedMinor = Math.max(0, Number(booking.totalMinor) - Number(paid?.total ?? 0));

      if (amountMinor <= 0) return { ok: false, error: "Enter the amount taken." } as const;
      if (amountMinor > owedMinor) {
        return {
          ok: false,
          error:
            owedMinor === 0
              ? "This booking is already paid in full. The refundable deposit is not recorded here."
              : `Only ${fmt(owedMinor)} is still owed on this booking. Record the rental charge only, not the refundable deposit.`,
        } as const;
      }

      await tx.insert(rentalPayments).values({
        bookingId: booking.id,
        marketCode: booking.marketCode,
        provider: "counter",
        providerRef: input.clientKey,
        amountMinor,
        currency: booking.currency,
        status: "paid",
        paidAt: new Date(),
        method: input.method,
        recordedBy: staff.id,
      });

      const confirming = booking.status === "quote";
      if (confirming) {
        // As the card webhook does: confirmed, and the temporary hold that
        // stood in for the confirmation released.
        await tx
          .update(rentalBookings)
          .set({ status: "confirmed", paymentHoldUntil: null })
          .where(eq(rentalBookings.id, booking.id));
      }

      return {
        ok: true,
        bookingId: booking.id,
        amount: fmt(amountMinor),
        confirmed: confirming,
        duplicate: false,
      } as const;
    });
  } catch (e) {
    if (violates(e, "rental_bookings_no_overlap")) {
      return {
        ok: false,
        error:
          "Nothing was recorded: another confirmed booking already has this car on those dates. Change this booking's dates, or cancel it, before taking payment.",
      };
    }
    // Two identical submits racing past the duplicate check: the first won.
    if (violates(e, "rental_payments_provider_ref_unique")) {
      return { ok: false, error: "That payment is already recorded. Reload the page to see it." };
    }
    throw e;
  }
}
