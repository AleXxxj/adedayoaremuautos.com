import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { staff, vinCheckUsage } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import {
  milesProblem,
  nextMonthLabel,
  readMiles,
  readZip,
  zipProblem,
  type ValueResult,
} from "@/components/valueSteps";
import { checkVin } from "./validate";
import {
  DEMAND_RADIUS_MILES,
  fetchDemand,
  fetchPrice,
  marketCheckKey,
  mayEstimate,
  monthlyCap,
  valueAccess,
  wantsDemand,
  type CallOptions,
} from "./marketcheck";

/**
 * The guarded path to a paid call: everything that has to be true before
 * MarketCheck is asked for a price, in the order it is checked.
 *
 *   1. The estimate is switched on for this person (the switches in
 *      marketcheck.ts, plus a staff session while it is staff-only).
 *   2. The VIN, miles and ZIP are well formed. A typo costs nothing.
 *   3. The visitor has a lookup left today (usage.ts), the same allowance
 *      the free car check draws on.
 *   4. NHTSA decodes the VIN to a year, make and model, so a random string
 *      of 17 characters never reaches a paid API.
 *   5. The month's cap has room. The call is counted before it is made.
 *
 * Then one price call, once, and, if it priced the car, one demand call.
 * The answer goes back to the page that asked and is kept nowhere.
 */

/* ── Staff, while the estimate is not public ───────────────────────────── */

/**
 * Whether the request comes from a signed-in, active member of staff.
 *
 * requireStaff (lib/auth.ts) asks the same two questions but answers "no"
 * with a redirect to the admin login, and signs a stranger out. This page is
 * public: "no" has to be a plain false that leaves the visitor where they
 * are, session untouched.
 */
export async function isStaffSession(): Promise<boolean> {
  // Outside the try: reading cookies is how Next learns a page can't be
  // built ahead of time, and it says so by throwing. Swallowing that would
  // freeze "not staff" into a cached page.
  const supabase = await createClient();
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const [record] = await db
      .select({ isActive: staff.isActive })
      .from(staff)
      .where(eq(staff.id, user.id))
      .limit(1);
    return record?.isActive === true;
  } catch {
    return false;
  }
}

/* ── The month's cap ───────────────────────────────────────────────────── */

/**
 * The row MarketCheck calls are counted on.
 *
 * It lives in vin_check_usage, the table that counts each visitor's lookups
 * per day, because that table is keyed (who, day) and holds a count, and no
 * migration was to be added. The row's "who" is this name, which no visitor
 * key can equal (those are 22 characters of base64url; this has a colon),
 * and its day is the LAST day of the month being counted.
 *
 * The last day, not the first: spendLookup (usage.ts) deletes rows whose day
 * is more than two days old. A row dated the month's last day is kept for
 * the whole month and swept away two days into the next, which is exactly
 * the life a monthly count should have. scripts/verify-value.mts runs the
 * real cleanup over a month to hold that true.
 *
 * It counts calls, not dollars, and holds nothing from MarketCheck.
 */
export const CALL_COUNTER = "marketcheck:calls";

/** The last day of `now`'s month (UTC), as "2026-11-30". */
export function monthEnd(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

/**
 * Counts one MarketCheck call against the month's cap; false when the cap is
 * reached, and the call must not be made.
 *
 * One statement, so two visitors at once can't both take the last call.
 * Counted before the call and never given back: a call that timed out here
 * may still have been billed there.
 *
 * Fails closed, unlike the free check's daily count: if the count can't be
 * kept, nothing is spent.
 */
export async function reserveCall(
  cap: number,
  // For scripts/verify-value.mts.
  test?: { database: typeof db; now: Date },
): Promise<boolean> {
  if (!Number.isInteger(cap) || cap < 1) return false;
  const database = test?.database ?? db;
  const day = monthEnd(test?.now ?? new Date());
  try {
    const [row] = await database
      .insert(vinCheckUsage)
      .values({ visitor: CALL_COUNTER, day, lookups: 1 })
      .onConflictDoUpdate({
        target: [vinCheckUsage.visitor, vinCheckUsage.day],
        set: { lookups: sql`${vinCheckUsage.lookups} + 1` },
        // No row comes back when this is false: the cap is reached.
        setWhere: sql`${vinCheckUsage.lookups} < ${cap}`,
      })
      .returning({ lookups: vinCheckUsage.lookups });
    return row !== undefined;
  } catch (e) {
    console.error(
      `[value] call count unavailable (${e instanceof Error ? e.name : "error"}); not calling MarketCheck`,
    );
    return false;
  }
}

/* ── One estimate ──────────────────────────────────────────────────────── */

export interface EstimateDeps {
  env: Record<string, string | undefined>;
  isStaff: () => Promise<boolean>;
  /** One of the visitor's daily lookups; false when they are used up. */
  spend: () => Promise<boolean>;
  /** NHTSA's decode: null when it can't be reached. */
  decode: (vin: string) => Promise<{ year: number | null; make: string | null; model: string | null } | null>;
  reserve: (cap: number) => Promise<boolean>;
  now: () => Date;
  call?: CallOptions;
}

const OFF: ValueResult = { ok: false, failure: "off" };

export async function runEstimate(
  input: { vin: string; miles: string; zip: string },
  deps: EstimateDeps,
): Promise<ValueResult> {
  const access = valueAccess(deps.env);
  const key = marketCheckKey(deps.env);
  if (access === "off" || !key) return OFF;
  // Asked only while the estimate is staff-only: a public page reads no session.
  if (!mayEstimate(access, access === "staff" ? await deps.isStaff() : false)) return OFF;

  const check = checkVin(input.vin);
  if (!check.wellFormed) {
    return { ok: false, failure: "input", field: "vin", error: check.message ?? "Check the VIN." };
  }
  const milesError = milesProblem(input.miles);
  const miles = readMiles(input.miles);
  if (milesError || miles === null) {
    return { ok: false, failure: "input", field: "miles", error: milesError ?? "Type the miles." };
  }
  const zip = readZip(input.zip);
  if (!zip) return { ok: false, failure: "input", field: "zip", error: zipProblem(input.zip) ?? "Check the ZIP code." };

  if (!(await deps.spend())) return { ok: false, failure: "limit" };

  const car = await deps.decode(check.vin);
  if (!car) {
    return {
      ok: false,
      failure: "down",
      error: "We couldn't reach NHTSA to confirm this VIN. Try again in a minute.",
    };
  }
  if (!car.year || !car.make || !car.model) {
    return {
      ok: false,
      failure: "input",
      field: "vin",
      error: "NHTSA couldn't decode this VIN. Compare it with the one on the car.",
    };
  }

  const now = deps.now();
  const cap = monthlyCap(deps.env);
  const usedUp: ValueResult = { ok: false, failure: "cap", resets: nextMonthLabel(now) };
  if (!(await deps.reserve(cap))) return usedUp;

  const query = { vin: check.vin, miles, zip };
  const priced = await fetchPrice(query, key, deps.call);
  if (priced.kind === "quota") return usedUp;
  if (priced.kind === "none") return { ok: false, failure: "none" };
  if (priced.kind !== "price") return { ok: false, failure: "down" };

  // Only for a car that was priced, and only with room under the cap: the
  // line is an extra, and its absence is not a failure.
  const demand =
    wantsDemand(deps.env) && (await deps.reserve(cap)) ? await fetchDemand(query, key, deps.call) : null;

  return {
    ok: true,
    estimate: {
      price: priced.price,
      msrp: priced.msrp,
      miles,
      zip,
      asOf: now.toISOString(),
      demand,
      radiusMiles: DEMAND_RADIUS_MILES,
    },
  };
}
