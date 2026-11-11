#!/usr/bin/env node
/**
 * What happens to a reservation when a checkout ends unpaid.
 *
 * Runs the real restoreHoldAfterCheckout — the statement the Stripe webhook
 * runs — against the real migrations in an in-memory Postgres (PGlite), so
 * the SQL itself is what gets checked: GREATEST over NULLs, the open-checkout
 * subquery, and the WHERE that leaves a released hold alone. A mistake here
 * either hands a reserved car to somebody else or keeps a free one off the
 * market, and neither shows up until a customer is standing at the counter.
 *
 * Run: npm run test:holds
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// src/db/index.ts insists on a connection string when imported. Nothing here
// uses that connection — the function under test is handed the PGlite one.
process.env.DATABASE_URL ??= "postgres://unused@localhost:5432/unused";
const { restoreHoldAfterCheckout, findOwnHold } = await import("../src/lib/rentalHolds");
const schema = await import("../src/db/schema");

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m ${detail}`);
  }
}

const pg = await PGlite.create({ extensions: { btree_gist } });
const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "../src/db/migrations");
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  const statements = readFileSync(join(migrationsDir, file), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) await pg.exec(stmt);
}

await pg.exec(`
  INSERT INTO markets (code, name, currency, locale, timezone, distance_unit) VALUES
    ('us','United States','USD','en-US','America/New_York','mi');
  INSERT INTO vehicles (id, market_code, make, model, year, mileage_unit, condition,
      price_minor, currency, status, slug)
    VALUES ('11111111-1111-1111-1111-111111111111','us','Toyota','Camry',2019,'mi','Used',
      1500000,'USD','available','2019-toyota-camry');
`);

/** A quote on its own week of the calendar, so no two scenarios overlap. */
async function booking(
  n: number,
  opts: { status?: string; hold: string | null; reserved: string | null },
) {
  const id = `bbbbbbbb-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const from = new Date(Date.UTC(2027, 0, 1 + n * 10));
  const to = new Date(from.getTime() + 7 * 86_400_000);
  await pg.exec(`
    INSERT INTO rental_bookings
      (id, vehicle_id, market_code, period, customer_name, customer_phone, status,
       total_minor, currency, payment_hold_until, reserved_until)
    VALUES
      ('${id}','11111111-1111-1111-1111-111111111111','us',
       tstzrange('${from.toISOString()}','${to.toISOString()}','[)'),
       'Test Renter','+13365550100','${opts.status ?? "quote"}',50000,'USD',
       ${opts.hold ?? "NULL"}, ${opts.reserved ?? "NULL"});`);
  return id;
}

async function payment(bookingId: string, ref: string, status: string, createdAgo: string) {
  await pg.exec(`
    INSERT INTO rental_payments
      (booking_id, market_code, provider, provider_ref, amount_minor, currency, status, created_at)
    VALUES ('${bookingId}','us','stripe','${ref}',50000,'USD','${status}', now() - interval '${createdAgo}');`);
}

/** One yes/no question about a booking, answered by Postgres itself. */
async function ask(sql: string): Promise<boolean> {
  const r = await pg.query<{ ok: boolean }>(sql);
  return r.rows[0]?.ok === true;
}

const db = drizzle(pg, { schema }) as never;

/*
 * Every booking starts with a hold that is NOT the expected answer (five hours
 * out, a value nothing in the rules produces), so each check can only pass if
 * the function really rewrote it. A fixture whose starting hold already
 * equals the expected result would pass with the function deleted.
 */
const SENTINEL = "now() + interval '5 hours'";

console.log("\nWhen a checkout ends unpaid");

// A. A two-day reservation, and the checkout opened from it expires.
{
  const id = await booking(1, { hold: SENTINEL, reserved: "now() + interval '2 days'" });
  await payment(id, "cs_a", "expired", "31 minutes");
  await restoreHoldAfterCheckout(id, db);
  check(
    "the reservation is kept, to the minute",
    await ask(`SELECT payment_hold_until = reserved_until AND reserved_until > now() + interval '47 hours' AS ok
               FROM rental_bookings WHERE id = '${id}'`),
  );
}

// B. No reservation left, but a second checkout is still open.
{
  const id = await booking(2, { hold: SENTINEL, reserved: "now() - interval '1 hour'" });
  await payment(id, "cs_b1", "expired", "31 minutes");
  await payment(id, "cs_b2", "pending", "10 minutes");
  await restoreHoldAfterCheckout(id, db);
  check(
    "the still-open checkout keeps its half hour",
    await ask(`SELECT b.payment_hold_until = (SELECT max(created_at) + interval '30 minutes'
                 FROM rental_payments WHERE booking_id = b.id AND status = 'pending') AS ok
               FROM rental_bookings b WHERE b.id = '${id}'`),
  );
  check(
    "and the ended reservation is cleared",
    await ask(`SELECT reserved_until IS NULL AS ok FROM rental_bookings WHERE id = '${id}'`),
  );
}

// C. Both running: whichever ends later wins.
{
  const id = await booking(3, { hold: SENTINEL, reserved: "now() + interval '2 hours'" });
  await payment(id, "cs_c", "pending", "5 minutes");
  await restoreHoldAfterCheckout(id, db);
  check(
    "a longer reservation outlasts an open checkout",
    await ask(`SELECT payment_hold_until = reserved_until AS ok FROM rental_bookings WHERE id = '${id}'`),
  );
}
{
  const id = await booking(4, { hold: SENTINEL, reserved: "now() + interval '10 minutes'" });
  await payment(id, "cs_d", "pending", "5 minutes");
  await restoreHoldAfterCheckout(id, db);
  check(
    "an open checkout outlasts a reservation about to end",
    await ask(`SELECT b.payment_hold_until = (SELECT max(created_at) + interval '30 minutes'
                 FROM rental_payments WHERE booking_id = b.id AND status = 'pending')
               AND b.payment_hold_until > b.reserved_until AS ok
               FROM rental_bookings b WHERE b.id = '${id}'`),
  );
}

// D. Nothing running any more: the dates go back on the market.
{
  const id = await booking(5, { hold: SENTINEL, reserved: null });
  await payment(id, "cs_e", "expired", "31 minutes");
  await restoreHoldAfterCheckout(id, db);
  check(
    "with nothing running, the car is released",
    await ask(`SELECT payment_hold_until IS NULL AND reserved_until IS NULL AS ok
               FROM rental_bookings WHERE id = '${id}'`),
  );
}

// E. Staff released the hold before the expiry arrived: stays released.
{
  const id = await booking(6, { hold: null, reserved: null });
  await payment(id, "cs_f", "pending", "5 minutes");
  await restoreHoldAfterCheckout(id, db);
  check(
    "a hold staff released is not revived",
    await ask(`SELECT payment_hold_until IS NULL AS ok FROM rental_bookings WHERE id = '${id}'`),
  );
}

// F. Already confirmed: nothing to restore, even with a stale hold time on it.
{
  const id = await booking(7, { status: "confirmed", hold: SENTINEL, reserved: null });
  await restoreHoldAfterCheckout(id, db);
  check(
    "a confirmed booking is untouched",
    await ask(`SELECT status = 'confirmed' AND payment_hold_until > now() + interval '4 hours' AS ok
               FROM rental_bookings WHERE id = '${id}'`),
  );
}

// ── A retry after a lost reply ─────────────────────────────────────────────
//
// requestRental asks findOwnHold before storing anything. It must find the
// renter's own live reservation however they typed their number, and nothing
// that differs in any one respect — so it can never hand someone else's
// booking to the wrong person.
console.log("\nRecognizing a retry of the same reservation");
{
  const own = await booking(8, { hold: "now() + interval '2 days'", reserved: "now() + interval '2 days'" });
  const row = await pg.query<{ p: string }>(`SELECT period::text AS p FROM rental_bookings WHERE id = '${own}'`);
  const period = row.rows[0].p;
  const car = "11111111-1111-1111-1111-111111111111";
  const find = (over: Partial<{ vehicleId: string; period: string; phone: string }>) =>
    findOwnHold({ vehicleId: car, period, phone: "+13365550100", ...over }, db);

  check("finds the renter's own hold", (await find({}))?.id === own);
  // Exactly the string requestRental builds, not Postgres's own text form.
  const from = new Date(Date.UTC(2027, 0, 1 + 8 * 10));
  const to = new Date(from.getTime() + 7 * 86_400_000);
  check(
    "with the dates written the way the booking form sends them",
    (await find({ period: `[${from.toISOString()},${to.toISOString()})` }))?.id === own,
  );
  check("however the number is typed", (await find({ phone: "(336) 555-0100" }))?.id === own);
  check("not for a different number", (await find({ phone: "3365550199" })) === null);
  check(
    "not for a different car",
    (await find({ vehicleId: "22222222-2222-2222-2222-222222222222" })) === null,
  );
  check(
    "not for different dates",
    (await find({ period: "[2030-01-01 00:00:00+00,2030-01-08 00:00:00+00)" })) === null,
  );

  const lapsed = await booking(9, { hold: "now() - interval '1 minute'", reserved: null });
  const lapsedPeriod = (
    await pg.query<{ p: string }>(`SELECT period::text AS p FROM rental_bookings WHERE id = '${lapsed}'`)
  ).rows[0].p;
  check(
    "not once the hold has run out",
    (await findOwnHold({ vehicleId: car, period: lapsedPeriod, phone: "+13365550100" }, db)) === null,
  );
}

// A refused booking deletes the renter's uploaded documents, so "refused" is
// read from the database's own constraint field, never from message text,
// which repeats whatever the renter typed.
console.log("\nTelling a refused booking from a lost reply");
{
  const { refusedBy, violates } = await import("../src/lib/dbError");
  const real = drizzle(pg, { schema });
  const car = "11111111-1111-1111-1111-111111111111";
  const week = (n: number) => {
    const from = new Date(Date.UTC(2028, 0, 1 + n * 10));
    return `[${from.toISOString()},${new Date(from.getTime() + 7 * 86_400_000).toISOString()})`;
  };
  const insert = (period: string, note = "") =>
    real.insert(schema.rentalBookings).values({
      vehicleId: car,
      marketCode: "us",
      period: period as never,
      customerName: "Test Renter",
      customerPhone: "+13365550100",
      status: "confirmed",
      totalMinor: 50000,
      currency: "USD",
      notes: note || null,
    } as never);

  await insert(week(1));
  let clash: unknown = null;
  try {
    await insert(week(1));
  } catch (e) {
    clash = e;
  }
  check("a booked week is refused by the no-overlap constraint", refusedBy(clash, "rental_bookings_no_overlap"), String(clash));

  let empty: unknown = null;
  const day = new Date(Date.UTC(2028, 5, 1)).toISOString();
  try {
    await insert(`[${day},${day})`);
  } catch (e) {
    empty = e;
  }
  check("an empty period is refused by its own constraint", refusedBy(empty, "rental_bookings_period_not_empty"), String(empty));

  // What Drizzle throws when the connection drops after the row was saved:
  // its message repeats the query's parameters, here a note that happens to
  // name the constraint, and its cause has no constraint field.
  const lostReply = Object.assign(
    new Error('Failed query: insert into "rental_bookings" ... params: rental_bookings_no_overlap,Test Renter'),
    { cause: Object.assign(new Error("write CONNECTION_CLOSED"), { code: "CONNECTION_CLOSED" }) },
  );
  check("a lost reply is never taken for a refusal", !refusedBy(lostReply, "rental_bookings_no_overlap"));
  check("(text matching would have been fooled)", violates(lostReply, "rental_bookings_no_overlap"));
}

console.log(
  `\n${passed} passed, ${failed} failed.` +
    (failed ? "  \x1b[31mHOLDS WRONG\x1b[0m\n" : "  \x1b[32mHolds verified.\x1b[0m\n"),
);
process.exit(failed ? 1 : 0);
