"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { deals, financeAgreements, instalments, financePayments } from "@/db/schema";
import { requireStaff, assertMarketAccess } from "@/lib/auth";
import { MARKETS, type MarketCode } from "@/lib/market";
import { money, fromMajor } from "@/lib/money";
import { generateSchedule } from "@/lib/amortization";
import { allocatePayment, type AllocatableInstalment } from "@/lib/ledger";

export interface FinanceResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

async function nextAgreementNumber(market: MarketCode): Promise<string> {
  const year = new Date().getFullYear();
  const [{ n }] = await db
    .select({ n: count() })
    .from(financeAgreements)
    .where(
      and(
        eq(financeAgreements.marketCode, market),
        gte(financeAgreements.createdAt, new Date(Date.UTC(year, 0, 1))),
      ),
    );
  return `AAA-FIN-${market.toUpperCase()}-${year}-${String(Number(n) + 1).padStart(4, "0")}`;
}

/**
 * Turns a contracted, financed deal into a live agreement with its schedule.
 *
 * The schedule is generated once and stored. It is a record of what the
 * customer signed, not a value derived on the fly — recomputing it later, after
 * a rate table or rounding rule changed, would quietly rewrite history.
 */
export async function createAgreementFromDeal(
  _prev: FinanceResult | null,
  formData: FormData,
): Promise<FinanceResult> {
  const user = await requireStaff();
  const dealId = String(formData.get("dealId") ?? "");
  const firstDueRaw = String(formData.get("firstDueDate") ?? "");

  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  if (!deal) return { ok: false, error: "Deal not found." };
  assertMarketAccess(user, deal.marketCode);

  if (!deal.isFinanced) {
    return { ok: false, error: "This deal is not marked as financed." };
  }
  if (deal.status !== "contracted" && deal.status !== "delivered") {
    return { ok: false, error: "Contract the deal before creating an agreement." };
  }
  if (!deal.amountFinancedMinor || deal.amountFinancedMinor <= 0) {
    return { ok: false, error: "This deal has nothing to finance." };
  }
  if (!deal.termMonths) {
    return { ok: false, error: "The deal has no term." };
  }

  const existing = await db
    .select({ id: financeAgreements.id })
    .from(financeAgreements)
    .where(eq(financeAgreements.dealId, dealId))
    .limit(1);
  if (existing.length) {
    redirect(`/admin/finance/${existing[0].id}`);
  }

  const firstDue = firstDueRaw ? new Date(firstDueRaw) : null;
  if (!firstDue || Number.isNaN(firstDue.getTime())) {
    return { ok: false, error: "Pick a valid first payment date." };
  }

  const market = MARKETS[deal.marketCode];
  const principal = money(deal.amountFinancedMinor, market.currency);

  let schedule;
  try {
    schedule = generateSchedule(principal, deal.aprBps ?? 0, deal.termMonths, firstDue);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const agreementNumber = await nextAgreementNumber(deal.marketCode);
  let agreementId = "";

  try {
    // Agreement and every instalment land together or not at all. A half
    // written schedule is worse than none.
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(financeAgreements)
        .values({
          marketCode: deal.marketCode,
          dealId: deal.id,
          agreementNumber,
          customerName: deal.customerName,
          customerPhone: deal.customerPhone,
          currency: market.currency,
          principalMinor: principal.minor,
          aprBps: deal.aprBps ?? 0,
          termMonths: deal.termMonths!,
          regularPaymentMinor: schedule.regularPayment.minor,
          totalInterestMinor: schedule.totalInterest.minor,
          firstDueDate: firstDue,
          status: "active",
        })
        .returning({ id: financeAgreements.id });

      agreementId = row.id;

      await tx.insert(instalments).values(
        schedule.instalments.map((i) => ({
          agreementId: row.id,
          number: i.number,
          dueDate: i.dueDate,
          amountMinor: i.amount.minor,
          interestMinor: i.interest.minor,
          principalMinor: i.principal.minor,
          balanceAfterMinor: i.balanceAfter.minor,
          paidMinor: 0,
          state: "due" as const,
        })),
      );
    });
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }

  revalidatePath("/admin/finance");
  redirect(`/admin/finance/${agreementId}?created=1`);
}

const paymentSchema = z.object({
  agreementId: z.string().min(1),
  amount: z.coerce.number().positive("Enter an amount greater than zero"),
  method: z.enum(["cash", "bank_transfer", "card", "cheque", "other"]),
  reference: z.string().trim().max(120).optional(),
  receivedAt: z.string().optional(),
  note: z.string().trim().max(500).optional(),
});

/**
 * Records money received and allocates it across instalments, oldest first.
 *
 * Payment row, instalment updates and any settlement all commit together. If
 * allocation fails halfway, the money is not recorded as received either —
 * a payment on file that did not move any balance is the worst outcome here.
 */
export async function recordPayment(
  _prev: FinanceResult | null,
  formData: FormData,
): Promise<FinanceResult> {
  const user = await requireStaff();

  const raw = Object.fromEntries(formData.entries());
  const cleaned = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v === "" ? undefined : v]),
  );
  const parsed = paymentSchema.safeParse(cleaned);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }
  const f = parsed.data;

  const [agreement] = await db
    .select()
    .from(financeAgreements)
    .where(eq(financeAgreements.id, f.agreementId));
  if (!agreement) return { ok: false, error: "Agreement not found." };
  assertMarketAccess(user, agreement.marketCode);

  if (agreement.status !== "active") {
    return { ok: false, error: `This agreement is ${agreement.status}.` };
  }

  const rows = await db
    .select()
    .from(instalments)
    .where(eq(instalments.agreementId, f.agreementId));

  const amountMinor = fromMajor(f.amount, agreement.currency).minor;
  const receivedAt = f.receivedAt ? new Date(f.receivedAt) : new Date();
  if (Number.isNaN(receivedAt.getTime())) {
    return { ok: false, error: "Invalid payment date." };
  }

  const allocatable: AllocatableInstalment[] = rows.map((r) => ({
    id: r.id,
    number: r.number,
    dueDate: r.dueDate,
    amountMinor: r.amountMinor,
    paidMinor: r.paidMinor,
    state: r.state,
  }));

  let result;
  try {
    result = allocatePayment(allocatable, amountMinor, receivedAt);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (result.allocations.length === 0) {
    return { ok: false, error: "Nothing outstanding — this agreement is fully paid." };
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(financePayments).values({
        agreementId: f.agreementId,
        amountMinor,
        currency: agreement.currency,
        method: f.method,
        receivedAt,
        reference: f.reference,
        note: f.note,
        recordedBy: user.id,
        recordedByEmail: user.email,
      });

      for (const a of result.allocations) {
        await tx
          .update(instalments)
          .set({
            paidMinor: a.paidAfterMinor,
            state: a.stateAfter,
            paidAt: a.stateAfter === "paid" ? receivedAt : null,
          })
          .where(eq(instalments.id, a.instalmentId));
      }

      if (result.settlesAgreement) {
        await tx
          .update(financeAgreements)
          .set({ status: "settled", settledAt: receivedAt })
          .where(eq(financeAgreements.id, f.agreementId));
      }
    });
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }

  revalidatePath(`/admin/finance/${f.agreementId}`);
  revalidatePath("/admin/finance");

  if (result.unappliedMinor > 0) {
    return {
      ok: true,
      error:
        `Recorded. ${result.unappliedMinor / 100} more than the balance was ` +
        `received — refund or carry it forward manually.`,
    };
  }
  return { ok: true };
}

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("instalments_state_matches_money"))
    return "Instalment state and amount disagree. This is a bug — please report it.";
  if (msg.includes("instalments_no_overpayment"))
    return "Tried to allocate more to an instalment than it is worth.";
  if (msg.includes("agreements_currency_matches_market"))
    return "Currency does not match the market.";
  if (msg.includes("agreements_number_idx"))
    return "That agreement number is already taken — try again.";
  return `Could not save: ${msg}`;
}
