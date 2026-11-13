import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, gt, inArray, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { db as realDb } from "@/db";
import { priceAlerts, vehicles } from "@/db/schema";
import type { MarketCode } from "@/lib/market";
import {
  CONFIRM_RESEND_MINUTES,
  ENDED_KEEP_DAYS,
  MAX_CONFIRMS_PER_HOUR,
  MAX_PENDING_PER_EMAIL,
  MAX_PER_BROWSER,
  MAX_PER_EMAIL,
  UNCONFIRMED_KEEP_DAYS,
  canWatch,
  knownPrice,
  owedAlert,
  type AlertCar,
} from "./rules";

/**
 * Price-drop alerts: everything that touches the `price_alerts` table.
 *
 * Every function takes the database as its last argument so the test suite
 * can hand it an in-memory Postgres (scripts/verify-price-alerts.mts).
 *
 * The table arrives with migration 0033, which is applied by hand after the
 * code ships. Until then every query here fails with "relation does not
 * exist". The read paths (`pushStatus`, `watcherCounts`) catch that and
 * answer as if nobody is watching; the write paths answer "unavailable".
 * Nothing here throws at a page.
 */

export type Db = typeof realDb;

/** Whether an error is Postgres saying the table or a column is not there yet. */
export function isMissingAlertsTable(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    const e = current as { code?: unknown; cause?: unknown };
    if (e.code === "42P01" || e.code === "42703") return true;
    current = e.cause;
  }
  return false;
}

/**
 * A short, safe description of a failure for the log. Never the error
 * itself: Drizzle's message repeats the query's parameters, which here are
 * email addresses and push endpoints.
 */
export function safeReason(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    const e = current as { code?: unknown; cause?: unknown };
    if (typeof e.code === "string") return `database error ${e.code}`;
    current = e.cause;
  }
  return error instanceof Error ? error.name : "unknown error";
}

const newToken = () => randomBytes(24).toString("base64url");
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

export type WatchRefusal =
  /** No such car, or it is not one that can be watched (sold, rental only, no price). */
  | "not-watchable"
  /** This browser or address already watches as many cars as it may. */
  | "limit"
  /** Too many confirmation emails lately; try later. */
  | "busy"
  /** The table is not there yet, or the database failed. */
  | "unavailable";

interface CarRow extends AlertCar {
  id: string;
  status: string;
  listingKind: string;
  priceMinor: number | null;
}

async function findCar(market: MarketCode, slug: string, db: Db): Promise<CarRow | null> {
  const [row] = await db
    .select({
      id: vehicles.id,
      marketCode: vehicles.marketCode,
      slug: vehicles.slug,
      year: vehicles.year,
      make: vehicles.make,
      model: vehicles.model,
      trim: vehicles.trim,
      status: vehicles.status,
      listingKind: vehicles.listingKind,
      priceMinor: vehicles.priceMinor,
    })
    .from(vehicles)
    .where(and(eq(vehicles.marketCode, market), eq(vehicles.slug, slug)))
    .limit(1);
  return row ?? null;
}

const count = sql<number>`count(*)::int`;

/* ── Watching by browser notification ──────────────────────────────────── */

export interface PushKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * This browser watches this car. Asking twice is the same as asking once:
 * the row stays, with its first price, and only the keys are refreshed.
 */
export async function watchByPush(
  input: { market: MarketCode; slug: string } & PushKeys,
  db: Db = realDb,
): Promise<{ ok: true } | { ok: false; reason: WatchRefusal }> {
  try {
    const car = await findCar(input.market, input.slug, db);
    if (!car || !canWatch(car)) return { ok: false, reason: "not-watchable" };

    const [existing] = await db
      .select({ id: priceAlerts.id })
      .from(priceAlerts)
      .where(and(eq(priceAlerts.vehicleId, car.id), eq(priceAlerts.pushEndpoint, input.endpoint)))
      .limit(1);
    if (existing) {
      await db
        .update(priceAlerts)
        .set({ pushP256dh: input.p256dh, pushAuth: input.auth, failureCount: 0, endedAt: null })
        .where(eq(priceAlerts.id, existing.id));
      return { ok: true };
    }

    const [{ n }] = await db
      .select({ n: count })
      .from(priceAlerts)
      .where(eq(priceAlerts.pushEndpoint, input.endpoint));
    if (n >= MAX_PER_BROWSER) return { ok: false, reason: "limit" };

    await db
      .insert(priceAlerts)
      .values({
        vehicleId: car.id,
        marketCode: car.marketCode,
        channel: "push",
        pushEndpoint: input.endpoint,
        pushP256dh: input.p256dh,
        pushAuth: input.auth,
        priceMinorAtWatch: car.priceMinor!,
        stopToken: newToken(),
        // A browser that granted permission and sent its own subscription
        // has already said yes; there is nothing further to confirm.
        confirmedAt: new Date(),
      })
      // Two taps racing: the second finds the first one's row.
      .onConflictDoNothing();
    return { ok: true };
  } catch (e) {
    if (!isMissingAlertsTable(e)) console.error("[alerts] watch by push failed:", safeReason(e));
    return { ok: false, reason: "unavailable" };
  }
}

/** Whether this browser watches this car. Null when it cannot be known. */
export async function pushStatus(
  input: { market: MarketCode; slug: string; endpoint: string },
  db: Db = realDb,
): Promise<boolean | null> {
  try {
    const [row] = await db
      .select({ id: priceAlerts.id })
      .from(priceAlerts)
      .innerJoin(vehicles, eq(vehicles.id, priceAlerts.vehicleId))
      .where(
        and(
          eq(vehicles.marketCode, input.market),
          eq(vehicles.slug, input.slug),
          eq(priceAlerts.pushEndpoint, input.endpoint),
          isNull(priceAlerts.endedAt),
        ),
      )
      .limit(1);
    return Boolean(row);
  } catch (e) {
    if (!isMissingAlertsTable(e)) console.error("[alerts] status failed:", safeReason(e));
    return null;
  }
}

/** This browser stops watching this car. The row is deleted. */
export async function stopByPush(
  input: { market: MarketCode; slug: string; endpoint: string },
  db: Db = realDb,
): Promise<boolean> {
  try {
    const car = await findCar(input.market, input.slug, db);
    if (!car) return true;
    await db
      .delete(priceAlerts)
      .where(and(eq(priceAlerts.vehicleId, car.id), eq(priceAlerts.pushEndpoint, input.endpoint)));
    return true;
  } catch (e) {
    if (!isMissingAlertsTable(e)) console.error("[alerts] stop by push failed:", safeReason(e));
    return false;
  }
}

/* ── Watching by email ─────────────────────────────────────────────────── */

export interface ConfirmToSend {
  to: string;
  confirmToken: string;
  stopToken: string;
  car: AlertCar;
  priceMinor: number;
}

/**
 * An address asks to watch a car. Nothing is sent to it about prices until
 * the confirmation link's button is pressed.
 *
 * The answer never says whether the address was already on file, so this
 * cannot be used to find out who watches what: a new address, a waiting one
 * and a confirmed one all get `{ ok: true }`. `confirm` is the email to
 * send, when one is due.
 *
 * `browserToken` is a random string the asking browser made up. It becomes
 * the row's stop token only when this request created the row, which is
 * what lets "Stop price alerts" on the car page work for the browser that
 * asked, and for nobody who merely typed somebody else's address.
 */
export async function watchByEmail(
  input: { market: MarketCode; slug: string; email: string; browserToken?: string },
  db: Db = realDb,
): Promise<{ ok: true; confirm: ConfirmToSend | null } | { ok: false; reason: WatchRefusal }> {
  const email = input.email.trim().toLowerCase();
  try {
    const car = await findCar(input.market, input.slug, db);
    if (!car || !canWatch(car)) return { ok: false, reason: "not-watchable" };

    const hourAgo = new Date(Date.now() - 60 * 60_000);
    const fuseBlown = async () => {
      const [{ n }] = await db
        .select({ n: count })
        .from(priceAlerts)
        .where(and(isNotNull(priceAlerts.confirmSentAt), gt(priceAlerts.confirmSentAt, hourAgo)));
      return n >= MAX_CONFIRMS_PER_HOUR;
    };

    const [existing] = await db
      .select()
      .from(priceAlerts)
      .where(and(eq(priceAlerts.vehicleId, car.id), eq(priceAlerts.email, email)))
      .limit(1);

    if (existing) {
      if (existing.confirmedAt || !existing.confirmToken) return { ok: true, confirm: null };
      const waitUntil = (existing.confirmSentAt?.getTime() ?? 0) + CONFIRM_RESEND_MINUTES * 60_000;
      if (Date.now() < waitUntil || (await fuseBlown())) return { ok: true, confirm: null };
      await db
        .update(priceAlerts)
        .set({ confirmSentAt: new Date() })
        .where(eq(priceAlerts.id, existing.id));
      return {
        ok: true,
        confirm: {
          to: email,
          confirmToken: existing.confirmToken,
          stopToken: existing.stopToken,
          car,
          priceMinor: existing.priceMinorAtWatch,
        },
      };
    }

    const mine = await db
      .select({ confirmedAt: priceAlerts.confirmedAt })
      .from(priceAlerts)
      .where(eq(priceAlerts.email, email));
    if (mine.length >= MAX_PER_EMAIL) return { ok: false, reason: "limit" };
    if (mine.filter((r) => !r.confirmedAt).length >= MAX_PENDING_PER_EMAIL) {
      return { ok: false, reason: "limit" };
    }
    if (await fuseBlown()) return { ok: false, reason: "busy" };

    const confirmToken = newToken();
    const values = {
      vehicleId: car.id,
      marketCode: car.marketCode,
      channel: "email" as const,
      email,
      priceMinorAtWatch: car.priceMinor!,
      confirmToken,
      confirmSentAt: new Date(),
    };
    const wanted =
      input.browserToken && TOKEN_RE.test(input.browserToken) ? input.browserToken : newToken();

    let stopToken = wanted;
    let inserted = await db
      .insert(priceAlerts)
      .values({ ...values, stopToken })
      .onConflictDoNothing()
      .returning({ id: priceAlerts.id });
    if (inserted.length === 0) {
      // Either the same address asked twice at once, or the browser's token
      // is already in use. A fresh token settles the second; the first then
      // inserts nothing again, and no second email goes out.
      stopToken = newToken();
      inserted = await db
        .insert(priceAlerts)
        .values({ ...values, stopToken })
        .onConflictDoNothing()
        .returning({ id: priceAlerts.id });
      if (inserted.length === 0) return { ok: true, confirm: null };
    }

    return {
      ok: true,
      confirm: { to: email, confirmToken, stopToken, car, priceMinor: car.priceMinor! },
    };
  } catch (e) {
    if (!isMissingAlertsTable(e)) console.error("[alerts] watch by email failed:", safeReason(e));
    return { ok: false, reason: "unavailable" };
  }
}

export interface TokenCar extends AlertCar {
  confirmed: boolean;
}

const tokenCar = {
  marketCode: vehicles.marketCode,
  slug: vehicles.slug,
  year: vehicles.year,
  make: vehicles.make,
  model: vehicles.model,
  trim: vehicles.trim,
  confirmedAt: priceAlerts.confirmedAt,
};

/** The car a confirm or stop link is about, for the page that shows the button. */
export async function findByToken(
  kind: "confirm" | "stop",
  token: string,
  db: Db = realDb,
): Promise<TokenCar | null> {
  if (!TOKEN_RE.test(token)) return null;
  try {
    const [row] = await db
      .select(tokenCar)
      .from(priceAlerts)
      .innerJoin(vehicles, eq(vehicles.id, priceAlerts.vehicleId))
      .where(eq(kind === "confirm" ? priceAlerts.confirmToken : priceAlerts.stopToken, token))
      .limit(1);
    if (!row) return null;
    const { confirmedAt, ...car } = row;
    return { ...car, confirmed: Boolean(confirmedAt) };
  } catch (e) {
    if (!isMissingAlertsTable(e)) console.error("[alerts] token lookup failed:", safeReason(e));
    return null;
  }
}

/** The address confirms. The link works once; the token is then cleared. */
export async function confirmEmail(token: string, db: Db = realDb): Promise<AlertCar | null> {
  if (!TOKEN_RE.test(token)) return null;
  try {
    const car = await findByToken("confirm", token, db);
    if (!car) return null;
    const done = await db
      .update(priceAlerts)
      .set({ confirmedAt: new Date(), confirmToken: null })
      .where(eq(priceAlerts.confirmToken, token))
      .returning({ id: priceAlerts.id });
    return done.length > 0 ? car : null;
  } catch (e) {
    if (!isMissingAlertsTable(e)) console.error("[alerts] confirm failed:", safeReason(e));
    return null;
  }
}

/** Stops one alert by its token. The row, address and all, is deleted. */
export async function stopByToken(token: string, db: Db = realDb): Promise<AlertCar | null> {
  if (!TOKEN_RE.test(token)) return null;
  try {
    const car = await findByToken("stop", token, db);
    if (!car) return null;
    await db.delete(priceAlerts).where(eq(priceAlerts.stopToken, token));
    return car;
  } catch (e) {
    if (!isMissingAlertsTable(e)) console.error("[alerts] stop failed:", safeReason(e));
    return null;
  }
}

/* ── For staff ─────────────────────────────────────────────────────────── */

/**
 * How many people watch each car's price: confirmed, and the car still on.
 * An empty map when the table is not there yet.
 */
export async function watcherCounts(
  vehicleIds: string[],
  db: Db = realDb,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (vehicleIds.length === 0) return out;
  try {
    const rows = await db
      .select({ vehicleId: priceAlerts.vehicleId, n: count })
      .from(priceAlerts)
      .where(
        and(
          inArray(priceAlerts.vehicleId, vehicleIds),
          isNotNull(priceAlerts.confirmedAt),
          isNull(priceAlerts.endedAt),
        ),
      )
      .groupBy(priceAlerts.vehicleId);
    for (const r of rows) out.set(r.vehicleId, r.n);
  } catch (e) {
    if (!isMissingAlertsTable(e)) console.error("[alerts] counts failed:", safeReason(e));
  }
  return out;
}

/* ── When a price drops ────────────────────────────────────────────────── */

export interface OwedWatcher {
  id: string;
  channel: "push" | "email";
  push: PushKeys | null;
  email: string | null;
  stopToken: string;
  /** The last price they knew, which the message calls the old price. */
  oldPriceMinor: number;
}

/**
 * Finds every watcher owed a message at the new price and marks each as
 * told, before anything is sent.
 *
 * Marking first is the point. The update repeats the rule in its WHERE, so
 * two saves racing, or the same price saved twice, can each claim a watcher
 * only once: one alert per drop. A message that then fails to send is not
 * retried, because a missed alert is a smaller fault than a repeated one.
 */
export async function claimDrop(
  vehicleId: string,
  newPriceMinor: number,
  db: Db = realDb,
): Promise<OwedWatcher[]> {
  const rows = await db
    .select()
    .from(priceAlerts)
    .where(
      and(
        eq(priceAlerts.vehicleId, vehicleId),
        isNotNull(priceAlerts.confirmedAt),
        isNull(priceAlerts.endedAt),
      ),
    );
  const owed = rows.filter((r) => owedAlert(r, newPriceMinor));
  if (owed.length === 0) return [];

  const claimed = await db
    .update(priceAlerts)
    .set({ lastAlertPriceMinor: newPriceMinor, lastAlertAt: new Date() })
    .where(
      and(
        inArray(
          priceAlerts.id,
          owed.map((r) => r.id),
        ),
        sql`coalesce(${priceAlerts.lastAlertPriceMinor}, ${priceAlerts.priceMinorAtWatch}) > ${newPriceMinor}`,
      ),
    )
    .returning({ id: priceAlerts.id });
  const mine = new Set(claimed.map((c) => c.id));

  return owed
    .filter((r) => mine.has(r.id))
    .map((r) => ({
      id: r.id,
      channel: r.channel,
      push:
        r.channel === "push" && r.pushEndpoint && r.pushP256dh && r.pushAuth
          ? { endpoint: r.pushEndpoint, p256dh: r.pushP256dh, auth: r.pushAuth }
          : null,
      email: r.email,
      stopToken: r.stopToken,
      oldPriceMinor: knownPrice(r),
    }));
}

/** A browser the push service says is gone: all its alerts are deleted. */
export async function forgetBrowsers(endpoints: string[], db: Db = realDb): Promise<void> {
  if (endpoints.length === 0) return;
  await db.delete(priceAlerts).where(inArray(priceAlerts.pushEndpoint, endpoints));
}

/** A message that failed for another reason is counted against its row. */
export async function countFailures(ids: string[], db: Db = realDb): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(priceAlerts)
    .set({ failureCount: sql`${priceAlerts.failureCount} + 1` })
    .where(inArray(priceAlerts.id, ids));
}

/**
 * Housekeeping, run after any car is saved. Lazy on purpose, like the rental
 * holds: no scheduled job, and nothing to go stale between runs because it
 * reads the cars as they are now.
 *
 *  1. A car that is sold or unlisted: its watchers are marked ended.
 *  2. A car back on sale (a sale fell through): its watchers are live again.
 *  3. Ended more than 30 days ago: deleted.
 *  4. An address that never confirmed in 7 days: deleted.
 */
export async function sweepAlerts(db: Db = realDb, now: Date = new Date()): Promise<void> {
  const off = db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(inArray(vehicles.status, ["sold", "unlisted"]));

  await db
    .update(priceAlerts)
    .set({ endedAt: now })
    .where(and(isNull(priceAlerts.endedAt), inArray(priceAlerts.vehicleId, off)));

  await db
    .update(priceAlerts)
    .set({ endedAt: null })
    .where(and(isNotNull(priceAlerts.endedAt), notInArray(priceAlerts.vehicleId, off)));

  const day = 86_400_000;
  await db
    .delete(priceAlerts)
    .where(
      or(
        lt(priceAlerts.endedAt, new Date(now.getTime() - ENDED_KEEP_DAYS * day)),
        and(
          isNull(priceAlerts.confirmedAt),
          lt(priceAlerts.createdAt, new Date(now.getTime() - UNCONFIRMED_KEEP_DAYS * day)),
        ),
      ),
    );
}
