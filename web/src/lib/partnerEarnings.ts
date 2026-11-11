import { violates } from "@/lib/dbError";
import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  partnerEarnings,
  partnerPayouts,
  referralPartners,
  rentalBookings,
  rentalPayments,
  deals,
  leads,
} from "@/db/schema";
import { commissionOn, rateFor, saleCommissionsOn } from "@/lib/referral";
import { chooseSettled } from "@/lib/payoutAllocation";

/**
 * Writing down what a partner has earned.
 *
 * Commission used to be a sum computed at display time: delivered deal values
 * multiplied by whatever rate the partner is on today. That is fine for a
 * figure on an admin screen and useless as a record — it rewrites history
 * whenever a rate changes, it cannot express a commission that was paid and
 * then charged back, and it cannot say what has actually been handed over.
 *
 * So every function here writes a row, and every row carries the rate that
 * applied at the moment it was earned.
 *
 * Everything in this module is safe to call twice. That is not defensiveness:
 * the payment webhook is delivered more than once by design, and a deal can be
 * marked delivered, undone and marked again. The unique indexes on
 * `rental_booking_id` and `deal_id` are the real guarantee; these functions
 * check first so the ordinary repeat is quiet rather than an error in the log.
 */

/** States in which a commission is still owed rather than written off. */
const LIVE_STATES = ["pending", "confirmed", "paid"] as const;

/**
 * Brings a referred rental's commission into line with the booking.
 *
 * Called whenever money is recorded against the booking or its status
 * changes, and safe to call any number of times: the commission it writes is
 * worked out from scratch each time, from two things only.
 *
 * - What the customer actually paid us, from the cleared payments rather
 *   than the booking total. The refundable deposit is taken at pickup and is
 *   not ours to pay commission on.
 * - Whether the car has come back. The agreement says a commission is earned
 *   when the money has cleared *and* the rental has completed, so it is
 *   `pending` until the booking is returned and `confirmed` from then on. A
 *   customer who pays on Monday and cancels on Tuesday is a refund, not a
 *   payout.
 *
 * Because it is worked out rather than added to, the order things happen in
 * stops mattering: money taken after the car is marked returned, a booking
 * reopened after a cancellation, a status corrected by hand. Each used to
 * strand the commission at the wrong amount or the wrong state.
 */
export async function recordRentalEarning(
  bookingId: string,
  // A parameter so scripts/verify-referrals.mts can run this against a
  // throwaway Postgres; the app always uses the default.
  database: typeof db = db,
): Promise<void> {
  const [booking] = await database
    .select({
      id: rentalBookings.id,
      marketCode: rentalBookings.marketCode,
      currency: rentalBookings.currency,
      partnerId: rentalBookings.referralPartnerId,
      status: rentalBookings.status,
      totalMinor: rentalBookings.totalMinor,
      injuryCoverTotalMinor: rentalBookings.injuryCoverTotalMinor,
    })
    .from(rentalBookings)
    .where(eq(rentalBookings.id, bookingId))
    .limit(1);

  if (!booking?.partnerId) return;
  // Written off by cancelEarningFor when the booking was cancelled; brought
  // back by the next call after it is reopened.
  if (booking.status === "cancelled") return;

  // The partner must still be in good standing. A suspended partner keeps
  // what they have already earned — the agreement says so — but does not
  // accrue more while the business is looking into them.
  const [partner] = await database
    .select({
      id: referralPartners.id,
      status: referralPartners.status,
      commissionBps: referralPartners.commissionBps,
      rentalCommissionBps: referralPartners.rentalCommissionBps,
    })
    .from(referralPartners)
    .where(eq(referralPartners.id, booking.partnerId))
    .limit(1);

  if (!partner || partner.status !== "active") return;

  const [paid] = await database
    .select({
      // bigint comes back from postgres.js as a string, so the cast is not
      // decoration — a previous version of this comparison was wrong, not the
      // payment it was checking.
      total: sql<number>`coalesce(sum(${rentalPayments.amountMinor}), 0)::bigint`,
    })
    .from(rentalPayments)
    .where(
      and(
        eq(rentalPayments.bookingId, bookingId),
        eq(rentalPayments.status, "paid"),
      ),
    );

  /*
   * The hire, not the injury cover.
   *
   * The cover fee is charged in the same payment as the hire, so the cleared
   * total includes it — but it buys the renter an insurance benefit and pays
   * for the business's own premium, rather than being margin to share. The
   * agreement already excludes refundable deposits and third-party charges on
   * the same reasoning.
   *
   * Clamped at zero rather than trusted: a refund recorded oddly could in
   * principle leave the cover larger than the cleared total, and a negative
   * basis would turn a commission into a deduction.
   *
   * And never more than the booking costs. A customer who pays online while
   * staff take cash for the same booking has paid twice; the second payment
   * is a refund the business owes, not a rental to earn on.
   */
  const clearedMinor = Math.min(Number(paid?.total ?? 0), Number(booking.totalMinor));
  const coverMinor = Number(booking.injuryCoverTotalMinor ?? 0);
  const basisMinor = Math.max(0, clearedMinor - coverMinor);
  if (basisMinor <= 0) return;

  // The hire rate, not the sale rate. Through `rateFor` rather than reading
  // the column, because `commissionBps` is the one with no prefix and is
  // therefore the one a hire gets paid at by accident.
  const bps = rateFor(partner, "rental");
  const amountMinor = commissionOn(basisMinor, bps);
  const returned = booking.status === "returned";

  /*
   * One commission per booking, rewritten to match.
   *
   * Every column that can be worked out is set again: the amount (a rental
   * paid half at pickup and half at return earns on both halves), the state
   * (earned once the car is back, whichever happened first), and the
   * cancellation (cleared, because a booking that reaches this line is not
   * cancelled any more).
   *
   * Except once the commission is in a payout. Then the money has moved, or
   * is about to, and the row is the record of it; a later change is a
   * conversation with the partner rather than an edit.
   *
   * The conflict target repeats the index's WHERE clause: the unique index is
   * partial (rental_booking_id IS NOT NULL), and Postgres only matches a
   * partial index when the predicate is spelled out.
   */
  try {
    await database
      .insert(partnerEarnings)
      .values({
        partnerId: partner.id,
        marketCode: booking.marketCode,
        source: "rental",
        rentalBookingId: bookingId,
        basisMinor,
        commissionBps: bps,
        amountMinor,
        currency: booking.currency,
        state: returned ? "confirmed" : "pending",
        confirmedAt: returned ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: partnerEarnings.rentalBookingId,
        targetWhere: sql`${partnerEarnings.rentalBookingId} is not null`,
        set: {
          basisMinor,
          commissionBps: bps,
          amountMinor,
          state: returned ? "confirmed" : "pending",
          // The first time it was confirmed stays the time it was confirmed.
          confirmedAt: returned ? sql`coalesce(${partnerEarnings.confirmedAt}, now())` : null,
          cancelledAt: null,
          note: null,
          updatedAt: new Date(),
        },
        setWhere: sql`${partnerEarnings.state} in ('pending', 'confirmed', 'cancelled') and ${partnerEarnings.payoutId} is null`,
      });
    console.log(
      `[partner] rental commission recorded for ${partner.id} on booking ${bookingId}`,
    );
  } catch (e) {
    // Never allowed to fail the payment that triggered it. A commission the
    // business has to work out by hand is recoverable; a 500 back to Stripe
    // makes it retry a payment that was already recorded.
    console.error("[partner] could not record rental commission", e);
  }
}

/**
 * The hire or sale fell through.
 *
 * Cancelled rather than deleted, and with the reason the partner will read on
 * their own dashboard. A commission that silently vanishes from somebody's
 * earnings is how a partner concludes they are being short-changed.
 *
 * A commission already settled through a payout is left alone: the money has
 * gone, and the agreement handles that case by setting it against future
 * earnings, which is a decision for a person and not for this function.
 */
export async function cancelEarningFor(
  ref: { bookingId: string } | { dealId: string },
  reason: string,
  database: typeof db = db,
): Promise<void> {
  const where =
    "bookingId" in ref
      ? eq(partnerEarnings.rentalBookingId, ref.bookingId)
      : eq(partnerEarnings.dealId, ref.dealId);

  await database
    .update(partnerEarnings)
    .set({ state: "cancelled", cancelledAt: new Date(), note: reason, updatedAt: new Date() })
    .where(
      and(
        where,
        inArray(partnerEarnings.state, ["pending", "confirmed"]),
        isNull(partnerEarnings.payoutId),
      ),
    );
}

/**
 * A referred booking's status changed: its commission follows.
 *
 * Cancelled writes it off with a reason the partner reads on their own
 * dashboard. Any other status works it out again — so "returned" confirms
 * it, a correction back to "active" un-confirms it, and reopening a
 * cancelled booking brings it back at whatever has been paid.
 */
export async function syncRentalEarning(
  bookingId: string,
  status: string,
  database: typeof db = db,
): Promise<void> {
  if (status === "cancelled") {
    await cancelEarningFor({ bookingId }, "The rental was cancelled.", database);
  } else {
    await recordRentalEarning(bookingId, database);
  }
}

/**
 * A referred vehicle sale has completed.
 *
 * Attributed through the lead rather than through `deals.referral_partner_id`
 * alone, so a deal created before a partner id was ever stamped on it still
 * counts — the same join the admin totals have always used.
 *
 * Confirmed immediately, because `delivered` means the keys are handed over:
 * unlike a hire there is no later moment at which the thing completes.
 *
 * Nothing is recorded for a US sale while sale commissions are paused there
 * (`saleCommissionsOn`): North Carolina restricts paying an unlicensed person
 * for a vehicle-sale introduction, and the question is with a lawyer.
 */
export async function recordSaleEarning(dealId: string): Promise<void> {
  const [deal] = await db
    .select({
      id: deals.id,
      marketCode: deals.marketCode,
      currency: deals.currency,
      priceMinor: deals.vehiclePriceMinor,
      status: deals.status,
      dealPartnerId: deals.referralPartnerId,
      leadPartnerId: leads.referralPartnerId,
    })
    .from(deals)
    .leftJoin(leads, eq(deals.leadId, leads.id))
    .where(eq(deals.id, dealId))
    .limit(1);

  if (!deal || deal.status !== "delivered") return;
  // Paused where the law is still being checked; see saleCommissionsOn.
  if (!saleCommissionsOn(deal.marketCode as "us" | "ng")) return;

  const partnerId = deal.dealPartnerId ?? deal.leadPartnerId;
  if (!partnerId) return;

  const [partner] = await db
    .select({
      id: referralPartners.id,
      status: referralPartners.status,
      commissionBps: referralPartners.commissionBps,
      rentalCommissionBps: referralPartners.rentalCommissionBps,
    })
    .from(referralPartners)
    .where(eq(referralPartners.id, partnerId))
    .limit(1);

  if (!partner || partner.status !== "active") return;

  const basisMinor = Number(deal.priceMinor ?? 0);
  if (basisMinor <= 0) return;

  // Named through `rateFor` for the same reason the hire side is: so the row
  // below cannot be read without knowing which of the two rates priced it.
  const saleBps = rateFor(partner, "sale");

  try {
    await db.insert(partnerEarnings).values({
      partnerId: partner.id,
      marketCode: deal.marketCode,
      source: "sale",
      dealId,
      basisMinor,
      commissionBps: saleBps,
      amountMinor: commissionOn(basisMinor, saleBps),
      currency: deal.currency,
      state: "confirmed",
      confirmedAt: new Date(),
    });
  } catch (e) {
    if (violates(e, "partner_earnings_deal_unique")) return;
    console.error("[partner] could not record sale commission", e);
  }
}

/** Marks the commissions this payout settles as paid, and attaches them to it. */
export async function settleEarnings(
  partnerId: string,
  amountMinor: number,
  payoutId: string,
): Promise<void> {
  const confirmed = await db
    .select({
      id: partnerEarnings.id,
      amountMinor: partnerEarnings.amountMinor,
    })
    .from(partnerEarnings)
    .where(
      and(
        eq(partnerEarnings.partnerId, partnerId),
        eq(partnerEarnings.state, "confirmed"),
      ),
    )
    .orderBy(partnerEarnings.createdAt);

  const settling = chooseSettled(confirmed, amountMinor);
  if (settling.length === 0) return;

  await db
    .update(partnerEarnings)
    .set({ state: "paid", payoutId })
    .where(inArray(partnerEarnings.id, settling));
}

export interface PartnerTotals {
  /** Earned, confirmed, and not yet settled through a payout. */
  availableMinor: number;
  /** Earned but not yet confirmed — a hire still running, typically. */
  pendingMinor: number;
  /** Requested or approved, awaiting payment. */
  requestedMinor: number;
  /** Actually handed over, all time. */
  paidMinor: number;
  /** Written off: cancelled, refunded, charged back. */
  cancelledMinor: number;
}

/**
 * What a partner's account adds up to.
 *
 * `availableMinor` is deliberately net of everything already requested. A
 * partner who asks for a payout and then sees the same figure still sitting
 * there asks for it again, and then the business owes it twice over.
 */
export async function partnerTotals(partnerId: string): Promise<PartnerTotals> {
  const [earnings] = await db
    .select({
      confirmed: sql<number>`coalesce(sum(${partnerEarnings.amountMinor}) filter (where ${partnerEarnings.state} = 'confirmed'), 0)::bigint`,
      pending: sql<number>`coalesce(sum(${partnerEarnings.amountMinor}) filter (where ${partnerEarnings.state} = 'pending'), 0)::bigint`,
      paid: sql<number>`coalesce(sum(${partnerEarnings.amountMinor}) filter (where ${partnerEarnings.state} = 'paid'), 0)::bigint`,
      cancelled: sql<number>`coalesce(sum(${partnerEarnings.amountMinor}) filter (where ${partnerEarnings.state} = 'cancelled'), 0)::bigint`,
    })
    .from(partnerEarnings)
    .where(eq(partnerEarnings.partnerId, partnerId));

  const [payouts] = await db
    .select({
      open: sql<number>`coalesce(sum(${partnerPayouts.amountMinor}) filter (where ${partnerPayouts.state} in ('requested','approved')), 0)::bigint`,
    })
    .from(partnerPayouts)
    .where(eq(partnerPayouts.partnerId, partnerId));

  const confirmed = Number(earnings?.confirmed ?? 0);
  const requested = Number(payouts?.open ?? 0);

  return {
    availableMinor: Math.max(0, confirmed - requested),
    pendingMinor: Number(earnings?.pending ?? 0),
    requestedMinor: requested,
    paidMinor: Number(earnings?.paid ?? 0),
    cancelledMinor: Number(earnings?.cancelled ?? 0),
  };
}

/** Whether any commission at all is recorded against this partner. */
export async function hasEarnings(partnerId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(partnerEarnings)
    .where(
      and(
        eq(partnerEarnings.partnerId, partnerId),
        inArray(partnerEarnings.state, [...LIVE_STATES]),
      ),
    );
  return (row?.n ?? 0) > 0;
}
