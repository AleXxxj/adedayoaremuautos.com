#!/usr/bin/env node
/**
 * Applies the real migrations to an in-memory Postgres (PGlite) and asserts
 * that the database rejects invalid states.
 *
 * The point is that the constraints are proven, not assumed. Every assertion
 * below corresponds to a way the business could lose money or credibility:
 * two customers arriving for one rental car, a Lagos vehicle priced in dollars,
 * a listing going live with no price.
 *
 *   node scripts/verify-schema.mjs
 */

import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "../src/db/migrations");

let passed = 0;
let failed = 0;

function ok(label) {
  passed++;
  console.log(`  \x1b[32m✓\x1b[0m ${label}`);
}

function bad(label, detail) {
  failed++;
  console.log(`  \x1b[31m✗ ${label}\x1b[0m`);
  if (detail) console.log(`      ${String(detail).split("\n")[0]}`);
}

/** Assert a statement succeeds. */
async function allows(db, label, sql) {
  try {
    await db.exec(sql);
    ok(label);
  } catch (e) {
    bad(label, e.message);
  }
}

/** Assert a statement is rejected by the database. */
async function rejects(db, label, sql, expectFragment) {
  try {
    await db.exec(sql);
    bad(label, "statement was ACCEPTED but should have been rejected");
  } catch (e) {
    if (expectFragment && !e.message.includes(expectFragment)) {
      bad(label, `rejected, but not for the expected reason: ${e.message}`);
    } else {
      ok(label);
    }
  }
}

const db = await PGlite.create({ extensions: { btree_gist } });

// ── Apply migrations exactly as production will ────────────────────────────
console.log("\nApplying migrations");
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    for (const stmt of statements) await db.exec(stmt);
    ok(`${file} (${statements.length} statements)`);
  } catch (e) {
    bad(file, e.message);
    console.log("\nMigration failed — cannot continue.\n");
    process.exit(1);
  }
}

// ── Fixtures ───────────────────────────────────────────────────────────────
console.log("\nSeeding fixtures");
await allows(
  db,
  "insert both markets",
  `INSERT INTO markets (code, name, currency, locale, timezone, distance_unit) VALUES
     ('us','United States','USD','en-US','America/New_York','mi'),
     ('ng','Nigeria','NGN','en-NG','Africa/Lagos','km');`,
);

await allows(
  db,
  "insert a US vehicle with a valid VIN",
  `INSERT INTO vehicles
     (id, market_code, vin, make, model, year, mileage_unit, condition,
      price_minor, currency, status, slug)
   VALUES
     ('11111111-1111-1111-1111-111111111111','us','1HGBH41JXMN109186',
      'Mercedes-Benz','GLE 350',2019,'mi','Certified Pre-Owned',
      2850000,'USD','available','2019-mercedes-benz-gle-350');`,
);

await allows(
  db,
  "insert a Nigerian vehicle with a chassis number",
  `INSERT INTO vehicles
     (id, market_code, chassis_no, make, model, year, mileage_unit, condition,
      price_minor, currency, status, slug)
   VALUES
     ('22222222-2222-2222-2222-222222222222','ng','JN8AS5MT0DW0123456',
      'Nissan','Rogue',2013,'km','Foreign Used',
      1500000000,'NGN','available','2013-nissan-rogue');`,
);

// ── Market integrity ───────────────────────────────────────────────────────
console.log("\nMarket integrity");
await rejects(
  db,
  "rejects a Nigerian vehicle priced in USD",
  `INSERT INTO vehicles (market_code, chassis_no, make, model, year, mileage_unit,
     condition, price_minor, currency, status, slug)
   VALUES ('ng','CH123456789','Toyota','Camry',2012,'km','Foreign Used',
     1250000,'USD','available','bad-currency');`,
  "vehicles_currency_matches_market",
);

await rejects(
  db,
  "rejects a US vehicle with a malformed VIN (contains letter I)",
  `INSERT INTO vehicles (market_code, vin, make, model, year, mileage_unit,
     condition, price_minor, currency, status, slug)
   VALUES ('us','1HGBH41JXMN10918I','Honda','Accord',2018,'mi','Used',
     1800000,'USD','available','bad-vin');`,
  "vehicles_identity_matches_market",
);

await rejects(
  db,
  "rejects a US vehicle with no VIN at all",
  `INSERT INTO vehicles (market_code, make, model, year, mileage_unit,
     condition, price_minor, currency, status, slug)
   VALUES ('us','Ford','Escape',2020,'mi','Used',
     1900000,'USD','available','no-vin');`,
  "vehicles_identity_matches_market",
);

await rejects(
  db,
  "rejects a duplicate VIN",
  `INSERT INTO vehicles (market_code, vin, make, model, year, mileage_unit,
     condition, price_minor, currency, status, slug)
   VALUES ('us','1HGBH41JXMN109186','Mercedes-Benz','GLE 350',2019,'mi','Used',
     2900000,'USD','available','duplicate-vin');`,
  "vehicles_vin_unique_idx",
);

await rejects(
  db,
  "rejects publishing a vehicle with no price",
  `INSERT INTO vehicles (market_code, vin, make, model, year, mileage_unit,
     condition, currency, status, slug)
   VALUES ('us','5FNRL38707B012345','Honda','Odyssey',2017,'mi','Used',
     'USD','available','no-price');`,
  "vehicles_available_requires_price",
);

await allows(
  db,
  "allows a draft with no price (still being prepared)",
  `INSERT INTO vehicles (market_code, vin, make, model, year, mileage_unit,
     condition, currency, status, slug)
   VALUES ('us','5FNRL38707B012345','Honda','Odyssey',2017,'mi','Used',
     'USD','draft','draft-no-price');`,
);

// ── Rental double-booking ──────────────────────────────────────────────────
console.log("\nRental availability (the race condition)");

const booking = (id, from, to, status) => `
  INSERT INTO rental_bookings
    (id, vehicle_id, market_code, period, customer_name, customer_phone,
     status, total_minor, currency)
  VALUES
    ('${id}','11111111-1111-1111-1111-111111111111','us',
     tstzrange('${from}','${to}','[)'),
     'Test Customer','+13365550100','${status}',50000,'USD');`;

await allows(
  db,
  "first confirmed booking, Sep 1–8",
  booking("aaaaaaaa-0000-0000-0000-000000000001", "2026-09-01", "2026-09-08", "confirmed"),
);

await rejects(
  db,
  "REJECTS an overlapping confirmed booking, Sep 5–12",
  booking("aaaaaaaa-0000-0000-0000-000000000002", "2026-09-05", "2026-09-12", "confirmed"),
  "rental_bookings_no_overlap",
);

await rejects(
  db,
  "REJECTS a booking fully inside the first, Sep 3–5",
  booking("aaaaaaaa-0000-0000-0000-000000000003", "2026-09-03", "2026-09-05", "confirmed"),
  "rental_bookings_no_overlap",
);

await allows(
  db,
  "allows an adjacent booking starting exactly at handover, Sep 8–12",
  booking("aaaaaaaa-0000-0000-0000-000000000004", "2026-09-08", "2026-09-12", "confirmed"),
);

await allows(
  db,
  "allows an overlapping QUOTE (speculative, must not block real bookings)",
  booking("aaaaaaaa-0000-0000-0000-000000000005", "2026-09-02", "2026-09-06", "quote"),
);

await allows(
  db,
  "allows an overlapping CANCELLED booking",
  booking("aaaaaaaa-0000-0000-0000-000000000006", "2026-09-02", "2026-09-06", "cancelled"),
);

// Postgres rejects a backwards range in the tstzrange() constructor itself,
// before any CHECK constraint is evaluated — stricter than our own rule.
await rejects(
  db,
  "rejects a backwards date range (return before pickup)",
  booking("aaaaaaaa-0000-0000-0000-000000000007", "2026-10-10", "2026-10-01", "confirmed"),
  "range lower bound must be less than or equal to range upper bound",
);

// An equal start and end constructs fine but is an EMPTY range — a zero-length
// booking. That is what the CHECK constraint is actually there to catch, since
// an empty range overlaps nothing and would slip past the exclusion constraint.
await rejects(
  db,
  "rejects a zero-length booking (empty range)",
  booking("aaaaaaaa-0000-0000-0000-000000000008", "2026-10-01", "2026-10-01", "confirmed"),
  "rental_bookings_period_not_empty",
);

// ── Media ──────────────────────────────────────────────────────────────────
console.log("\nVehicle media");
await allows(
  db,
  "first primary photo",
  `INSERT INTO vehicle_media (vehicle_id, storage_key, is_primary, position)
   VALUES ('11111111-1111-1111-1111-111111111111','a.jpg',true,0);`,
);
await rejects(
  db,
  "rejects a second primary photo on the same vehicle",
  `INSERT INTO vehicle_media (vehicle_id, storage_key, is_primary, position)
   VALUES ('11111111-1111-1111-1111-111111111111','b.jpg',true,1);`,
  "vehicle_media_one_primary_idx",
);
await allows(
  db,
  "allows additional non-primary photos",
  `INSERT INTO vehicle_media (vehicle_id, storage_key, is_primary, position)
   VALUES ('11111111-1111-1111-1111-111111111111','c.jpg',false,1);`,
);

// ── Triggers ───────────────────────────────────────────────────────────────
console.log("\nAutomatic updated_at");
const before = await db.query(
  `SELECT updated_at FROM vehicles WHERE id='11111111-1111-1111-1111-111111111111'`,
);
await db.exec(
  `UPDATE vehicles SET headline='Price reduced'
   WHERE id='11111111-1111-1111-1111-111111111111';`,
);
const after = await db.query(
  `SELECT updated_at FROM vehicles WHERE id='11111111-1111-1111-1111-111111111111'`,
);
if (new Date(after.rows[0].updated_at) > new Date(before.rows[0].updated_at)) {
  ok("updated_at advances on UPDATE without application involvement");
} else {
  bad("updated_at did not advance", `${before.rows[0].updated_at} -> ${after.rows[0].updated_at}`);
}

// ── Money range ────────────────────────────────────────────────────────────
console.log("\nMoney range (the int4 overflow trap)");
const bigNaira = 25_000_000_00; // ₦25,000,000 in kobo = 2,500,000,000
await allows(
  db,
  `stores ₦25,000,000 as ${bigNaira.toLocaleString()} kobo (would overflow int4)`,
  `INSERT INTO vehicles (market_code, chassis_no, make, model, year, mileage_unit,
     condition, price_minor, currency, status, slug)
   VALUES ('ng','CH987654321','Toyota','Land Cruiser',2021,'km','Foreign Used',
     ${bigNaira},'NGN','available','toyota-land-cruiser');`,
);
const roundTrip = await db.query(
  `SELECT price_minor FROM vehicles WHERE slug='toyota-land-cruiser'`,
);
if (String(roundTrip.rows[0].price_minor) === String(bigNaira)) {
  ok("value round-trips exactly (no precision loss)");
} else {
  bad("value did not round-trip", `${bigNaira} -> ${roundTrip.rows[0].price_minor}`);
}

console.log(
  `\n${passed} passed, ${failed} failed.` +
    (failed ? "  \x1b[31mSCHEMA NOT VERIFIED\x1b[0m\n" : "  \x1b[32mSchema verified.\x1b[0m\n"),
);
process.exit(failed ? 1 : 0);
