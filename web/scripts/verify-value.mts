#!/usr/bin/env node
/**
 * "What's my car worth?": the price estimate from MarketCheck.
 *
 * There is no MarketCheck key on the build machine and none may be used
 * here, so the real code (src/lib/vin/marketcheck.ts, valueEstimate.ts) is
 * run against a stand-in server on 127.0.0.1 that answers the way
 * MarketCheck's docs say it does (read Nov 12, 2026): a price, no price, a
 * used-up quota, too many calls a second, a slow answer, a reply cut off
 * halfway, an error page, a redirect.
 *
 * It holds five things true:
 *   - the switches: no key, a key, a key and the public switch;
 *   - the request: only a clean VIN, miles and ZIP go out, with the key, to
 *     MarketCheck's host, once, and nothing about the visitor goes with them;
 *   - the reading: only a plain number in a believable range is a price;
 *   - the bill: the visitor's daily lookups, NHTSA's decode and the month's
 *     cap all come before a paid call, and the count survives the month in
 *     the real table (the real migrations, in an in-memory Postgres);
 *   - the secrets: no log line, error or result carries the key or the VIN.
 *
 * Nothing here touches the live database or the internet.
 *
 * Run: npm run test:value
 */
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";

// src/db/index.ts insists on a connection string when imported. Forced, not
// defaulted: nothing here may reach a real database.
process.env.DATABASE_URL = "postgres://unused@localhost:5432/unused";
delete process.env.MARKETCHECK_API_KEY;
delete process.env.VALUE_CHECK_PUBLIC;

const mc = await import("../src/lib/vin/marketcheck");
const ve = await import("../src/lib/vin/valueEstimate");
const steps = await import("../src/components/valueSteps");
const { spendLookup } = await import("../src/lib/vin/usage");

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, detail: unknown = "") {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
}
function eq(label: string, got: unknown, want: unknown) {
  check(label, JSON.stringify(got) === JSON.stringify(want), { got, want });
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Made up for this file. Not a real key, and not a real car's VIN. */
const KEY = "mc_live_TESTONLY0000notARealKey";
const VIN = "1HGBH41JXMN109186";
const CAR = { vin: VIN, miles: 98_000, zip: "27401" };

/* Everything the code under test prints, to be searched at the end. */
const printed: string[] = [];
const real = { error: console.error, warn: console.warn, info: console.info, debug: console.debug };
for (const level of ["error", "warn", "info", "debug"] as const) {
  console[level] = (...a: unknown[]) => {
    printed.push(a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}\n${x.stack}` : String(x))).join(" "));
  };
}

/* ── A stand-in MarketCheck ───────────────────────────────────────────── */

type Canned = { status?: number; body?: unknown; raw?: string; type?: string; headers?: Record<string, string>; waitMs?: number };
const price = (body: unknown, status = 200): Canned => ({ status, body });
const NORMAL_PRICE = { marketcheck_price: 14_832, msrp: 24_970 };
const NORMAL_DEMAND = { mds: 24.3, total_active_cars_for_ymmt: 41, total_cars_sold_in_last_45_days: 76 };

let onPrice: Canned = price(NORMAL_PRICE);
let onDemand: Canned = price(NORMAL_DEMAND);
const seen: { path: string; params: Record<string, string>; headers: IncomingMessage["headers"]; method: string }[] = [];

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://stand-in");
  seen.push({
    path: url.pathname,
    params: Object.fromEntries(url.searchParams),
    headers: req.headers,
    method: req.method ?? "",
  });
  const canned = url.pathname === "/v2/predict/car/us/marketcheck_price" ? onPrice : url.pathname === "/v2/mds/car" ? onDemand : { status: 404, body: { code: 404, message: "Not found" } };
  const send = () => {
    res.writeHead(canned.status ?? 200, { "content-type": canned.type ?? "application/json", ...canned.headers });
    res.end(canned.raw ?? JSON.stringify(canned.body ?? {}));
  };
  if (canned.waitMs) setTimeout(send, canned.waitMs);
  else send();
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const call = { base: BASE };

/* ── The switches ─────────────────────────────────────────────────────── */
console.log("\nThe switches");
{
  eq("no key: off", mc.valueAccess({}), "off");
  eq("an empty key: off", mc.valueAccess({ MARKETCHECK_API_KEY: "  " }), "off");
  eq("the public switch without a key: still off", mc.valueAccess({ VALUE_CHECK_PUBLIC: "1" }), "off");
  eq("a key: staff only", mc.valueAccess({ MARKETCHECK_API_KEY: KEY }), "staff");
  eq("a key and the switch: public", mc.valueAccess({ MARKETCHECK_API_KEY: KEY, VALUE_CHECK_PUBLIC: "1" }), "public");
  eq('the switch is "1" and nothing else', mc.valueAccess({ MARKETCHECK_API_KEY: KEY, VALUE_CHECK_PUBLIC: "true" }), "staff");
  eq("a sandbox key can't price cars: off", mc.valueAccess({ MARKETCHECK_API_KEY: "mc_test_abc", VALUE_CHECK_PUBLIC: "1" }), "off");

  check("off: nobody, staff included", !mc.mayEstimate("off", true) && !mc.mayEstimate("off", false));
  check("staff only: staff yes, visitors no", mc.mayEstimate("staff", true) && !mc.mayEstimate("staff", false));
  check("public: everyone", mc.mayEstimate("public", false) && mc.mayEstimate("public", true));

  eq("the cap is 400 by default, under the Free plan's 500", mc.monthlyCap({}), 400);
  eq("the founder's number is used", mc.monthlyCap({ VALUE_CHECK_MONTHLY_CAP: "120" }), 120);
  eq("0 stops every call", mc.monthlyCap({ VALUE_CHECK_MONTHLY_CAP: "0" }), 0);
  eq("a typo can't remove the cap", [mc.monthlyCap({ VALUE_CHECK_MONTHLY_CAP: "lots" }), mc.monthlyCap({ VALUE_CHECK_MONTHLY_CAP: "-5" }), mc.monthlyCap({ VALUE_CHECK_MONTHLY_CAP: "1e9" })], [400, 400, 400]);
  check("demand is asked for unless switched off", mc.wantsDemand({}) && !mc.wantsDemand({ VALUE_CHECK_DEMAND: "0" }));
}

/* ── The request ──────────────────────────────────────────────────────── */
console.log("\nWhat is sent to MarketCheck");
{
  const u = new URL(mc.priceUrl(CAR, KEY));
  eq("the price call goes to MarketCheck's own host, over https", u.origin, "https://api.marketcheck.com");
  eq("at the documented path", u.pathname, "/v2/predict/car/us/marketcheck_price");
  eq(
    "with the key, the VIN, the miles, the ZIP and the dealer type, and nothing else",
    Object.fromEntries(u.searchParams),
    { api_key: KEY, vin: VIN, miles: "98000", dealer_type: "independent", zip: "27401" },
  );
  const d = new URL(mc.demandUrl(CAR, KEY));
  eq("the demand call: used cars like it within 100 miles of the ZIP", [d.origin + d.pathname, Object.fromEntries(d.searchParams)], [
    "https://api.marketcheck.com/v2/mds/car",
    { api_key: KEY, vin: VIN, zip: "27401", radius: "100", car_type: "used" },
  ]);

  const refused = (label: string, q: { vin: string; miles: number; zip: string }) => {
    let message: string | null = null;
    try {
      mc.priceUrl(q, KEY);
    } catch (e) {
      message = (e as Error).message;
    }
    check(`${label}: no URL is built`, message !== null);
    check(`${label}: and the error names no value`, message !== null && !message.includes(q.vin || "~") && !message.includes(KEY) && !message.includes(String(q.zip || "~")), message);
  };
  refused("a 16-character VIN", { ...CAR, vin: VIN.slice(1) });
  refused("a VIN with an O", { ...CAR, vin: "1HGBH41JXMO109186" });
  refused("a VIN with something to inject", { ...CAR, vin: "1HGBH41JX&x=1#109X" });
  refused("a lowercase VIN", { ...CAR, vin: VIN.toLowerCase() });
  refused("miles with a fraction", { ...CAR, miles: 98_000.5 });
  refused("negative miles", { ...CAR, miles: -1 });
  refused("miles past the ceiling", { ...CAR, miles: steps.MAX_MILES + 1 });
  refused("a 4-digit ZIP", { ...CAR, zip: "2740" });
  refused("a ZIP with letters", { ...CAR, zip: "27401&a" });

  // Only the server may hold the key or build the URL.
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  check('marketcheck.ts is server-only', /^import "server-only";/.test(read("src/lib/vin/marketcheck.ts")));
  check('valueEstimate.ts is server-only', /^import "server-only";/.test(read("src/lib/vin/valueEstimate.ts")));
  for (const file of ["src/components/ValueCheck.tsx", "src/components/valueSteps.ts"]) {
    const src = read(file);
    check(`${file} never reads the environment`, !/process\.env|MARKETCHECK_API_KEY/.test(src));
    check(
      `${file} imports nothing from the server's MarketCheck code`,
      !/from\s+["']@\/lib\/vin\/(marketcheck|valueEstimate|usage|nhtsa)["']/.test(src.replace(/import type[^;]+;/g, "")),
    );
  }
  check("the key's variable is not a NEXT_PUBLIC_ one anywhere in src", !/NEXT_PUBLIC_MARKETCHECK/.test(read("src/lib/vin/marketcheck.ts") + read("src/lib/actions/value.ts") + read("src/app/[market]/value/page.tsx")));
}

/* ── Reading the answers ──────────────────────────────────────────────── */
console.log("\nReading what comes back");
{
  const r = (status: number, body: unknown, quotaRemaining: string | null = null) => ({ status, body, quotaRemaining });
  eq("a price and the price when new", mc.readPrice(r(200, NORMAL_PRICE)), { kind: "price", price: 14_832, msrp: 24_970 });
  eq("a price without an MSRP", mc.readPrice(r(200, { marketcheck_price: 9_450.5, msrp: null })), { kind: "price", price: 9_450.5, msrp: null });
  eq("an MSRP that isn't a number is left out, not shown", mc.readPrice(r(200, { marketcheck_price: 9_000, msrp: "N/A" })), { kind: "price", price: 9_000, msrp: null });
  eq("a null price: no estimate", mc.readPrice(r(200, { marketcheck_price: null, msrp: null })), { kind: "none" });
  eq("generic prices we never asked for are not a price", mc.readPrice(r(200, { marketcheck_price: null, msrp: null, generic_prices: [{ year: 2017, make: "Toyota", marketcheck_price: 15_000 }] })), { kind: "none" });
  for (const [label, body] of [
    ["a price as text", { marketcheck_price: "14832" }],
    ["a price of 0", { marketcheck_price: 0 }],
    ["a negative price", { marketcheck_price: -14_832 }],
    ["a price too small to be a car's", { marketcheck_price: 12 }],
    ["a price too large to be a car's", { marketcheck_price: 148_320_000 }],
    ["NaN as a price", { marketcheck_price: Number.NaN }],
    ["a price under another name", { price: 14_832 }],
    ["a nested price", { marketcheck_price: { value: 14_832 } }],
    ["a list instead of an object", [NORMAL_PRICE]],
    ["an empty object", {}],
    ["null", null],
    ["a bare number", 14_832],
  ] as const) {
    eq(`${label}: no estimate, never a number`, mc.readPrice(r(200, body)), { kind: "none" });
  }
  eq("HTTP 400 (the VIN can't be decoded or priced): no estimate", mc.readPrice(r(400, { code: 400, message: "Invalid VIN" })), { kind: "none" });
  eq("HTTP 422: no estimate", mc.readPrice(r(422, { code: 422, message: "VIN decoding failed" })), { kind: "none" });
  eq("HTTP 429, quota exhausted: the month is used up", mc.readPrice(r(429, { message: "Monthly API quota exhausted" })), { kind: "quota" });
  eq("HTTP 429 with no quota left in the header: the month is used up", mc.readPrice(r(429, undefined, "0")), { kind: "quota" });
  eq("HTTP 429, rate limit: busy, not used up", mc.readPrice(r(429, { message: "API rate limit exceeded" }, "312")), { kind: "busy" });
  eq("HTTP 401 (key refused): down", mc.readPrice(r(401, { code: 401, message: "Unauthorized" })), { kind: "down" });
  eq("HTTP 403: down", mc.readPrice(r(403, { code: 403, message: "Forbidden" })), { kind: "down" });
  eq("HTTP 500: down", mc.readPrice(r(500, { code: 500, message: "Oops" })), { kind: "down" });
  eq("HTTP 503 with no JSON: down", mc.readPrice(r(503, undefined)), { kind: "down" });
  eq("HTTP 200 that isn't JSON: down, not 'no estimate'", mc.readPrice(r(200, undefined)), { kind: "down" });
  eq("an error status is never read for a price", mc.readPrice(r(500, NORMAL_PRICE)), { kind: "down" });

  eq("days' supply and the cars for sale", mc.readDemand(r(200, NORMAL_DEMAND)), { days: 24.3, listed: 41 });
  eq("no sales in 45 days (mds is null): nothing to say", mc.readDemand(r(200, { mds: null, total_active_cars_for_ymmt: 3, total_cars_sold_in_last_45_days: 0 })), null);
  eq("days' supply as text: nothing", mc.readDemand(r(200, { ...NORMAL_DEMAND, mds: "24" })), null);
  eq("a count missing: nothing", mc.readDemand(r(200, { mds: 24 })), null);
  eq("a negative figure: nothing", mc.readDemand(r(200, { ...NORMAL_DEMAND, mds: -3 })), null);
  eq("an error: nothing", mc.readDemand(r(422, { code: 422, message: "VIN decoding failed" })), null);
  eq("not JSON: nothing", mc.readDemand(r(200, undefined)), null);
}

/* ── The calls, against the stand-in ──────────────────────────────────── */
console.log("\nCalling the stand-in server");
{
  seen.length = 0;
  onPrice = price(NORMAL_PRICE);
  eq("a normal estimate", await mc.fetchPrice(CAR, KEY, call), { kind: "price", price: 14_832, msrp: 24_970 });
  eq("one GET", [seen.length, seen[0]?.method], [1, "GET"]);
  eq("carrying exactly the documented parameters", seen[0]?.params, { api_key: KEY, vin: VIN, miles: "98000", dealer_type: "independent", zip: "27401" });
  const h = seen[0]?.headers ?? {};
  check(
    "and nothing about the visitor: no cookie, no forwarded address, no referrer, no authorization",
    !("cookie" in h) && !("x-forwarded-for" in h) && !("x-real-ip" in h) && !("referer" in h) && !("authorization" in h) && !("origin" in h),
    Object.keys(h),
  );

  seen.length = 0;
  onDemand = price(NORMAL_DEMAND);
  eq("local demand", await mc.fetchDemand(CAR, KEY, call), { days: 24.3, listed: 41 });
  eq("one call, with the radius the page states", [seen.length, seen[0]?.path, seen[0]?.params.radius], [1, "/v2/mds/car", "100"]);

  const once = async (label: string, canned: Canned, want: unknown, o: { timeoutMs?: number } = {}) => {
    seen.length = 0;
    onPrice = canned;
    const started = Date.now();
    const got = await mc.fetchPrice(CAR, KEY, { ...call, ...o });
    eq(label, got, want);
    check(`${label}: asked once, never again`, seen.length === 1, seen.length);
    return Date.now() - started;
  };
  await once("no estimate (HTTP 400)", price({ code: 400, message: "Invalid VIN" }, 400), { kind: "none" });
  await once("no estimate (a null price)", price({ marketcheck_price: null, msrp: null }), { kind: "none" });
  await once("the month's quota is used up", { status: 429, body: { message: "Monthly API quota exhausted" }, headers: { "Quota-Remaining": "0", "Retry-After": "86400" } }, { kind: "quota" });
  await once("the quota header alone says so", { status: 429, raw: "", headers: { "Quota-Remaining": "0" } }, { kind: "quota" });
  await once("too many calls a second", { status: 429, body: { message: "API rate limit exceeded" }, headers: { "Quota-Remaining": "311" } }, { kind: "busy" });
  await once("a reply cut off halfway", { raw: '{"marketcheck_price": 148' }, { kind: "down" });
  await once("an HTML error page with a 200", { raw: "<html><body>Bad gateway</body></html>", type: "text/html" }, { kind: "down" });
  await once("a 502 page", { status: 502, raw: "<html>502</html>", type: "text/html" }, { kind: "down" });
  await once("a refused key", price({ code: 401, message: "Invalid API key" }, 401), { kind: "down" });
  await once("a redirect is not followed: the key goes to one host only", { status: 302, raw: "", headers: { location: "http://127.0.0.1:9/elsewhere" } }, { kind: "down" });

  const took = await once("a slow answer is given up on", { ...price(NORMAL_PRICE), waitMs: 1_500 }, { kind: "down" }, { timeoutMs: 250 });
  check("at the time limit, not when the answer finally comes", took < 1_200, took);
  eq("a paid call is given 8 seconds", mc.PRICE_TIMEOUT_MS, 8_000);
  check("the extra call is given no more than that", mc.DEMAND_TIMEOUT_MS <= 8_000);

  seen.length = 0;
  eq("nothing listening at all: down", await mc.fetchPrice(CAR, KEY, { base: "http://127.0.0.1:9" }), { kind: "down" });

  // Nothing is kept between requests: the same question is asked again in full.
  seen.length = 0;
  onPrice = price(NORMAL_PRICE);
  await mc.fetchPrice(CAR, KEY, call);
  onPrice = price({ marketcheck_price: 15_100, msrp: 24_970 });
  eq("a second request gets a fresh answer, not a remembered one", await mc.fetchPrice(CAR, KEY, call), { kind: "price", price: 15_100, msrp: 24_970 });
  eq("and both reached MarketCheck", seen.length, 2);
}

/* ── One estimate, start to finish ────────────────────────────────────── */
console.log("\nThe guarded path to a paid call");
{
  type Deps = Parameters<typeof ve.runEstimate>[1];
  const log: string[] = [];
  const NOW = new Date("2026-11-13T15:00:00Z");
  const deps = (over: Partial<Deps> & { staff?: boolean; lookupsLeft?: boolean; room?: number } = {}): Deps => {
    let room = over.room ?? 100;
    return {
      env: { MARKETCHECK_API_KEY: KEY, VALUE_CHECK_PUBLIC: "1" },
      isStaff: async () => (log.push("staff?"), over.staff ?? false),
      spend: async () => (log.push("spend"), over.lookupsLeft ?? true),
      decode: async () => (log.push("decode"), { year: 2017, make: "TOYOTA", model: "Camry" }),
      reserve: async () => (log.push("reserve"), room-- > 0),
      now: () => NOW,
      call,
      ...over,
    };
  };
  const returned: string[] = [];
  const run = async (input: Partial<typeof ASKED>, d: Deps) => {
    log.length = 0;
    seen.length = 0;
    const result = await ve.runEstimate({ ...ASKED, ...input }, d);
    returned.push(JSON.stringify(result));
    return result;
  };
  const ASKED = { vin: " 1hgbh41jxmn109186 ", miles: "98,000", zip: "27401-1234" };
  onPrice = price(NORMAL_PRICE);
  onDemand = price(NORMAL_DEMAND);

  const good = await run({}, deps());
  eq("public, with a key: an estimate", good, {
    ok: true,
    estimate: { price: 14_832, msrp: 24_970, miles: 98_000, zip: "27401", asOf: NOW.toISOString(), demand: { days: 24.3, listed: 41 }, radiusMiles: 100 },
  });
  eq("in order: a lookup spent, the VIN decoded, a call counted, then the demand call counted", log, ["spend", "decode", "reserve", "reserve"]);
  eq("two calls: the price, then demand", seen.map((s) => s.path), ["/v2/predict/car/us/marketcheck_price", "/v2/mds/car"]);
  eq("what was typed is cleaned before it is sent", [seen[0]?.params.vin, seen[0]?.params.miles, seen[0]?.params.zip], [VIN, "98000", "27401"]);
  check("a public estimate asks nobody's session", !log.includes("staff?"));
  check("the answer carries no VIN and no key", !JSON.stringify(good).includes(VIN) && !JSON.stringify(good).includes(KEY));

  eq("no key: off", await run({}, deps({ env: {} })), { ok: false, failure: "off" });
  check("and nothing is spent, decoded, counted or called", log.length === 0 && seen.length === 0, { log, seen: seen.length });
  eq("no key, even for staff: off", await run({}, deps({ env: { VALUE_CHECK_PUBLIC: "1" }, staff: true })), { ok: false, failure: "off" });

  eq("a key without the public switch, a visitor: off", await run({}, deps({ env: { MARKETCHECK_API_KEY: KEY } })), { ok: false, failure: "off" });
  check("the visitor costs nothing", JSON.stringify(log) === '["staff?"]' && seen.length === 0, { log, seen: seen.length });
  const staffRun = await run({}, deps({ env: { MARKETCHECK_API_KEY: KEY }, staff: true }));
  check("a key without the public switch, signed-in staff: an estimate", staffRun.ok === true && staffRun.estimate?.price === 14_832, staffRun);

  for (const [label, input, field] of [
    ["a short VIN", { vin: "1HGBH41JXMN10918" }, "vin"],
    ["a VIN with an O", { vin: "1HGBH41JXMO109186" }, "vin"],
    ["no miles", { miles: "" }, "miles"],
    ["miles in words", { miles: "about ninety" }, "miles"],
    ["miles past the ceiling", { miles: "5000000" }, "miles"],
    ["zero miles", { miles: "0" }, "miles"],
    ["a 4-digit ZIP", { zip: "2740" }, "zip"],
    ["a ZIP in words", { zip: "Greensboro" }, "zip"],
  ] as const) {
    const r = await run(input, deps());
    check(`${label}: sent back to fix, in words`, r.ok === false && r.failure === "input" && r.field === field && !!r.error, r);
    check(`${label}: costs nothing`, log.length === 0 && seen.length === 0, { log, seen: seen.length });
  }

  eq("today's lookups used up", await run({}, deps({ lookupsLeft: false })), { ok: false, failure: "limit" });
  check("so nothing is decoded, counted or called", JSON.stringify(log) === '["spend"]' && seen.length === 0, { log, seen: seen.length });

  const noNhtsa = await run({}, deps({ decode: async () => null }));
  check("NHTSA unreachable: try again, and no paid call", noNhtsa.failure === "down" && /NHTSA/.test(noNhtsa.error ?? "") && seen.length === 0 && !log.includes("reserve"), { noNhtsa, log });
  const gibberish = await run({}, deps({ decode: async () => ({ year: null, make: null, model: null }) }));
  check("a VIN NHTSA can't decode never reaches the paid API", gibberish.failure === "input" && gibberish.field === "vin" && seen.length === 0 && !log.includes("reserve"), { gibberish, log });

  eq("the month's cap is reached", await run({}, deps({ room: 0 })), { ok: false, failure: "cap", resets: "Dec 1" });
  check("so MarketCheck is not called", seen.length === 0, seen.length);
  eq("a cap of 0 stops everything", await run({}, deps({ env: { MARKETCHECK_API_KEY: KEY, VALUE_CHECK_PUBLIC: "1", VALUE_CHECK_MONTHLY_CAP: "0" }, reserve: (cap) => ve.reserveCall(cap) })), { ok: false, failure: "cap", resets: "Dec 1" });
  check("without a call", seen.length === 0, seen.length);

  const lastCall = await run({}, deps({ room: 1 }));
  check("one call left under the cap: the price, without the demand line", lastCall.ok === true && lastCall.estimate?.demand === null && seen.length === 1, { lastCall, seen: seen.length });
  const noDemand = await run({}, deps({ env: { MARKETCHECK_API_KEY: KEY, VALUE_CHECK_PUBLIC: "1", VALUE_CHECK_DEMAND: "0" } }));
  check("demand switched off: one call, one counted", noDemand.ok === true && noDemand.estimate?.demand === null && seen.length === 1 && log.filter((l) => l === "reserve").length === 1, { log, seen: seen.length });

  onPrice = price({ code: 400, message: "Invalid VIN" }, 400);
  eq("MarketCheck has no price for the car", await run({}, deps()), { ok: false, failure: "none" });
  eq("and the demand call is not made for it", seen.map((s) => s.path), ["/v2/predict/car/us/marketcheck_price"]);

  onPrice = { status: 429, body: { message: "Monthly API quota exhausted" }, headers: { "Quota-Remaining": "0" } };
  eq("MarketCheck's own quota is used up: the same words as our cap", await run({}, deps()), { ok: false, failure: "cap", resets: "Dec 1" });
  onPrice = { status: 429, body: { message: "API rate limit exceeded" } };
  eq("rate limited: try again", await run({}, deps()), { ok: false, failure: "down" });
  onPrice = { raw: '{"marketcheck_price": 148' };
  eq("a reply cut off: try again", await run({}, deps()), { ok: false, failure: "down" });
  onPrice = { ...price(NORMAL_PRICE), waitMs: 1_500 };
  eq("a slow answer: try again", await run({}, deps({ call: { ...call, timeoutMs: 250 } })), { ok: false, failure: "down" });
  eq("with one call made, not two", seen.length, 1);

  onPrice = price(NORMAL_PRICE);
  onDemand = price({ code: 422, message: "VIN decoding failed" }, 422);
  const priceOnly = await run({}, deps());
  check("demand fails: the estimate still stands, without the line", priceOnly.ok === true && priceOnly.estimate?.price === 14_832 && priceOnly.estimate?.demand === null, priceOnly);
  onDemand = price(NORMAL_DEMAND);

  const everything = returned.join("\n");
  check(
    `none of the ${returned.length} answers sent to the page, failures included, carries the VIN, the key or a URL`,
    returned.length > 25 && !everything.includes(VIN) && !/[A-HJ-NPR-Z0-9]{17}/.test(everything) && !everything.includes(KEY) && !/api_key|https?:/.test(everything),
    everything,
  );
}

/* ── The month's cap, in the real table ───────────────────────────────── */
console.log("\nThe month's cap");
{
  const pg = await PGlite.create({ extensions: { btree_gist } });
  const migrationsDir = join(root, "src/db/migrations");
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(join(migrationsDir, file), "utf8").split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
  const database = drizzle(pg) as never;
  const count = async (day: string) =>
    (await pg.query<{ lookups: number }>(`SELECT lookups FROM vin_check_usage WHERE visitor = $1 AND day = $2`, [ve.CALL_COUNTER, day])).rows[0]?.lookups ?? null;

  eq("November is counted on its last day", ve.monthEnd(new Date("2026-11-13T15:00:00Z")), "2026-11-30");
  eq("February in a leap year", ve.monthEnd(new Date("2028-02-01T00:00:00Z")), "2028-02-29");
  eq("December", ve.monthEnd(new Date("2026-12-31T23:59:59Z")), "2026-12-31");
  check("the counter's name can't be a visitor's key", !/^[A-Za-z0-9_-]{22}$/.test(ve.CALL_COUNTER));

  const nov = new Date("2026-11-13T15:00:00Z");
  let allowed = 0;
  for (let i = 0; i < 5; i++) if (await ve.reserveCall(5, { database, now: nov })) allowed++;
  eq("5 calls fit under a cap of 5", allowed, 5);
  eq("the 6th is refused", await ve.reserveCall(5, { database, now: nov }), false);
  eq("and the 7th", await ve.reserveCall(5, { database, now: nov }), false);
  eq("a refused call isn't counted", await count("2026-11-30"), 5);
  eq("raising the cap lets calls through again", await ve.reserveCall(6, { database, now: nov }), true);
  eq("lowering it stops them at once", await ve.reserveCall(3, { database, now: nov }), false);
  eq("a cap of 0 allows nothing", await ve.reserveCall(0, { database, now: new Date("2027-03-03T00:00:00Z") }), false);
  eq("and writes nothing", await count("2027-03-31"), null);

  // Twenty at once for the last four places.
  const dec = new Date("2026-12-02T10:00:00Z");
  const rush = await Promise.all(Array.from({ length: 20 }, () => ve.reserveCall(4, { database, now: dec })));
  eq("twenty at once, four places: exactly four get one", rush.filter(Boolean).length, 4);
  eq("a new month starts from nothing", await count("2026-12-31"), 4);

  // The free check's own cleanup (usage.ts) deletes days more than two old.
  // The count has to outlive it for the whole month, and no longer.
  const SECRET = "test-secret-not-a-real-one";
  const visit = (iso: string, ip: string) => spendLookup({ database, ip, now: new Date(iso), secret: SECRET });
  await visit("2026-11-14T09:00:00Z", "198.51.100.1");
  await visit("2026-11-20T09:00:00Z", "198.51.100.2");
  await visit("2026-11-30T23:00:00Z", "198.51.100.3");
  eq("November's count is still there on Nov 30, after the daily cleanup has run all month", await count("2026-11-30"), 6);
  await visit("2026-12-01T09:00:00Z", "198.51.100.4");
  eq("December's count is untouched by it", await count("2026-12-31"), 4);
  await visit("2026-12-03T09:00:00Z", "198.51.100.5");
  eq("November's count is cleared early in December", await count("2026-11-30"), null);
  const visitors = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM vin_check_usage WHERE visitor <> $1`, [ve.CALL_COUNTER]);
  check("and visitors' own counts were never touched by the cap", visitors.rows[0].n >= 1, visitors.rows[0]);
  const stored = await pg.query<{ visitor: string; day: string; lookups: number }>(`SELECT visitor, day::text, lookups FROM vin_check_usage WHERE visitor = $1`, [ve.CALL_COUNTER]);
  check("the count holds a name, a date and a number: nothing from MarketCheck, no VIN", stored.rows.every((r) => Object.keys(r).length === 3 && !JSON.stringify(r).includes(VIN)), stored.rows);

  const broken = { insert() { throw new Error(`database down ${KEY} ${VIN}`); } } as never;
  eq("if the count can't be kept, nothing is spent", await ve.reserveCall(400, { database: broken, now: nov }), false);
  const dropped = { insert: () => ({ values: () => ({ onConflictDoUpdate: () => ({ returning: () => Promise.reject(new Error(`connection reset ${VIN}`)) }) }) }) } as never;
  eq("nor if the query fails after it was sent", await ve.reserveCall(400, { database: dropped, now: nov }), false);
  await pg.close();
}

/* ── The words ────────────────────────────────────────────────────────── */
console.log("\nThe words on the page");
{
  eq(
    "the note under the number, word for word",
    steps.estimateNote({ miles: 98_000, zip: "27401", asOf: "2026-11-13T15:00:00Z" }),
    "Estimate only. Typical price at independent dealers for a car like this with 98,000 miles near ZIP 27401, from MarketCheck, as of Nov 13, 2026. Not an offer, an appraisal, or a guaranteed price.",
  );
  eq("the date is Greensboro's, not the server's", steps.dateLabel("2026-11-14T03:30:00Z"), "Nov 13, 2026");
  eq("dollars are whole", [steps.usd(14_832), steps.usd(9_450.5), steps.usd(124_970)], ["$14,832", "$9,451", "$124,970"]);
  eq("the month starts over on the 1st", [steps.nextMonthLabel(new Date("2026-11-13T15:00:00Z")), steps.nextMonthLabel(new Date("2026-12-31T23:59:59Z"))], ["Dec 1", "Jan 1"]);

  const at = { zip: "27401", asOf: "2026-11-13T15:00:00Z", radiusMiles: 100 };
  eq("24 days' supply is high demand", steps.demandLine({ days: 24.3, listed: 41 }, at), {
    band: "High",
    headline: "High demand near ZIP 27401",
    detail: "At the recent pace, similar cars for sale within 100 miles would sell out in about 24 days (MarketCheck, Nov 13, 2026).",
  });
  eq("under 30 is high, 30 to 60 normal, over 60 low", [29.9, 30, 60, 60.1].map(steps.demandBand), ["High", "Normal", "Normal", "Low"]);
  eq("fewer than 5 cars for sale: no line", steps.demandLine({ days: 12, listed: 4 }, at), null);
  eq("no figure: no line", [steps.demandLine(null, at), steps.demandLine({ days: 0, listed: 40 }, at), steps.demandLine({ days: Number.NaN, listed: 40 }, at)], [null, null, null]);
  check("one day is 'day'", steps.demandLine({ days: 0.6, listed: 9 }, at)?.detail.includes("about 1 day (") === true);
  const everyWord = JSON.stringify([...[10, 45, 90].map((d) => steps.demandLine({ days: d, listed: 9 }, at)), steps.ASKING_NOTE]);
  check("no deal labels, ever", !/great|good deal|fair deal|bargain|steal|best/i.test(everyWord), everyWord);
  eq("MarketCheck is credited in the words its terms give", steps.SOURCE_CREDIT, "Data powered by MarketCheck");

  eq("miles as people type them", ["98,000", "98000", " 98 000 ", "98k", "150K", "1"].map(steps.readMiles), [98_000, 98_000, 98_000, 98_000, 150_000, 1]);
  eq("and what isn't miles", ["", "abc", "98.5", "-5", "98kk", "1e5", "12345678"].map(steps.readMiles), [null, null, null, null, null, null, null]);
  check("every chip is a number the server accepts", steps.MILE_CHIPS.every((m) => steps.milesProblem(String(m)) === null));
  eq("chips read as 25k to 200k", [steps.chipLabel(steps.MILE_CHIPS[0]), steps.chipLabel(steps.MILE_CHIPS.at(-1)!)], ["25k", "200k"]);
  eq("ZIPs", ["27401", " 27401 ", "27401-1234", "2740", "274011", "ABCDE", "", null].map((z) => steps.readZip(z)), ["27401", "27401", "27401", null, null, null, null, null]);

  const where = { car: "2017 Toyota Camry", resets: "Dec 1" };
  for (const f of ["none", "cap", "limit", "down"] as const) {
    const c = steps.failureCopy(f, where);
    check(`"${f}" has a title and plain words, no exclamation marks`, !!c.title && !!c.body && !/!/.test(c.title + c.body), c);
  }
  check("only a service failure offers to try again", steps.failureCopy("down", where).retry && !steps.failureCopy("none", where).retry && !steps.failureCopy("cap", where).retry && !steps.failureCopy("limit", where).retry);
  check("the used-up month says when it starts again", steps.failureCopy("cap", where).body.includes("Dec 1"));
  check("no estimate names the car", steps.failureCopy("none", where).body.includes("2017 Toyota Camry"));
}

/* ── Secrets ──────────────────────────────────────────────────────────── */
console.log("\nWhat reaches a log line");
{
  for (const level of ["error", "warn", "info", "debug"] as const) console[level] = real[level];
  const all = printed.join("\n");
  check("failures were logged, so there is something to search", printed.length >= 8, printed.length);
  check("no log line carries the key", !all.includes(KEY) && !/mc_live_/.test(all), all);
  check("no log line carries the VIN", !all.includes(VIN) && !/[A-HJ-NPR-Z0-9]{17}/.test(all), all);
  check("no log line carries a URL or a query string", !/https?:\/\/|api_key|[?&]vin=|[?&]zip=/.test(all), all);
  check("no log line carries what MarketCheck answered", !/14832|14,832|24970|marketcheck_price|Invalid VIN|quota exhausted/i.test(all), all);
  check("every line is a status in fixed words", printed.every((l) => /^\[value\] (MarketCheck (price|demand): (HTTP \d{3}(, not JSON)?|timed out|no reply)|call count unavailable \(\w+\); not calling MarketCheck)$/.test(l)), printed);
}

server.closeAllConnections();
await new Promise<void>((resolve) => server.close(() => resolve()));

console.log(
  `\n${passed} passed, ${failed} failed.` +
    (failed ? "  \x1b[31mVALUE ESTIMATE WRONG\x1b[0m\n" : "  \x1b[32mValue estimate verified.\x1b[0m\n"),
);
process.exit(failed ? 1 : 0);
