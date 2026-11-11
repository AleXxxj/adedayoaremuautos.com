#!/usr/bin/env node
/**
 * The free car check's daily allowance.
 *
 * Runs the real spendLookup against the real migrations in an in-memory
 * Postgres (PGlite): thirty cars a day per visitor, counted on a key that
 * can't be turned back into an address and that changes every month.
 *
 * Run: npm run test:vin
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

process.env.DATABASE_URL ??= "postgres://unused@localhost:5432/unused";
const { spendLookup, visitorKey, networkOf, DAILY_LOOKUPS } = await import("../src/lib/vin/usage");

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, detail: unknown = "") {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m ${JSON.stringify(detail)}`);
  }
}

const pg = await PGlite.create({ extensions: { btree_gist } });
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../src/db/migrations");
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  for (const stmt of readFileSync(join(migrationsDir, file), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)) {
    await pg.exec(stmt);
  }
}
const db = drizzle(pg) as never;
const SECRET = "test-secret-not-a-real-one";

console.log("\nWho counts as one visitor");
{
  const nov = new Date("2026-11-11T12:00:00Z");
  const dec = new Date("2026-12-01T00:00:01Z");
  const a = visitorKey("203.0.113.7", nov, SECRET);
  check("the same address on the same month: the same key", a === visitorKey("203.0.113.7", new Date("2026-11-30T23:59:59Z"), SECRET));
  check("a new month: a new key, so months can't be matched up", a !== visitorKey("203.0.113.7", dec, SECRET));
  check("another address: another key", a !== visitorKey("203.0.113.8", nov, SECRET));
  check("another secret: another key", a !== visitorKey("203.0.113.7", nov, "other"));
  check("the key doesn't contain the address", !a.includes("203") && a.length === 22, a);

  check("an IPv6 address counts by its /64 network", networkOf("2001:db8:85a3:12::8a2e:370:7334") === "2001:db8:85a3:12::/64", networkOf("2001:db8:85a3:12::8a2e:370:7334"));
  check(
    "so two addresses in one home count as one",
    visitorKey("2001:db8:85a3:12::1", nov, SECRET) === visitorKey("2001:0db8:85a3:0012:ffff:1:2:3", nov, SECRET),
  );
  check("a different network counts separately", networkOf("2001:db8:85a3:13::1") !== networkOf("2001:db8:85a3:12::1"));
  check("IPv4 written the IPv6 way is IPv4", networkOf("::ffff:203.0.113.7") === "203.0.113.7");
  check("a short IPv6 address expands correctly", networkOf("::1") === "0:0:0:0::/64", networkOf("::1"));
}

console.log("\nThe daily allowance");
{
  const day = new Date("2026-11-11T09:00:00Z");
  const spend = (ip: string, now = day) => spendLookup({ database: db, ip, now, secret: SECRET });

  let allowed = 0;
  for (let i = 0; i < DAILY_LOOKUPS; i++) if (await spend("198.51.100.20")) allowed++;
  check(`${DAILY_LOOKUPS} lookups (30 cars) are allowed`, allowed === DAILY_LOOKUPS, allowed);
  check("the next is refused", (await spend("198.51.100.20")) === false);
  check("and so is the one after", (await spend("198.51.100.20")) === false);
  check("someone else is unaffected", (await spend("198.51.100.21")) === true);
  check("tomorrow starts again", (await spend("198.51.100.20", new Date("2026-11-12T00:00:05Z"))) === true);

  const rows = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM vin_check_usage WHERE visitor LIKE '%198%'`);
  check("no address is stored", rows.rows[0].n === 0);

  // Three days on, a new visitor's first lookup clears the old days.
  await spend("192.0.2.1", new Date("2026-11-15T10:00:00Z"));
  const old = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM vin_check_usage WHERE day < '2026-11-13'`);
  check("old days are cleared as new ones start", old.rows[0].n === 0, old.rows[0]);
}

console.log("\nWhen the count can't be kept");
{
  const day = new Date("2026-11-20T09:00:00Z");
  const realError = console.error;
  const realWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  const broken = {
    insert() {
      throw new Error("database down");
    },
  } as never;
  check(
    "a database error lets the check through, rather than turning everyone away",
    (await spendLookup({ database: broken, ip: "198.51.100.40", now: day, secret: SECRET })) === true,
  );
  // How a dropped connection usually arrives: the query is sent, and its
  // promise rejects later.
  const dropped = {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: () => Promise.reject(new Error("connection reset")),
        }),
      }),
    }),
  } as never;
  check(
    "so does a query that fails after it was sent",
    (await spendLookup({ database: dropped, ip: "198.51.100.42", now: day, secret: SECRET })) === true,
  );
  check(
    "no secret to key the count with: checks go through, uncounted",
    (await spendLookup({ database: db, ip: "198.51.100.41", now: day, secret: "" })) === true,
  );
  const stored = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM vin_check_usage WHERE day = '2026-11-20'`);
  check("and nothing is stored without a key", stored.rows[0].n === 0, stored.rows[0]);
  console.error = realError;
  console.warn = realWarn;
}

console.log(
  `\n${passed} passed, ${failed} failed.` +
    (failed ? "  \x1b[31mVIN LIMIT WRONG\x1b[0m\n" : "  \x1b[32mVIN limit verified.\x1b[0m\n"),
);
process.exit(failed ? 1 : 0);
