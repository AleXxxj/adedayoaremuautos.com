"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { deals, dealEvents, vehicles, leads } from "@/db/schema";
import { requireStaff, assertMarketAccess, type Staff } from "@/lib/auth";
import { MARKETS, type MarketCode } from "@/lib/market";
import { fromMajor } from "@/lib/money";
import { computeDeal, defaultFees, formatDealNumber, type Fee } from "@/lib/deal";

export interface DealResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

/** Stages a deal may move between. Delivery is terminal and irreversible. */
const FORWARD: Record<string, string[]> = {
  draft: ["negotiating", "lost"],
  negotiating: ["agreed", "lost"],
  agreed: ["financing", "contracted", "lost"],
  financing: ["contracted", "lost"],
  contracted: ["delivered", "lost"],
  delivered: [],
  lost: ["draft"],
};

/**
 * Next sequence number for a market and year.
 *
 * Racy by nature — two salespeople creating a deal in the same second can
 * compute the same number. The unique index on deal_number is the real
 * guarantee; this retries on collision rather than pretending the race is not
 * there.
 */
async function nextDealNumber(market: MarketCode): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));

  const [{ n }] = await db
    .select({ n: count() })
    .from(deals)
    .where(and(eq(deals.marketCode, market), gte(deals.createdAt, yearStart)));

  return formatDealNumber(market, year, Number(n) + 1);
}

async function logEvent(
  dealId: string,
  actor: Staff,
  from: string | null,
  to: string,
  note?: string,
) {
  await db.insert(dealEvents).values({
    dealId,
    actorId: actor.id,
    actorEmail: actor.email,
    fromStatus: from,
    toStatus: to,
    note,
  });
}

/* ── Create ────────────────────────────────────────────────────────────── */

export async function createDeal(
  _prev: DealResult | null,
  formData: FormData,
): Promise<DealResult> {
  const user = await requireStaff();

  const vehicleId = String(formData.get("vehicleId") ?? "");
  const leadId = String(formData.get("leadId") ?? "") || null;
  if (!vehicleId) return { ok: false, error: "Pick a vehicle first." };

  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.id, vehicleId));
  if (!vehicle) return { ok: false, error: "Vehicle not found." };
  assertMarketAccess(user, vehicle.marketCode);

  if (vehicle.status === "sold") {
    return { ok: false, error: "That vehicle is already sold." };
  }
  if (vehicle.priceMinor == null) {
    return { ok: false, error: "Set a price on the vehicle before starting a deal." };
  }

  let customerName = String(formData.get("customerName") ?? "").trim();
  let customerPhone = String(formData.get("customerPhone") ?? "").trim();
  let customerEmail = String(formData.get("customerEmail") ?? "").trim() || null;

  // Starting from a lead carries the customer across, so nobody retypes it.
  if (leadId) {
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
    if (lead) {
      customerName ||= lead.name;
      customerPhone ||= lead.phone ?? "";
      customerEmail ||= lead.email;
    }
  }

  if (!customerName || !customerPhone) {
    return { ok: false, error: "Customer name and phone are required." };
  }

  const market = MARKETS[vehicle.marketCode];

  let id: string | undefined;
  for (let attempt = 0; attempt < 5 && !id; attempt++) {
    try {
      const [row] = await db
        .insert(deals)
        .values({
          marketCode: vehicle.marketCode,
          leadId,
          vehicleId,
          salespersonId: user.id,
          dealNumber: await nextDealNumber(vehicle.marketCode),
          customerName,
          customerPhone,
          customerEmail,
          currency: market.currency,
          vehiclePriceMinor: vehicle.priceMinor,
          fees: defaultFees(market),
          totalMinor: vehicle.priceMinor,
          status: "draft",
        })
        .returning({ id: deals.id });
      id = row.id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("deals_number_idx") || attempt === 4) {
        return { ok: false, error: `Could not create deal: ${msg}` };
      }
      // Collision on the sequence — recompute and try again.
    }
  }

  await logEvent(id!, user, null, "draft", "Deal created");

  // A car with a live deal on it is no longer plainly "available".
  if (vehicle.status === "available") {
    await db
      .update(vehicles)
      .set({ status: "pending" })
      .where(eq(vehicles.id, vehicleId));
  }

  if (leadId) {
    await db
      .update(leads)
      .set({ status: "qualified", firstResponseAt: new Date() })
      .where(eq(leads.id, leadId));
  }

  revalidatePath("/admin/deals");
  revalidatePath("/admin/leads");
  redirect(`/admin/deals/${id}`);
}

/* ── Worksheet ─────────────────────────────────────────────────────────── */

const worksheetSchema = z.object({
  id: z.string().min(1),
  customerName: z.string().trim().min(1, "Customer name is required"),
  customerPhone: z.string().trim().min(5, "Phone is required"),
  customerEmail: z.string().trim().email("Invalid email").optional().or(z.literal("")),
  vehiclePrice: z.coerce.number().min(0),
  tradeInDescription: z.string().trim().optional(),
  tradeInAllowance: z.coerce.number().min(0).default(0),
  tradeInPayoff: z.coerce.number().min(0).default(0),
  downPayment: z.coerce.number().min(0).default(0),
  taxRatePercent: z.coerce.number().min(0).max(100).default(0),
  isFinanced: z.coerce.boolean().default(false),
  aprPercent: z.coerce.number().min(0).max(100).optional(),
  termMonths: z.coerce.number().int().min(1).max(120).optional(),
  feesJson: z.string().optional(),
});

export async function saveDealWorksheet(
  _prev: DealResult | null,
  formData: FormData,
): Promise<DealResult> {
  const user = await requireStaff();

  const raw = Object.fromEntries(formData.entries());
  const cleaned = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v === "" ? undefined : v]),
  );

  const parsed = worksheetSchema.safeParse(cleaned);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }
  const f = parsed.data;

  const [deal] = await db.select().from(deals).where(eq(deals.id, f.id));
  if (!deal) return { ok: false, error: "Deal not found." };
  assertMarketAccess(user, deal.marketCode);

  if (deal.status === "delivered") {
    return { ok: false, error: "A delivered deal cannot be edited." };
  }

  const market = MARKETS[deal.marketCode];
  const cur = market.currency;
  const toMinor = (n: number) => fromMajor(n, cur).minor;

  let fees: Fee[] = [];
  if (f.feesJson) {
    try {
      const parsedFees = JSON.parse(f.feesJson) as {
        label: string;
        amount: number;
        taxable: boolean;
      }[];
      fees = parsedFees
        .filter((x) => x.label?.trim())
        .map((x) => ({
          label: x.label.trim(),
          amountMinor: toMinor(Number(x.amount) || 0),
          taxable: Boolean(x.taxable),
        }));
    } catch {
      return { ok: false, error: "Fee list could not be read." };
    }
  }

  if (f.isFinanced && (f.aprPercent == null || f.termMonths == null)) {
    return { ok: false, error: "A financed deal needs an APR and a term." };
  }

  // The authoritative calculation happens here, on the server, from the
  // submitted inputs. The worksheet's live preview is a convenience; it is
  // never the number that gets stored.
  const breakdown = computeDeal({
    currency: cur,
    vehiclePriceMinor: toMinor(f.vehiclePrice),
    tradeInAllowanceMinor: toMinor(f.tradeInAllowance),
    tradeInPayoffMinor: toMinor(f.tradeInPayoff),
    downPaymentMinor: toMinor(f.downPayment),
    fees,
    taxRateBps: Math.round(f.taxRatePercent * 100),
    isFinanced: f.isFinanced,
    aprBps: f.aprPercent != null ? Math.round(f.aprPercent * 100) : undefined,
    termMonths: f.termMonths,
    tradeReducesTaxableBase: market.compliance.monthlyPaymentRequiresDisclosure,
  });

  try {
    await db
      .update(deals)
      .set({
        customerName: f.customerName,
        customerPhone: f.customerPhone,
        customerEmail: f.customerEmail || null,
        vehiclePriceMinor: breakdown.vehiclePrice.minor,
        tradeInDescription: f.tradeInDescription,
        tradeInAllowanceMinor: breakdown.tradeInAllowance.minor,
        tradeInPayoffMinor: breakdown.tradeInPayoff.minor,
        downPaymentMinor: breakdown.downPayment.minor,
        fees,
        taxRateBps: Math.round(f.taxRatePercent * 100),
        taxMinor: breakdown.tax.minor,
        totalMinor: breakdown.outTheDoor.minor,
        isFinanced: f.isFinanced,
        aprBps: f.isFinanced && f.aprPercent != null ? Math.round(f.aprPercent * 100) : null,
        termMonths: f.isFinanced ? f.termMonths : null,
        amountFinancedMinor: f.isFinanced ? breakdown.amountFinanced.minor : null,
        monthlyPaymentMinor: breakdown.monthlyPayment?.minor ?? null,
      })
      .where(eq(deals.id, f.id));
  } catch (e) {
    return { ok: false, error: friendlyDealError(e) };
  }

  revalidatePath(`/admin/deals/${f.id}`);
  revalidatePath("/admin/deals");
  return { ok: true };
}

/* ── Stage transitions ─────────────────────────────────────────────────── */

export async function transitionDeal(
  _prev: DealResult | null,
  formData: FormData,
): Promise<DealResult> {
  const user = await requireStaff();

  const id = String(formData.get("id") ?? "");
  const to = String(formData.get("to") ?? "");
  const note = String(formData.get("note") ?? "").trim() || undefined;

  const [deal] = await db.select().from(deals).where(eq(deals.id, id));
  if (!deal) return { ok: false, error: "Deal not found." };
  assertMarketAccess(user, deal.marketCode);

  const allowed = FORWARD[deal.status] ?? [];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      error: `A ${deal.status} deal cannot move to ${to}.`,
    };
  }

  if (to === "lost" && !note) {
    return { ok: false, error: "Record why the deal was lost." };
  }
  if (to === "contracted" && deal.totalMinor <= 0) {
    return { ok: false, error: "Complete the worksheet before contracting." };
  }

  const now = new Date();

  try {
    await db
      .update(deals)
      .set({
        status: to as never,
        contractedAt: to === "contracted" ? (deal.contractedAt ?? now) : deal.contractedAt,
        deliveredAt: to === "delivered" ? now : deal.deliveredAt,
        lostReason: to === "lost" ? note : null,
      })
      .where(eq(deals.id, id));
  } catch (e) {
    return { ok: false, error: friendlyDealError(e) };
  }

  await logEvent(id, user, deal.status, to, note);

  // ── The loop that closes ────────────────────────────────────────────────
  // Delivery is what marks the vehicle sold, which is what moves the public
  // "vehicles sold" counter. Nobody has to remember to flip a status.
  if (deal.vehicleId) {
    if (to === "delivered") {
      await db
        .update(vehicles)
        .set({ status: "sold", soldAt: now })
        .where(eq(vehicles.id, deal.vehicleId));
    } else if (to === "lost") {
      // Put the car back on the market.
      const [v] = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.id, deal.vehicleId));
      if (v && v.status === "pending") {
        await db
          .update(vehicles)
          .set({ status: "available" })
          .where(eq(vehicles.id, deal.vehicleId));
      }
    }
  }

  if (deal.leadId) {
    await db
      .update(leads)
      .set({
        status: to === "delivered" ? "won" : to === "lost" ? "lost" : "qualified",
        closedAt: to === "delivered" || to === "lost" ? now : null,
      })
      .where(eq(leads.id, deal.leadId));
  }

  revalidatePath("/admin/deals");
  revalidatePath(`/admin/deals/${id}`);
  revalidatePath("/admin/vehicles");
  revalidatePath(`/${deal.marketCode}`);
  revalidatePath(`/${deal.marketCode}/inventory`);
  return { ok: true };
}

function friendlyDealError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("deals_delivery_requires_contract"))
    return "A deal must be contracted before it can be delivered.";
  if (msg.includes("deals_financed_requires_terms"))
    return "A financed deal needs both an APR and a term.";
  if (msg.includes("deals_rates_sane"))
    return "Check the APR and tax rate — one of them is out of range.";
  if (msg.includes("deals_lost_requires_reason"))
    return "Record why the deal was lost.";
  if (msg.includes("deals_money_non_negative"))
    return "Amounts cannot be negative.";
  return `Could not save: ${msg}`;
}
