import "server-only";
import { MAX_MILES } from "@/components/valueSteps";
import { VIN_PATTERN } from "./validate";

/**
 * MarketCheck: what dealers ask for a car like this one, and how fast cars
 * like it sell nearby.
 *
 * Built to MarketCheck's docs as read on Nov 12, 2026 (no key existed yet, so
 * nothing here has met the real API):
 *
 *   GET /v2/predict/car/us/marketcheck_price
 *       api_key, vin, miles, dealer_type (franchise | independent), zip
 *       -> { marketcheck_price: number | null, msrp: number | null }
 *       400 when the VIN can't be decoded or priced.
 *   GET /v2/mds/car
 *       api_key, vin, zip, radius, car_type
 *       -> { mds: number | null, total_active_cars_for_ymmt,
 *            total_cars_sold_in_last_45_days }
 *       mds = cars for sale / average daily sales over the last 45 days;
 *       null when none sold. 422 when the VIN can't be decoded.
 *   429 with { message: "Monthly API quota exhausted" } once the month's
 *       calls are used up, or "API rate limit exceeded" for too many a second.
 *   Errors are { code, message }, except 502 and 503.
 *
 * Three rules from MarketCheck's Developer Platform Terms (Oct 20, 2026)
 * shape this file:
 *
 *   - Nothing is kept (5.1.4, 7.1): no cache, no database row, no log line
 *     holds anything MarketCheck returned. An answer lives for the one
 *     request that asked for it.
 *   - Results go only to the person who asked, inside this site (3.2).
 *   - The key is confidential (1.3). MarketCheck takes it in the query
 *     string, so the URL is built here, on the server, and is never returned,
 *     thrown or logged. Failures are logged by a fixed name: an error's own
 *     message can carry the request.
 *
 * Only the VIN, the miles and the ZIP are sent. Nothing about the visitor.
 */

export const MARKETCHECK_API = "https://api.marketcheck.com";
const PRICE_PATH = "/v2/predict/car/us/marketcheck_price";
const DEMAND_PATH = "/v2/mds/car";

/** The widest search the Free and Basic plans allow, and what the page says. */
export const DEMAND_RADIUS_MILES = 100;

/** A paid call gets one try and this long. */
export const PRICE_TIMEOUT_MS = 8_000;
/** The demand line is an extra: it never holds the estimate up for long. */
export const DEMAND_TIMEOUT_MS = 5_000;

const ZIP_PATTERN = /^\d{5}$/;

/* ── The switches ──────────────────────────────────────────────────────── */

type Env = Record<string, string | undefined>;

/**
 * The key, or null when there is none to use.
 *
 * A sandbox key (mc_test_) counts as none: MarketCheck's sandbox leaves the
 * price endpoint out, and its docs say never to show sandbox numbers to
 * anyone.
 */
export function marketCheckKey(env: Env = process.env): string | null {
  const key = env.MARKETCHECK_API_KEY?.trim();
  if (!key || key.startsWith("mc_test_")) return null;
  return key;
}

/**
 * Who the estimate is switched on for.
 *
 *   no key                          -> "off": nobody.
 *   key                             -> "staff": signed-in staff only, to try it.
 *   key and VALUE_CHECK_PUBLIC=1    -> "public": every visitor.
 */
export type ValueAccess = "off" | "staff" | "public";

export function valueAccess(env: Env = process.env): ValueAccess {
  if (!marketCheckKey(env)) return "off";
  return env.VALUE_CHECK_PUBLIC?.trim() === "1" ? "public" : "staff";
}

export function mayEstimate(access: ValueAccess, isStaff: boolean): boolean {
  return access === "public" || (access === "staff" && isStaff);
}

export const DEFAULT_MONTHLY_CAP = 400;

/**
 * The most MarketCheck calls this site makes in a month.
 *
 * 400 unless VALUE_CHECK_MONTHLY_CAP says otherwise: under the Free plan's
 * 500. 0 stops every call. Anything that isn't a whole number falls back to
 * 400, so a typo can't take the limit away.
 */
export function monthlyCap(env: Env = process.env): number {
  const raw = env.VALUE_CHECK_MONTHLY_CAP?.trim();
  if (!raw || !/^\d{1,7}$/.test(raw)) return DEFAULT_MONTHLY_CAP;
  return Number(raw);
}

/** The demand line costs a second call per estimate; VALUE_CHECK_DEMAND=0 leaves it out. */
export function wantsDemand(env: Env = process.env): boolean {
  return env.VALUE_CHECK_DEMAND?.trim() !== "0";
}

/* ── The request ───────────────────────────────────────────────────────── */

export interface CarQuery {
  /** Uppercase, 17 characters (checkVin). */
  vin: string;
  /** Whole miles on the odometer. */
  miles: number;
  /** Five digits. */
  zip: string;
}

/** Refuses anything but a clean VIN, whole miles and a 5-digit ZIP: nothing else goes in a URL. */
function assertQuery(q: CarQuery): void {
  if (
    !VIN_PATTERN.test(q.vin) ||
    !Number.isInteger(q.miles) ||
    q.miles < 0 ||
    q.miles > MAX_MILES ||
    !ZIP_PATTERN.test(q.zip)
  ) {
    // Names no value: this message can reach a log.
    throw new Error("MarketCheck query is not a clean VIN, miles and ZIP");
  }
}

function endpoint(path: string, params: Record<string, string>, base: string): string {
  const url = new URL(path, base);
  url.search = new URLSearchParams(params).toString();
  return url.toString();
}

/**
 * The price request. "independent" because that is the kind of dealer the
 * page says the price is typical of, and the kind this business is.
 */
export function priceUrl(q: CarQuery, key: string, base: string = MARKETCHECK_API): string {
  assertQuery(q);
  return endpoint(
    PRICE_PATH,
    { api_key: key, vin: q.vin, miles: String(q.miles), dealer_type: "independent", zip: q.zip },
    base,
  );
}

/** The demand request: used cars like this one within 100 miles of the ZIP. */
export function demandUrl(q: CarQuery, key: string, base: string = MARKETCHECK_API): string {
  assertQuery(q);
  return endpoint(
    DEMAND_PATH,
    { api_key: key, vin: q.vin, zip: q.zip, radius: String(DEMAND_RADIUS_MILES), car_type: "used" },
    base,
  );
}

/* ── Reading the answers ───────────────────────────────────────────────── */

export type PriceOutcome =
  | { kind: "price"; price: number; msrp: number | null }
  /** MarketCheck answered, and has no price for this car. */
  | { kind: "none" }
  /** MarketCheck's own monthly quota is used up. */
  | { kind: "quota" }
  /** Too many calls this second. */
  | { kind: "busy" }
  /** No answer, an error, or an answer that can't be read. */
  | { kind: "down" };

export interface Demand {
  /** Days the cars for sale would last at the recent pace of sales. */
  days: number;
  /** Similar cars for sale within the radius. */
  listed: number;
}

/** What came back from one call: the status, the parsed body if it was JSON, and the quota header. */
export interface Reply {
  status: number;
  /** undefined when the body was not JSON. */
  body: unknown;
  quotaRemaining: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A dollar figure worth showing: a real number in the range cars sell for. */
function dollars(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 100 && v <= 5_000_000 ? v : null;
}

/**
 * The price call's answer, whatever shape it took.
 *
 * Only a plain number in a believable range is a price. A reply in any shape
 * this doesn't recognize is "no estimate": the page never shows a number it
 * isn't sure of.
 */
export function readPrice(r: Reply): PriceOutcome {
  if (r.status === 429) {
    const message = isRecord(r.body) && typeof r.body.message === "string" ? r.body.message : "";
    return /quota/i.test(message) || r.quotaRemaining === "0" ? { kind: "quota" } : { kind: "busy" };
  }
  // A VIN MarketCheck can't decode or price. The VIN, miles and ZIP were
  // checked before sending, so a 400 is about the car, not the request.
  if (r.status === 400 || r.status === 404 || r.status === 422) return { kind: "none" };
  if (r.status < 200 || r.status > 299) return { kind: "down" };
  // A 200 that isn't JSON is the service misbehaving, not news about the car.
  if (r.body === undefined) return { kind: "down" };
  if (!isRecord(r.body)) return { kind: "none" };

  const price = dollars(r.body.marketcheck_price);
  if (price === null) return { kind: "none" };
  return { kind: "price", price, msrp: dollars(r.body.msrp) };
}

/**
 * The demand call's answer, or null for anything short of a clear figure:
 * no sales in 45 days (mds is null), a failure, or a shape not recognized.
 */
export function readDemand(r: Reply): Demand | null {
  if (r.status < 200 || r.status > 299 || !isRecord(r.body)) return null;
  const { mds, total_active_cars_for_ymmt: listed } = r.body;
  if (typeof mds !== "number" || !Number.isFinite(mds) || mds <= 0 || mds > 3_650) return null;
  if (typeof listed !== "number" || !Number.isInteger(listed) || listed < 0) return null;
  return { days: mds, listed };
}

/* ── The calls ─────────────────────────────────────────────────────────── */

export interface CallOptions {
  /** For scripts/verify-value.mts: a stand-in server instead of MarketCheck. */
  base?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * One GET, once. Null for no usable reply: refused, timed out, redirected or
 * cut off. Never throws, and never repeats a call that may have been billed.
 */
async function call(what: string, url: string, timeoutMs: number, fetchImpl: typeof fetch): Promise<Reply | null> {
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      // Nothing MarketCheck returns may be kept past this request.
      cache: "no-store",
      // The key rides in the URL: it goes to MarketCheck's host and nowhere else.
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
    });
    // Inside the try: a reply cut off halfway, or the timeout landing
    // mid-download, rejects here.
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    if (!res.ok || body === undefined) {
      // The status and nothing else: never the body, the URL or the car.
      console.error(`[value] MarketCheck ${what}: HTTP ${res.status}${body === undefined ? ", not JSON" : ""}`);
    }
    return { status: res.status, body, quotaRemaining: res.headers.get("quota-remaining") };
  } catch (e) {
    // Named, never quoted: an error's message can carry the request, key included.
    const name = e instanceof Error ? e.name : "";
    console.error(
      `[value] MarketCheck ${what}: ${name === "TimeoutError" || name === "AbortError" ? "timed out" : "no reply"}`,
    );
    return null;
  }
}

/** One price call. Counted against the monthly cap by the caller, before it is made. */
export async function fetchPrice(q: CarQuery, key: string, o: CallOptions = {}): Promise<PriceOutcome> {
  const reply = await call("price", priceUrl(q, key, o.base), o.timeoutMs ?? PRICE_TIMEOUT_MS, o.fetchImpl ?? fetch);
  return reply ? readPrice(reply) : { kind: "down" };
}

/** One demand call; null when there is nothing clear to say. */
export async function fetchDemand(q: CarQuery, key: string, o: CallOptions = {}): Promise<Demand | null> {
  const reply = await call("demand", demandUrl(q, key, o.base), o.timeoutMs ?? DEMAND_TIMEOUT_MS, o.fetchImpl ?? fetch);
  return reply ? readDemand(reply) : null;
}
