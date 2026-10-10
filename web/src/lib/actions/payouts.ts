"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { partnerPayouts, referralPartners } from "@/db/schema";
import { requirePartner, requireStaff, assertMarketAccess } from "@/lib/auth";
import { partnerTotals, settleEarnings } from "@/lib/partnerEarnings";
import { MARKETS } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import { notifyStaffOfPayoutRequest, sendPayoutPaid } from "@/lib/mail/payouts";

export interface PayoutResult {
  ok: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

const requestSchema = z.object({
  /** Major units as typed — "40.50". Converted once, here. */
  amount: z.string().trim().min(1, "Enter an amount"),
  note: z.string().trim().max(500).optional(),
});

/**
 * A partner asking for what they are owed.
 *
 * Checked against `availableMinor`, which is already net of anything
 * requested and not yet settled. Without that, a partner asks for the same
 * £400 twice in a week and the business owes it twice over — and the figure
 * on their own dashboard would have told them it was still there.
 *
 * No bank details are asked for, taken, or stored. The note is the partner's
 * own words and the form says as much; how the money actually moves is
 * arranged with them directly, which is the same rule that keeps account
 * numbers, SSN and BVN off this site entirely.
 */
export async function requestPayout(
  _prev: PayoutResult | null,
  formData: FormData,
): Promise<PayoutResult> {
  const partner = await requirePartner();
  const parsed = requestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const market = MARKETS[partner.marketCode];

  // Parsed by hand rather than with `fromMajor`, so "40.5", "40.50" and
  // "£40.50" all mean the same thing and anything else is refused outright
  // instead of silently becoming zero.
  const cleaned = parsed.data.amount.replace(/[^\d.]/g, "");
  const major = Number(cleaned);
  if (!Number.isFinite(major) || major <= 0) {
    return { ok: false, fieldErrors: { amount: ["Enter an amount like 40.50"] } };
  }
  const amountMinor = Math.round(major * 100);

  const totals = await partnerTotals(partner.id);
  if (amountMinor > totals.availableMinor) {
    return {
      ok: false,
      fieldErrors: {
        amount: [
          `You have ${formatMoney(
            money(totals.availableMinor, market.currency),
            market.locale,
          )} available to request.`,
        ],
      },
    };
  }

  await db.insert(partnerPayouts).values({
    partnerId: partner.id,
    marketCode: partner.marketCode,
    amountMinor,
    currency: market.currency,
    note: parsed.data.note || null,
  });

  void notifyStaffOfPayoutRequest({
    name: partner.fullName,
    code: partner.code,
    amount: formatMoney(money(amountMinor, market.currency), market.locale),
    note: parsed.data.note,
  }).catch((e) => console.error("[payout] staff alert failed", e));

  revalidatePath("/partner");
  revalidatePath("/admin/payouts");
  return {
    ok: true,
    message: "Payout requested. We will be in touch to arrange it.",
  };
}

/* ── Admin ─────────────────────────────────────────────────────────────── */

const decideSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "paid", "rejected"]),
  reference: z.string().trim().max(120).optional(),
  reason: z.string().trim().max(500).optional(),
});

/**
 * The owner answering a payout request.
 *
 * Marking it paid is the step that settles the underlying commissions: the
 * confirmed earnings are moved to `paid` and attached to this payout, oldest
 * first, up to the amount actually sent. That attachment is what stops the
 * same commission being paid out a second time — the database refuses to
 * attach anything that is not already settled, so the two cannot drift apart.
 */
export async function decidePayout(
  _prev: PayoutResult | null,
  formData: FormData,
): Promise<PayoutResult> {
  const user = await requireStaff();
  const parsed = decideSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Could not read that request." };
  const v = parsed.data;

  const [payout] = await db
    .select()
    .from(partnerPayouts)
    .where(eq(partnerPayouts.id, v.id));
  if (!payout) return { ok: false, error: "That request no longer exists." };
  assertMarketAccess(user, payout.marketCode);

  if (payout.state === "paid") {
    return { ok: false, error: "That payout has already been paid." };
  }

  if (v.decision === "rejected" && !v.reason) {
    return {
      ok: false,
      fieldErrors: { reason: ["Give a reason — the partner is told it."] },
    };
  }

  const now = new Date();

  if (v.decision === "paid") {
    await settleEarnings(payout.partnerId, payout.amountMinor, payout.id);
  }

  await db
    .update(partnerPayouts)
    .set({
      state: v.decision,
      decidedAt: now,
      decidedByEmail: user.email,
      paidAt: v.decision === "paid" ? now : null,
      reference: v.decision === "paid" ? v.reference || null : payout.reference,
      rejectReason: v.decision === "rejected" ? (v.reason ?? null) : null,
    })
    .where(eq(partnerPayouts.id, v.id));

  if (v.decision === "paid") {
    const [partner] = await db
      .select({
        email: referralPartners.email,
        fullName: referralPartners.fullName,
      })
      .from(referralPartners)
      .where(eq(referralPartners.id, payout.partnerId));

    const market = MARKETS[payout.marketCode];
    if (partner?.email) {
      void sendPayoutPaid({
        to: partner.email,
        name: partner.fullName,
        amount: formatMoney(
          money(payout.amountMinor, market.currency),
          market.locale,
        ),
        reference: v.reference,
      }).catch((e) => console.error("[payout] paid email failed", e));
    }
  }

  revalidatePath("/admin/payouts");
  revalidatePath("/partner");
  return { ok: true };
}

