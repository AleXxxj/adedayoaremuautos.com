import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
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
import { commissionOn } from "@/lib/referral";
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
 * A referred rental has been paid for.
 *
 * The basis is what the customer actually paid us, read from the cleared
 * payments rather than from the booking total — the agreement says commission
 * excludes refundable deposits, and the deposit is taken at pickup and is not
 * ours to pay commission on.
 *
 * Written as `pending`, not `confirmed`. The agreement says a commission is
 * earned when the money has cleared *and* the hire has completed, and a
 * customer who pays on Monday and cancels on Tuesday is a refund. Confirming
 * it the moment the card clears would mean paying out on hires that never
 * happened; `confirmRentalEarning` promotes it when the car comes back.
 */
export async function recordRentalEarning(bookingId: string): Promise<void> {
  const [booking] = await db
    .select({
      id: rentalBookings.id,
      marketCode: rentalBookings.marketCode,
      currency: rentalBookings.currency,
      partnerId: rentalBookings.referralPartnerId,
      status: rentalBookings.status,
    })
    .from(rentalBookings)
    .where(eq(rentalBookings.id, bookingId))
    .limit(1);

  if (!booking?.partnerId) return;

  // The partner must still be in good standing. A suspended partner keeps
  // what they have already earned — the agreement says so — but does not
  // accrue more while the business is looking into them.
  const [partner] = await db
    .select({
      id: referralPartners.id,
      status: referralPartners.status,
      commissionBps: referralPartners.commissionBps,
    })
    .from(referralPartners)
    .where(eq(referralPartners.id, booking.partnerId))
    .limit(1);

  if (!partner || partner.status !== "active") return;

  const [paid] = await db
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

  const basisMinor = Number(paid?.total ?? 0);
  if (basisMinor <= 0) return;

  const amountMinor = commissionOn(basisMinor, partner.commissionBps);

  try {
    await db.insert(partnerEarnings).values({
      partnerId: partner.id,
      marketCode: booking.marketCode,
      source: "rental",
      rentalBookingId: bookingId,
      basisMinor,
      commissionBps: partner.commissionBps,
      amountMinor,
      currency: booking.currency,
      state: "pending",
    });
    console.log(
      `[partner] rental commission recorded for ${partner.id} on booking ${bookingId}`,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    // The ordinary case: this webhook has been delivered before.
    if (message.includes("partner_earnings_booking_unique")) return;
    // Never allowed to fail the payment that triggered it. A commission the
    // business has to work out by hand is recoverable; a 500 back to Stripe
    // makes it retry a payment that was already recorded.
    console.error("[partner] could not record rental commission", e);
  }
}

/** The car came back. The commission is now genuinely earned. */
export async function confirmRentalEarning(bookingId: string): Promise<void> {
  await db
    .update(partnerEarnings)
    .set({ state: "confirmed", confirmedAt: new Date() })
    .where(
      and(
        eq(partnerEarnings.rentalBookingId, bookingId),
        eq(partnerEarnings.state, "pending"),
      ),
    );
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
): Promise<void> {
  const where =
    "bookingId" in ref
      ? eq(partnerEarnings.rentalBookingId, ref.bookingId)
      : eq(partnerEarnings.dealId, ref.dealId);

  await db
    .update(partnerEarnings)
    .set({ state: "cancelled", cancelledAt: new Date(), note: reason })
    .where(and(where, inArray(partnerEarnings.state, ["pending", "confirmed"])));
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
 * Note for the business, not the partner: commission on a US vehicle sale to
 * an unlicensed introducer is restricted in several states, which is why the
 * programme is being offered on hire first. This function exists so that the
 * sale side is ready, and so the figures are recorded consistently either way.
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

  const partnerId = deal.dealPartnerId ?? deal.leadPartnerId;
  if (!partnerId) return;

  const [partner] = await db
    .select({
      id: referralPartners.id,
      status: referralPartners.status,
      commissionBps: referralPartners.commissionBps,
    })
    .from(referralPartners)
    .where(eq(referralPartners.id, partnerId))
    .limit(1);

  if (!partner || partner.status !== "active") return;

  const basisMinor = Number(deal.priceMinor ?? 0);
  if (basisMinor <= 0) return;

  try {
    await db.insert(partnerEarnings).values({
      partnerId: partner.id,
      marketCode: deal.marketCode,
      source: "sale",
      dealId,
      basisMinor,
      commissionBps: partner.commissionBps,
      amountMinor: commissionOn(basisMinor, partner.commissionBps),
      currency: deal.currency,
      state: "confirmed",
      confirmedAt: new Date(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.includes("partner_earnings_deal_unique")) return;
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
