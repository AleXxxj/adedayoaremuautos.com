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
  "rejects a malformed VIN (contains letter I)",
  `INSERT INTO vehicles (market_code, vin, make, model, year, mileage_unit,
     condition, price_minor, currency, status, slug)
   VALUES ('us','1HGBH41JXMN10918I','Honda','Accord',2018,'mi','Used',
     1800000,'USD','available','bad-vin');`,
  "vehicles_vin_well_formed",
);

/*
 * A missing VIN is allowed; a wrong one is not.
 *
 * The VIN used to be mandatory on a US listing, which stopped sales staff
 * entering a car at all before someone had walked round and read the plate —
 * so the car went unlisted rather than listed imperfectly. A blank VIN is an
 * absence anyone can see and fill in later. A mistyped one is worse than
 * blank, because it silently describes a different vehicle to anyone running
 * a history check, which is why the format is still enforced above.
 */
await allows(
  db,
  "accepts a vehicle with no VIN yet",
  `INSERT INTO vehicles (market_code, make, model, year, mileage_unit,
     condition, price_minor, currency, status, slug)
   VALUES ('us','Ford','Escape',2020,'mi','Used',
     1900000,'USD','available','no-vin');`,
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

/*
 * Holding the dates while a customer is paying.
 *
 * A quote is speculative and must not block anyone — proved above. But once
 * someone is at a payment page, those dates have to be held, or a second
 * customer can confirm the same week while the first is still typing their
 * card number and the business ends up having taken money for a car it cannot
 * supply. The hold is the difference, and these three assertions are the whole
 * of it: a held quote blocks, an unheld one does not, and releasing the hold
 * gives the week back.
 */
console.log("\nPayment holds");

const heldBooking = (id, from, to, hold) => `
  INSERT INTO rental_bookings
    (id, vehicle_id, market_code, period, customer_name, customer_phone,
     status, total_minor, currency, payment_hold_until)
  VALUES
    ('${id}','11111111-1111-1111-1111-111111111111','us',
     tstzrange('${from}','${to}','[)'),
     'Paying Customer','+13365550111','quote',50000,'USD',${hold});`;

await allows(
  db,
  "a quote with a live payment hold is accepted, Oct 1-5",
  heldBooking("bbbbbbbb-0000-0000-0000-000000000001", "2026-10-01", "2026-10-05", "now() + interval '30 minutes'"),
);

await rejects(
  db,
  "REJECTS a confirmed booking overlapping a held quote, Oct 3-8",
  `INSERT INTO rental_bookings
     (id, vehicle_id, market_code, period, customer_name, customer_phone,
      status, total_minor, currency)
   VALUES ('bbbbbbbb-0000-0000-0000-000000000002',
     '11111111-1111-1111-1111-111111111111','us',
     tstzrange('2026-10-03','2026-10-08','[)'),
     'Second Customer','+13365550112','confirmed',50000,'USD');`,
  "rental_bookings_no_overlap",
);

await allows(
  db,
  "releasing the hold frees the week again",
  `UPDATE rental_bookings SET payment_hold_until = NULL
     WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';
   INSERT INTO rental_bookings
     (id, vehicle_id, market_code, period, customer_name, customer_phone,
      status, total_minor, currency)
   VALUES ('bbbbbbbb-0000-0000-0000-000000000003',
     '11111111-1111-1111-1111-111111111111','us',
     tstzrange('2026-10-03','2026-10-08','[)'),
     'Second Customer','+13365550112','confirmed',50000,'USD');`,
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


// ── Deal flow ──────────────────────────────────────────────────────────────
console.log("\nDeal flow");

await allows(
  db,
  "staff row for the salesperson",
  `INSERT INTO staff (id, email, role) VALUES
     ('99999999-9999-4999-8999-999999999999','sales@example.com','sales')`,
);

const appt = (id, from, to, status, vehicle = "'11111111-1111-1111-1111-111111111111'") => `
  INSERT INTO appointments (id, market_code, vehicle_id, staff_id, kind, status,
                            period, customer_name)
  VALUES ('${id}','us',${vehicle},'99999999-9999-4999-8999-999999999999',
          'test_drive','${status}', tstzrange('${from}','${to}','[)'), 'Test Customer')`;

await allows(
  db,
  "first test drive, Sat 14:00-15:00",
  appt("bbbbbbbb-0000-0000-0000-000000000001", "2026-09-05T14:00Z", "2026-09-05T15:00Z", "scheduled"),
);

await rejects(
  db,
  "REJECTS a second test drive of the same car at 14:30",
  appt("bbbbbbbb-0000-0000-0000-000000000002", "2026-09-05T14:30Z", "2026-09-05T15:30Z", "confirmed"),
  "appointments_no_vehicle_overlap",
);

await allows(
  db,
  "allows the next slot at 15:00",
  appt("bbbbbbbb-0000-0000-0000-000000000003", "2026-09-05T15:00Z", "2026-09-05T16:00Z", "scheduled"),
);

await allows(
  db,
  "allows an overlapping CANCELLED appointment",
  appt("bbbbbbbb-0000-0000-0000-000000000004", "2026-09-05T14:15Z", "2026-09-05T14:45Z", "cancelled"),
);

const deal = (id, extra = "", status = "draft") => `
  INSERT INTO deals (id, market_code, vehicle_id, deal_number, customer_name,
                     customer_phone, currency, vehicle_price_minor, status ${extra ? "," + extra.split("=")[0] : ""})
  VALUES ('${id}','us','11111111-1111-1111-1111-111111111111','AAA-US-2026-${id.slice(-4)}',
          'Test Buyer','+13365550100','USD',2850000,'${status}'
          ${extra ? "," + extra.split("=")[1] : ""})`;

await allows(db, "draft deal", deal("cccccccc-0000-0000-0000-000000000001"));

await rejects(
  db,
  "rejects a deal priced in the wrong currency",
  `INSERT INTO deals (market_code, vehicle_id, deal_number, customer_name,
                      customer_phone, currency, vehicle_price_minor)
   VALUES ('us','11111111-1111-1111-1111-111111111111','AAA-US-2026-9001',
           'X','+1','NGN',2850000)`,
  "deals_currency_matches_market",
);

await rejects(
  db,
  "rejects an APR entered as 79000 bps (790%)",
  `INSERT INTO deals (market_code, vehicle_id, deal_number, customer_name,
                      customer_phone, currency, vehicle_price_minor,
                      is_financed, apr_bps, term_months)
   VALUES ('us','11111111-1111-1111-1111-111111111111','AAA-US-2026-9002',
           'X','+1','USD',2850000,true,79000,60)`,
  "deals_rates_sane",
);

await rejects(
  db,
  "rejects a financed deal with no terms",
  `INSERT INTO deals (market_code, vehicle_id, deal_number, customer_name,
                      customer_phone, currency, vehicle_price_minor, is_financed)
   VALUES ('us','11111111-1111-1111-1111-111111111111','AAA-US-2026-9003',
           'X','+1','USD',2850000,true)`,
  "deals_financed_requires_terms",
);

await rejects(
  db,
  "REJECTS delivery without a signed contract",
  `INSERT INTO deals (market_code, vehicle_id, deal_number, customer_name,
                      customer_phone, currency, vehicle_price_minor, status)
   VALUES ('us','11111111-1111-1111-1111-111111111111','AAA-US-2026-9004',
           'X','+1','USD',2850000,'delivered')`,
  "deals_delivery_requires_contract",
);

await allows(
  db,
  "allows delivery once contracted",
  `INSERT INTO deals (market_code, vehicle_id, deal_number, customer_name,
                      customer_phone, currency, vehicle_price_minor, status, contracted_at)
   VALUES ('us','11111111-1111-1111-1111-111111111111','AAA-US-2026-9005',
           'X','+1','USD',2850000,'delivered', now())`,
);

await rejects(
  db,
  "rejects a lost deal with no reason recorded",
  `INSERT INTO deals (market_code, vehicle_id, deal_number, customer_name,
                      customer_phone, currency, vehicle_price_minor, status)
   VALUES ('us','11111111-1111-1111-1111-111111111111','AAA-US-2026-9006',
           'X','+1','USD',2850000,'lost')`,
  "deals_lost_requires_reason",
);

await rejects(
  db,
  "rejects duplicate deal numbers",
  `INSERT INTO deals (market_code, vehicle_id, deal_number, customer_name,
                      customer_phone, currency, vehicle_price_minor)
   VALUES ('us','11111111-1111-1111-1111-111111111111','AAA-US-2026-9005',
           'X','+1','USD',2850000)`,
  "deals_number_idx",
);


// ── Finance ledger ─────────────────────────────────────────────────────────
console.log("\nFinance ledger");

const AG = "'eeeeeeee-0000-0000-0000-00000000000e'";

await allows(
  db,
  "create an agreement",
  `INSERT INTO finance_agreements (id, market_code, agreement_number, customer_name,
     customer_phone, currency, principal_minor, apr_bps, term_months,
     regular_payment_minor, total_interest_minor, first_due_date)
   VALUES (${AG},'us','AAA-FIN-US-0001','Test Buyer','+13365550100','USD',
           2000000, 790, 60, 40457, 427432, '2026-09-01')`,
);

await rejects(
  db,
  "rejects an agreement in the wrong currency",
  `INSERT INTO finance_agreements (market_code, agreement_number, customer_name,
     customer_phone, currency, principal_minor, apr_bps, term_months,
     regular_payment_minor, first_due_date)
   VALUES ('us','AAA-FIN-US-9001','X','+1','NGN',2000000,790,60,40457,'2026-09-01')`,
  "agreements_currency_matches_market",
);

await rejects(
  db,
  "rejects a 200-month term",
  `INSERT INTO finance_agreements (market_code, agreement_number, customer_name,
     customer_phone, currency, principal_minor, apr_bps, term_months,
     regular_payment_minor, first_due_date)
   VALUES ('us','AAA-FIN-US-9002','X','+1','USD',2000000,790,200,40457,'2026-09-01')`,
  "agreements_terms_sane",
);

await allows(
  db,
  "instalment where amount = interest + principal",
  `INSERT INTO instalments (agreement_id, number, due_date, amount_minor,
     interest_minor, principal_minor, balance_after_minor)
   VALUES (${AG}, 1, '2026-09-01', 40457, 13167, 27290, 1972710)`,
);

await rejects(
  db,
  "REJECTS an instalment whose parts do not add up",
  `INSERT INTO instalments (agreement_id, number, due_date, amount_minor,
     interest_minor, principal_minor, balance_after_minor)
   VALUES (${AG}, 2, '2026-10-01', 40457, 13167, 27000, 1945710)`,
  "instalments_amount_is_interest_plus_principal",
);

await rejects(
  db,
  "rejects a duplicate instalment number",
  `INSERT INTO instalments (agreement_id, number, due_date, amount_minor,
     interest_minor, principal_minor, balance_after_minor)
   VALUES (${AG}, 1, '2026-10-01', 40457, 13167, 27290, 1945710)`,
  "instalments_agreement_number_idx",
);

await rejects(
  db,
  "rejects paying more into an instalment than it is worth",
  `UPDATE instalments SET paid_minor = 50000 WHERE agreement_id = ${AG} AND number = 1`,
  "instalments_no_overpayment",
);

await rejects(
  db,
  "REJECTS 'paid' while money is still outstanding",
  `UPDATE instalments SET state = 'paid', paid_minor = 10000
   WHERE agreement_id = ${AG} AND number = 1`,
  "instalments_state_matches_money",
);

await allows(
  db,
  "allows 'partial' with a part payment",
  `UPDATE instalments SET state = 'partial', paid_minor = 10000
   WHERE agreement_id = ${AG} AND number = 1`,
);

await allows(
  db,
  "allows 'paid' when settled in full",
  `UPDATE instalments SET state = 'paid', paid_minor = 40457, paid_at = now()
   WHERE agreement_id = ${AG} AND number = 1`,
);

await rejects(
  db,
  "rejects a zero-value payment",
  `INSERT INTO finance_payments (agreement_id, amount_minor, currency)
   VALUES (${AG}, 0, 'USD')`,
  "finance_payments_positive",
);

await allows(
  db,
  "records a real payment",
  `INSERT INTO finance_payments (agreement_id, amount_minor, currency, method, reference)
   VALUES (${AG}, 40457, 'USD', 'bank_transfer', 'FT26090100123')`,
);

await rejects(
  db,
  "rejects settling with no settlement date",
  `UPDATE finance_agreements SET status = 'settled' WHERE id = ${AG}`,
  "agreements_settled_has_date",
);

/* ── Referral partners ──────────────────────────────────────────────────
   The agreement token is a bearer credential: whoever holds it can accept a
   contract in the partner's name. Two rows sharing one is therefore not a
   tidiness problem, it is one person signing for another, and the uniqueness
   has to come from the database rather than from the code that generates it.
   The partial index is what makes that compatible with the ordinary case of
   many partners having no token at all. */

// Two rates, and a new partner must start on both without anybody
// remembering to type them. A hire silently priced at the sale rate underpays
// a partner by more than three to one, with nothing on screen to show it.
await allows(
  db,
  "a new partner starts on 1.5% sales and 5% hire",
  `INSERT INTO referral_partners (market_code, code, full_name, phone)
   VALUES ('us','RATEDFLT-AAAA','Default Rate','+13365550199');
   DO $$
   DECLARE s int; h int;
   BEGIN
     SELECT commission_bps, rental_commission_bps INTO s, h
       FROM referral_partners WHERE code = 'RATEDFLT-AAAA';
     IF s <> 150 THEN RAISE EXCEPTION 'sale default is % bps, expected 150', s; END IF;
     IF h <> 500 THEN RAISE EXCEPTION 'hire default is % bps, expected 500', h; END IF;
   END $$;`,
);

await rejects(
  db,
  "rejects a hire commission above 20%",
  `UPDATE referral_partners SET rental_commission_bps = 5000
   WHERE code = 'RATEDFLT-AAAA'`,
  "referral_partners_rental_bps_sane",
);

await allows(
  db,
  "registers two referral partners",
  `INSERT INTO referral_partners (market_code, code, full_name, phone, status, agreement_token)
   VALUES ('us', 'TESTONE-AAAA', 'Test One', '+13365550100', 'approved', 'tok-one'),
          ('us', 'TESTTWO-BBBB', 'Test Two', '+13365550101', 'approved', 'tok-two')`,
);

await rejects(
  db,
  "REJECTS two partners sharing one agreement token",
  `UPDATE referral_partners SET agreement_token = 'tok-one' WHERE code = 'TESTTWO-BBBB'`,
  "referral_partners_agreement_token_idx",
);

await allows(
  db,
  "allows any number of partners with no token",
  `UPDATE referral_partners SET agreement_token = NULL
   WHERE code IN ('TESTONE-AAAA', 'TESTTWO-BBBB')`,
);

await allows(
  db,
  "a partner moves pending -> approved -> active",
  `UPDATE referral_partners SET status = 'pending' WHERE code = 'TESTONE-AAAA';
   UPDATE referral_partners SET status = 'approved' WHERE code = 'TESTONE-AAAA';
   UPDATE referral_partners SET status = 'active', agreed_at = now() WHERE code = 'TESTONE-AAAA'`,
);

await rejects(
  db,
  "rejects a rental credited to a partner who does not exist",
  `UPDATE rental_bookings
   SET referral_partner_id = '00000000-0000-0000-0000-000000000000'
   WHERE id IS NOT NULL`,
  "referral_partner",
);

/* ── Partner earnings ───────────────────────────────────────────────────
   The double-payment assertions are the point of this section. The rental
   payment webhook is delivered more than once by design, and a deal can be
   marked delivered, undone and marked again — so "write the commission when
   the money clears" pays the partner twice unless the database refuses the
   second row. */

const PARTNER = `(SELECT id FROM referral_partners WHERE code = 'TESTONE-AAAA')`;
const BOOKING = "'aaaaaaaa-0000-0000-0000-000000000001'";
const DEAL = "'cccccccc-0000-0000-0000-000000000001'";

await allows(
  db,
  "records a rental commission",
  `INSERT INTO partner_earnings
     (partner_id, market_code, source, rental_booking_id, basis_minor,
      commission_bps, amount_minor, currency, state, confirmed_at)
   VALUES (${PARTNER},'us','rental',${BOOKING},50000,200,1000,'USD','confirmed',now())`,
);

await rejects(
  db,
  "REJECTS a second commission on the same booking",
  `INSERT INTO partner_earnings
     (partner_id, market_code, source, rental_booking_id, basis_minor,
      commission_bps, amount_minor, currency, state, confirmed_at)
   VALUES (${PARTNER},'us','rental',${BOOKING},50000,200,1000,'USD','confirmed',now())`,
  "partner_earnings_booking_unique",
);

await allows(
  db,
  "records a sale commission",
  `INSERT INTO partner_earnings
     (partner_id, market_code, source, deal_id, basis_minor,
      commission_bps, amount_minor, currency, state, confirmed_at)
   VALUES (${PARTNER},'us','sale',${DEAL},2850000,150,42750,'USD','confirmed',now())`,
);

await rejects(
  db,
  "REJECTS a second commission on the same deal",
  `INSERT INTO partner_earnings
     (partner_id, market_code, source, deal_id, basis_minor,
      commission_bps, amount_minor, currency, state, confirmed_at)
   VALUES (${PARTNER},'us','sale',${DEAL},2850000,150,42750,'USD','confirmed',now())`,
  "partner_earnings_deal_unique",
);

await rejects(
  db,
  "rejects a commission pointing at both a booking and a deal",
  `INSERT INTO partner_earnings
     (partner_id, market_code, source, rental_booking_id, deal_id, basis_minor,
      commission_bps, amount_minor, currency)
   VALUES (${PARTNER},'us','rental','aaaaaaaa-0000-0000-0000-000000000002',
           'cccccccc-0000-0000-0000-000000000002',50000,200,1000,'USD')`,
  "partner_earnings_one_source",
);

await rejects(
  db,
  "rejects a commission pointing at nothing",
  `INSERT INTO partner_earnings
     (partner_id, market_code, source, basis_minor, commission_bps,
      amount_minor, currency)
   VALUES (${PARTNER},'us','rental',50000,200,1000,'USD')`,
  "partner_earnings_one_source",
);

await rejects(
  db,
  "rejects a rental commission filed as a sale",
  `INSERT INTO partner_earnings
     (partner_id, market_code, source, rental_booking_id, basis_minor,
      commission_bps, amount_minor, currency)
   VALUES (${PARTNER},'us','sale','aaaaaaaa-0000-0000-0000-000000000002',
           50000,200,1000,'USD')`,
  "partner_earnings_source_matches",
);

await rejects(
  db,
  "REJECTS 'confirmed' with no confirmation date",
  `INSERT INTO partner_earnings
     (partner_id, market_code, source, rental_booking_id, basis_minor,
      commission_bps, amount_minor, currency, state)
   VALUES (${PARTNER},'us','rental','aaaaaaaa-0000-0000-0000-000000000002',
           50000,200,1000,'USD','confirmed')`,
  "partner_earnings_confirmed_has_date",
);

await allows(
  db,
  "a partner requests a payout",
  `INSERT INTO partner_payouts (id, partner_id, market_code, amount_minor, currency)
   VALUES ('dddddddd-0000-0000-0000-00000000000a',${PARTNER},'us',43750,'USD')`,
);

await rejects(
  db,
  "REJECTS attaching a pending commission to a payout",
  `UPDATE partner_earnings
   SET payout_id = 'dddddddd-0000-0000-0000-00000000000a'
   WHERE rental_booking_id = ${BOOKING}`,
  "partner_earnings_payout_only_when_paid",
);

await allows(
  db,
  "attaches a settled commission to a payout",
  `UPDATE partner_earnings
   SET state = 'paid', payout_id = 'dddddddd-0000-0000-0000-00000000000a'
   WHERE rental_booking_id = ${BOOKING}`,
);

await rejects(
  db,
  "REJECTS a payout marked paid with no payment date",
  `UPDATE partner_payouts SET state = 'paid'
   WHERE id = 'dddddddd-0000-0000-0000-00000000000a'`,
  "partner_payouts_paid_has_date",
);

await rejects(
  db,
  "rejects rejecting a payout with no reason",
  `UPDATE partner_payouts SET state = 'rejected'
   WHERE id = 'dddddddd-0000-0000-0000-00000000000a'`,
  "partner_payouts_rejected_has_reason",
);

await allows(
  db,
  "pays a payout out",
  `UPDATE partner_payouts SET state = 'paid', paid_at = now(), reference = 'FT26101000991'
   WHERE id = 'dddddddd-0000-0000-0000-00000000000a'`,
);

console.log(
  `\n${passed} passed, ${failed} failed.` +
    (failed ? "  \x1b[31mSCHEMA NOT VERIFIED\x1b[0m\n" : "  \x1b[32mSchema verified.\x1b[0m\n"),
);
process.exit(failed ? 1 : 0);
