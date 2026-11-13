import "server-only";
import { and, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads, saleHolds, vehicles, type SaleHold } from "@/db/schema";
import { violates } from "@/lib/dbError";
import { MARKETS, type MarketCode } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import type { LeadNotification } from "@/lib/notify";
import {
  CHECKOUT_MINUTES,
  HOLD_DEPOSIT_MINOR,
  HOLD_HOURS,
  HOLD_TERMS_VERSION,
  formatHoldEnd,
  holdReference,
} from "./settings";

/**
 * Holding a car for sale: everything that reads or writes `sale_holds`.
 *
 * Three rules shape this file.
 *
 *  - Only a payment Stripe itself confirms creates a hold. The page a buyer
 *    lands on afterwards is a URL they could type, so nothing here trusts it:
 *    activateSaleHold is called with what a signed webhook or Stripe's own
 *    API said, never with what a browser said.
 *  - One hold per car is the database's rule (a unique index, migration
 *    0034), not this code's. This code turns the refusal into a record staff
 *    can act on.
 *  - Nothing here moves money. A refund is something a member of staff does
 *    in Stripe; this records that they said they did.
 *
 * Every function takes the database as a parameter so
 * scripts/verify-sale-holds.mts can run the real statements against the real
 * migrations in a throwaway Postgres.
 *
 * Server-only, and not a "use server" file: every export of one of those is
 * an endpoint a stranger can call.
 */

type Database = typeof db;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** How long past Stripe's own cut-off a checkout keeps its place. */
const CHECKOUT_GRACE_MINUTES = 4;
/** Stripe retries a webhook for three days; an unpaid row outlives that. */
const ABANDONED_DAYS = 7;
/** Checkouts one phone number may start in an hour. */
const STARTS_PER_HOUR = 5;

/**
 * Whether a query failed because migration 0034 has not been applied.
 *
 * The feature ships before its table exists, so every read treats "no such
 * table" (42P01) or "no such column" (42703) as "feature off" instead of an
 * error page.
 */
export function schemaMissing(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    const code = (current as { code?: unknown }).code;
    if (code === "42P01" || code === "42703") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** What each database said about the table, and when it was asked. */
const tableSeen = new WeakMap<object, { ok: boolean; at: number }>();
/** How long "not there yet" is believed before asking again. */
const RECHECK_MS = 60_000;

/**
 * Whether the `sale_holds` table exists, asked in a way that cannot fail.
 *
 * Every read goes through this first, so a page never sends a query that
 * errors before migration 0034 is applied: `to_regclass` answers null for a
 * missing table instead of raising. Once the table is seen it is never asked
 * about again; until then, once a minute at most.
 *
 * EVERY QUERY IN THIS FILE CARRIES AT LEAST ONE PARAMETER, this one
 * included, and that is load-bearing. The app shares one connection to
 * Supabase's pooler and sends queries down it back to back. The driver sends
 * a query with no parameters in a different way (the simple protocol), and
 * one of those in the middle of the queue leaves every query behind it
 * waiting forever: measured against the real pooler, a car page that ran one
 * never finished. So nothing here may be written with every value inlined
 * (no `sql.raw` for numbers, no literal-only WHERE). The test suite checks
 * every statement this feature sends.
 */
export async function holdsTableReady(database: Database = db): Promise<boolean> {
  const seen = tableSeen.get(database);
  if (seen && (seen.ok || Date.now() - seen.at < RECHECK_MS)) return seen.ok;
  let ok = false;
  try {
    const result: unknown = await database.execute(
      sql`select to_regclass(${"public.sale_holds"}::text) is not null as ok`,
    );
    // postgres.js answers with the rows; PGlite (the test suite) wraps them.
    const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows) ?? [];
    ok = (rows[0] as { ok?: unknown } | undefined)?.ok === true;
  } catch (e) {
    console.error("[sale-hold] could not check for the table", errorName(e));
  }
  tableSeen.set(database, { ok, at: Date.now() });
  return ok;
}

/** What Stripe hosts for us, reduced to what a hold needs. */
export interface HoldStripe {
  createCheckout(req: {
    holdId: string;
    amountMinor: number;
    currency: string;
    description: string;
    customerEmail: string | null;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; reference: string }>;
  /** What Stripe says about a checkout now, or null if it has none. */
  retrieve(sessionId: string): Promise<PaidCheckout | null>;
  /** Closes an unpaid checkout so it can no longer be paid. */
  expire(sessionId: string): Promise<void>;
}

/** A checkout as Stripe reported it: from a signed event or its own API. */
export interface PaidCheckout {
  holdId: string;
  sessionId: string;
  /** True only when Stripe says the money is in. */
  paid: boolean;
  amountMinor: number;
  currency: string;
  /** Stripe's payment id, for the dashboard link. */
  paymentRef: string | null;
  livemode: boolean;
}

/**
 * The deposit for this car, or null when it cannot be held.
 *
 * Only a car that is on sale now, with a price above the deposit, in a
 * market that has a deposit set.
 */
export function holdDepositFor(
  market: MarketCode,
  v: { status: string; listingKind: string; priceMinor: number | null },
): number | null {
  const deposit = HOLD_DEPOSIT_MINOR[market];
  if (!deposit) return null;
  if (v.status !== "available") return null;
  if (v.listingKind !== "sale" && v.listingKind !== "both") return null;
  if (v.priceMinor == null || v.priceMinor <= deposit) return null;
  return deposit;
}

/* ── Time passing ──────────────────────────────────────────────────────── */

/**
 * Ends holds whose time is up and puts their cars back on sale.
 *
 * Lazy, like the rental holds: it runs wherever a hold matters (the car's
 * page, the admin, a new checkout, a payment arriving), so no scheduler is
 * needed. It looks first and writes only if something is due, so the usual
 * call is one indexed read.
 *
 * Never throws. A page that calls this must still render when the table is
 * missing or the database is unwell.
 */
export async function sweepSaleHolds(database: Database = db): Promise<boolean> {
  try {
    if (!(await holdsTableReady(database))) return false;
    const due = await database
      .select({ id: saleHolds.id, status: saleHolds.status })
      .from(saleHolds)
      .where(
        sql`(${saleHolds.status} = 'active' and ${saleHolds.heldUntil} <= now())
          or (${saleHolds.status} = 'checkout' and ${saleHolds.createdAt}
                < now() - make_interval(mins => ${CHECKOUT_MINUTES + CHECKOUT_GRACE_MINUTES}::int))
          or (${saleHolds.status} = 'abandoned' and ${saleHolds.createdAt}
                < now() - make_interval(days => ${ABANDONED_DAYS}::int))`,
      );
    if (due.length === 0) return false;

    const ids = (status: string) => due.filter((d) => d.status === status).map((d) => d.id);
    const active = ids("active");
    const checkout = ids("checkout");
    const abandoned = ids("abandoned");

    if (active.length > 0) {
      await database.transaction(async (tx) => {
        const ended = await tx
          .update(saleHolds)
          // The hold ended when it said it would, not when somebody next looked.
          .set({ status: "expired", endedAt: sql`${saleHolds.heldUntil}`, updatedAt: sql`now()` })
          .where(
            and(
              inArray(saleHolds.id, active),
              eq(saleHolds.status, "active"),
              sql`${saleHolds.heldUntil} <= now()`,
            ),
          )
          .returning({ vehicleId: saleHolds.vehicleId });
        await backOnSale(tx, ended.map((e) => e.vehicleId));
      });
    }

    if (checkout.length > 0) {
      // Not deleted yet: Stripe may still report a payment made in the last
      // second. activateSaleHold accepts an abandoned row for that reason.
      await database
        .update(saleHolds)
        .set({ status: "abandoned", updatedAt: sql`now()` })
        .where(and(inArray(saleHolds.id, checkout), eq(saleHolds.status, "checkout")));
    }

    if (abandoned.length > 0) {
      // A name and a phone number for a deposit that was never paid have no
      // reason to be kept.
      await database
        .delete(saleHolds)
        .where(and(inArray(saleHolds.id, abandoned), eq(saleHolds.status, "abandoned")));
    }
    return true;
  } catch (e) {
    if (!schemaMissing(e)) console.error("[sale-hold] sweep failed", errorName(e));
    return false;
  }
}

/**
 * Returns cars to "available" after their hold ends.
 *
 * Only a car that is still "pending" and has no other hold running: if staff
 * marked it sold in the meantime, or unlisted it, that stands.
 */
async function backOnSale(tx: Tx, vehicleIds: string[]): Promise<void> {
  if (vehicleIds.length === 0) return;
  await tx
    .update(vehicles)
    .set({ status: "available", updatedAt: sql`now()` })
    .where(
      and(
        inArray(vehicles.id, vehicleIds),
        eq(vehicles.status, "pending"),
        sql`not exists (select 1 from sale_holds h
              where h.vehicle_id = ${vehicles.id} and h.status = 'active')`,
      ),
    );
}

/* ── Starting a checkout ───────────────────────────────────────────────── */

export interface StartHoldInput {
  market: MarketCode;
  slug: string;
  name: string;
  phone: string;
  email: string | null;
}

export type StartHoldResult =
  | { ok: true; url: string; holdId: string }
  | { ok: false; error: string };

/**
 * Records who is asking, takes the car's one place at the checkout, and
 * opens Stripe's payment page.
 *
 * The row is written before Stripe is called, for the same reason the rental
 * flow takes its hold first: if somebody else is already paying for this
 * car, the unique index refuses here, before a payment page exists and
 * before any money moves. This holds nothing by itself. The car stays on
 * sale until Stripe confirms the payment.
 *
 * The caller (the server action) has already checked the switch, the test
 * mode rule, the form and the terms box.
 */
export async function startHoldCheckout(
  input: StartHoldInput,
  deps: { stripe: HoldStripe; baseUrl: string; database?: Database },
): Promise<StartHoldResult> {
  const database = deps.database ?? db;
  const cfg = MARKETS[input.market];
  const sorry = "We could not start the payment. Nothing was charged. Please try again or call us.";

  if (!(await holdsTableReady(database))) {
    return { ok: false, error: "Holding a car online is not available yet. Call us and we will help." };
  }
  await sweepSaleHolds(database);

  let holdId: string;
  let label: string;
  let deposit: number;
  try {
    const [v] = await database
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.marketCode, input.market), eq(vehicles.slug, input.slug)))
      .limit(1);
    if (!v) return { ok: false, error: "We could not find that car." };

    if (v.status === "pending") {
      return { ok: false, error: "This car is already on hold. Nothing was charged." };
    }
    const amount = holdDepositFor(input.market, v);
    if (!amount) {
      return { ok: false, error: "This car can't be held online. Call us and we will help." };
    }
    deposit = amount;
    label = [v.year, v.make, v.model].filter(Boolean).join(" ");

    const [{ recent }] = await database
      .select({ recent: sql<number>`count(*)::int` })
      .from(saleHolds)
      .where(
        and(
          eq(saleHolds.buyerPhone, input.phone),
          gte(saleHolds.createdAt, new Date(Date.now() - 60 * 60_000)),
        ),
      );
    if (recent >= STARTS_PER_HOUR) {
      return { ok: false, error: "That is a lot of tries from one number. Please call us and we will hold it for you." };
    }

    const [row] = await database
      .insert(saleHolds)
      .values({
        vehicleId: v.id,
        marketCode: input.market,
        status: "checkout",
        buyerName: input.name,
        buyerPhone: input.phone,
        buyerEmail: input.email,
        amountMinor: deposit,
        currency: cfg.currency,
        holdHours: HOLD_HOURS,
        termsVersion: HOLD_TERMS_VERSION,
        termsAcceptedAt: new Date(),
      })
      .returning({ id: saleHolds.id });
    holdId = row.id;
  } catch (e) {
    if (violates(e, "sale_holds_one_checkout_per_vehicle")) {
      return {
        ok: false,
        error: "Someone is paying to hold this car right now. Nothing was charged. Try again in 30 minutes or call us.",
      };
    }
    if (schemaMissing(e)) {
      return { ok: false, error: "Holding a car online is not available yet. Call us and we will help." };
    }
    console.error("[sale-hold] could not record the request", errorName(e));
    return { ok: false, error: sorry };
  }

  try {
    const amountLabel = formatMoney(money(deposit, cfg.currency), cfg.locale);
    const session = await deps.stripe.createCheckout({
      holdId,
      amountMinor: deposit,
      currency: cfg.currency,
      description: `Refundable deposit to hold the ${label} for ${HOLD_HOURS} hours`,
      customerEmail: input.email,
      successUrl: `${deps.baseUrl}/${input.market}/inventory/held?hold=${holdId}`,
      cancelUrl: `${deps.baseUrl}/${input.market}/inventory/held?hold=${holdId}&canceled=1`,
    });
    await database
      .update(saleHolds)
      .set({ providerRef: session.reference, updatedAt: sql`now()` })
      .where(eq(saleHolds.id, holdId));
    console.log(`[sale-hold] checkout opened for ${holdReference(holdId)}: ${amountLabel}`);
    return { ok: true, url: session.url, holdId };
  } catch (e) {
    // No payment page, so no reason to keep the car's place or the details.
    await database
      .delete(saleHolds)
      .where(and(eq(saleHolds.id, holdId), eq(saleHolds.status, "checkout")))
      .catch(() => {});
    console.error("[sale-hold] checkout failed", errorName(e));
    return { ok: false, error: sorry };
  }
}

/* ── A payment arriving ────────────────────────────────────────────────── */

export type ActivateOutcome =
  /** This call made the hold. */
  | "activated"
  /** An earlier delivery of the same news already did. */
  | "already"
  /** Paid, but the car could not be held: staff must refund. */
  | "conflict"
  /** No such hold: logged, nothing written. */
  | "unknown"
  /** The checkout is not the one this hold opened: logged, nothing written. */
  | "mismatch"
  /** Stripe does not say the money is in. */
  | "unpaid";

export interface ActivateResult {
  outcome: ActivateOutcome;
  hold?: SaleHold;
}

class CarNotFree extends Error {}

/**
 * Turns a paid checkout into a hold: the one place a hold is created.
 *
 * Safe to run twice with the same news, because Stripe delivers it twice.
 * The first statement only matches a row that is still unpaid, so a repeat
 * (or two deliveries racing) finds nothing to change and reports "already".
 *
 * The hold and the car's "pending" status are written together or not at
 * all. If the car cannot be held (another hold is running, which the unique
 * index refuses; or the car is no longer on sale), the payment is still
 * recorded, as a "conflict", so staff see money that needs returning. It is
 * never dropped and never refunded from here.
 */
export async function activateSaleHold(
  paid: PaidCheckout,
  database: Database = db,
): Promise<ActivateResult> {
  if (!paid.paid) return { outcome: "unpaid" };
  await sweepSaleHolds(database);

  const read = async () =>
    (await database.select().from(saleHolds).where(eq(saleHolds.id, paid.holdId)).limit(1))[0];

  const row = await read();
  if (!row) {
    console.error(`[sale-hold] PAID BUT NO RECORD for checkout ${paid.sessionId}: refund it in Stripe`);
    return { outcome: "unknown" };
  }
  if (row.providerRef && row.providerRef !== paid.sessionId) {
    console.error(`[sale-hold] checkout does not match hold ${holdReference(row.id)}`);
    return { outcome: "mismatch" };
  }
  if (row.paidAt) return { outcome: "already", hold: row };

  const paidFields = {
    paidAt: sql`now()`,
    depositState: "held",
    providerRef: paid.sessionId,
    paymentRef: paid.paymentRef,
    livemode: paid.livemode,
    updatedAt: sql`now()`,
  };
  const stillUnpaid = and(
    eq(saleHolds.id, row.id),
    inArray(saleHolds.status, ["checkout", "abandoned"]),
  );

  // Not what was asked for: record the money, hold nothing, let a person look.
  const wrongMoney =
    paid.amountMinor !== row.amountMinor || paid.currency.toUpperCase() !== row.currency;
  if (wrongMoney) {
    console.error(`[sale-hold] hold ${holdReference(row.id)} was paid a different amount than asked`);
  }

  let outcome: ActivateOutcome | null = null;
  if (!wrongMoney) {
    try {
      outcome = await database.transaction(async (tx) => {
        const [held] = await tx
          .update(saleHolds)
          .set({
            ...paidFields,
            status: "active",
            heldUntil: sql`now() + make_interval(hours => ${saleHolds.holdHours})`,
          })
          .where(stillUnpaid)
          .returning({ id: saleHolds.id });
        if (!held) return "already" as const;

        const [car] = await tx
          .update(vehicles)
          .set({ status: "pending", updatedAt: sql`now()` })
          .where(and(eq(vehicles.id, row.vehicleId), eq(vehicles.status, "available")))
          .returning({ id: vehicles.id });
        // Rolls the hold back with it.
        if (!car) throw new CarNotFree();
        return "activated" as const;
      });
    } catch (e) {
      if (!(e instanceof CarNotFree) && !violates(e, "sale_holds_one_active_per_vehicle")) throw e;
    }
  }

  if (!outcome) {
    const [kept] = await database
      .update(saleHolds)
      .set({ ...paidFields, status: "conflict" })
      .where(stillUnpaid)
      .returning({ id: saleHolds.id });
    outcome = kept ? "conflict" : "already";
    if (kept) {
      console.error(
        `[sale-hold] PAID BUT NOT HELD: ${holdReference(row.id)} needs a refund in Stripe`,
      );
    }
  }

  return { outcome, hold: await read() };
}

/**
 * Files the lead staff work from, once per hold.
 *
 * Separate from activation so a lead lost to a crash between the two is
 * filed by the next delivery instead of never. Returns the notification to
 * send when this call filed it, null when one was already there.
 */
export async function ensureHoldLead(
  hold: SaleHold,
  database: Database = db,
): Promise<LeadNotification | null> {
  if (hold.leadId || !hold.paidAt) return null;
  const market = hold.marketCode as MarketCode;
  const cfg = MARKETS[market];

  const [v] = await database
    .select({ year: vehicles.year, make: vehicles.make, model: vehicles.model })
    .from(vehicles)
    .where(eq(vehicles.id, hold.vehicleId))
    .limit(1);
  const car = v ? `${v.year} ${v.make} ${v.model}` : null;
  const amount = formatMoney(money(hold.amountMinor, cfg.currency), cfg.locale);
  const ref = holdReference(hold.id);

  const message =
    hold.status === "conflict"
      ? `Paid a ${amount} deposit, but the car could not be held (it was already held or is no longer for sale). Refund the deposit in Stripe and call the buyer. Reference ${ref}.`
      : `Paid a ${amount} refundable deposit to hold this car until ${
          hold.heldUntil ? formatHoldEnd(hold.heldUntil, cfg.locale, cfg.timezone) : "the time shown in Holds"
        }. Reference ${ref}.`;

  const [lead] = await database
    .insert(leads)
    .values({
      marketCode: market,
      // The lead types are a database enum; a hold is filed as a contact and
      // told apart by its source, so no enum change rides on this feature.
      type: "contact",
      status: "new",
      vehicleId: hold.vehicleId,
      name: hold.buyerName,
      phone: hold.buyerPhone,
      email: hold.buyerEmail,
      message,
      preferredContact: "phone",
      source: "sale_hold",
    })
    .returning({ id: leads.id });

  const [claimed] = await database
    .update(saleHolds)
    .set({ leadId: lead.id })
    .where(and(eq(saleHolds.id, hold.id), isNull(saleHolds.leadId)))
    .returning({ id: saleHolds.id });
  if (!claimed) {
    // Another delivery filed one in the same moment; one lead is enough.
    await database.delete(leads).where(eq(leads.id, lead.id));
    return null;
  }

  return {
    leadId: lead.id,
    type: hold.status === "conflict" ? "Deposit to refund" : "Car held with a deposit",
    market,
    name: hold.buyerName,
    email: hold.buyerEmail,
    phone: hold.buyerPhone,
    message,
    vehicle: car,
    adminUrl: "/admin/holds",
  };
}

/**
 * A checkout Stripe says ended unpaid: the request goes, details and all.
 * Only ever an unpaid row, and only the checkout that row opened.
 */
export async function dropUnpaidCheckout(
  holdId: string,
  sessionId: string,
  database: Database = db,
): Promise<void> {
  if (!isUuid(holdId)) return;
  await database
    .delete(saleHolds)
    .where(
      and(
        eq(saleHolds.id, holdId),
        inArray(saleHolds.status, ["checkout", "abandoned"]),
        or(eq(saleHolds.providerRef, sessionId), isNull(saleHolds.providerRef)),
      ),
    );
}

/**
 * After one buyer's payment made the hold: anyone else still at the checkout
 * for the same car loses their place. Returns their checkouts so the caller
 * can close them at Stripe before a second card is charged.
 */
export async function closeOtherCheckouts(
  hold: SaleHold,
  database: Database = db,
): Promise<string[]> {
  const others = await database
    .update(saleHolds)
    .set({ status: "abandoned", updatedAt: sql`now()` })
    .where(
      and(
        eq(saleHolds.vehicleId, hold.vehicleId),
        eq(saleHolds.status, "checkout"),
        ne(saleHolds.id, hold.id),
      ),
    )
    .returning({ ref: saleHolds.providerRef });
  return others.map((o) => o.ref).filter((r): r is string => Boolean(r));
}

/* ── What staff do ─────────────────────────────────────────────────────── */

export interface StaffChange {
  ok: boolean;
  error?: string;
  hold?: SaleHold;
}

/** Ends a running hold early and puts the car back on sale. */
export async function releaseSaleHold(
  id: string,
  staffId: string,
  database: Database = db,
): Promise<StaffChange> {
  if (!isUuid(id)) return { ok: false, error: "Hold not found." };
  await sweepSaleHolds(database);
  const hold = await database.transaction(async (tx) => {
    const [ended] = await tx
      .update(saleHolds)
      .set({ status: "released", endedAt: sql`now()`, endedBy: staffId, updatedAt: sql`now()` })
      .where(and(eq(saleHolds.id, id), eq(saleHolds.status, "active")))
      .returning();
    if (ended) await backOnSale(tx, [ended.vehicleId]);
    return ended;
  });
  return hold ? { ok: true, hold } : { ok: false, error: "That hold is no longer running." };
}

/**
 * Records what a member of staff did with the deposit in Stripe.
 *
 *  - "refunded": they sent it back. A hold still running ends, and the car
 *    goes back on sale: nobody holds a car with money they no longer have in.
 *  - "applied": it went toward the sale. A hold still running is finished,
 *    and the car stays "pending" until staff mark it sold.
 *  - "held": undoes a wrong tap. The record goes back to "we have it"; a
 *    hold that ended stays ended.
 *
 * This writes a record. It does not, and must never, call Stripe.
 */
export async function markSaleHoldDeposit(
  id: string,
  to: "refunded" | "applied" | "held",
  staffId: string,
  database: Database = db,
): Promise<StaffChange> {
  if (!isUuid(id)) return { ok: false, error: "Hold not found." };
  await sweepSaleHolds(database);
  const hold = await database.transaction(async (tx) => {
    const [marked] = await tx
      .update(saleHolds)
      .set({
        depositState: to,
        depositMarkedAt: to === "held" ? null : sql`now()`,
        depositMarkedBy: to === "held" ? null : staffId,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(saleHolds.id, id),
          to === "held"
            ? inArray(saleHolds.depositState, ["refunded", "applied"])
            : eq(saleHolds.depositState, "held"),
        ),
      )
      .returning();
    if (!marked || marked.status !== "active" || to === "held") return marked;

    const [ended] = await tx
      .update(saleHolds)
      .set({
        status: to === "refunded" ? "released" : "completed",
        endedAt: sql`now()`,
        endedBy: staffId,
      })
      .where(eq(saleHolds.id, id))
      .returning();
    if (to === "refunded") await backOnSale(tx, [ended.vehicleId]);
    return ended;
  });
  return hold ? { ok: true, hold } : { ok: false, error: "That deposit is already marked." };
}

/* ── Reading ───────────────────────────────────────────────────────────── */

export interface HoldWithCar {
  hold: SaleHold;
  car: { id: string; slug: string; year: number; make: string; model: string; status: string } | null;
}

/**
 * Paid holds, newest first, for the admin. Null when the table is missing
 * (the migration has not been applied), which the page shows as such.
 */
export async function listSaleHolds(
  markets: MarketCode[],
  database: Database = db,
): Promise<HoldWithCar[] | null> {
  try {
    if (!(await holdsTableReady(database))) return null;
    const rows = await database
      .select({
        hold: saleHolds,
        car: {
          id: vehicles.id,
          slug: vehicles.slug,
          year: vehicles.year,
          make: vehicles.make,
          model: vehicles.model,
          status: vehicles.status,
        },
      })
      .from(saleHolds)
      .leftJoin(vehicles, eq(vehicles.id, saleHolds.vehicleId))
      .where(
        and(
          inArray(saleHolds.marketCode, markets),
          // Unpaid checkouts are not staff's business: nobody has paid.
          sql`${saleHolds.paidAt} is not null`,
        ),
      )
      .orderBy(desc(saleHolds.createdAt))
      .limit(200);
    return rows;
  } catch (e) {
    if (schemaMissing(e)) return null;
    throw e;
  }
}

/** One hold and its car, by the id in the buyer's return link. */
export async function getSaleHold(
  id: string,
  database: Database = db,
): Promise<HoldWithCar | null> {
  if (!isUuid(id)) return null;
  try {
    if (!(await holdsTableReady(database))) return null;
    const [row] = await database
      .select({
        hold: saleHolds,
        car: {
          id: vehicles.id,
          slug: vehicles.slug,
          year: vehicles.year,
          make: vehicles.make,
          model: vehicles.model,
          status: vehicles.status,
        },
      })
      .from(saleHolds)
      .leftJoin(vehicles, eq(vehicles.id, saleHolds.vehicleId))
      .where(eq(saleHolds.id, id))
      .limit(1);
    return row ?? null;
  } catch (e) {
    if (schemaMissing(e)) return null;
    throw e;
  }
}

export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/**
 * Why something failed, without what was being written. Drizzle's message
 * repeats every value in the query, which here means a buyer's name and
 * phone number; the driver's error underneath does not.
 */
function errorName(e: unknown): string {
  const inner = e instanceof Error && e.cause instanceof Error ? e.cause : e;
  if (!(inner instanceof Error)) return "unknown error";
  if (/^Failed query/i.test(inner.message)) return inner.name;
  const code = (inner as { code?: unknown }).code;
  return [inner.name, typeof code === "string" ? code : null, inner.message.slice(0, 160)]
    .filter(Boolean)
    .join(" ");
}
