#!/usr/bin/env node
/**
 * Who a partner is paid for, and how much.
 *
 * Runs the real recordRentalEarning, syncRentalEarning, takeCounterPayment
 * and referralPartnerForRenter against the real migrations in an in-memory
 * Postgres (PGlite). These decide whether a referral partner is paid at all:
 * commission comes only from recorded payments, and a partner earns on every
 * week their renter keeps renting — with the same phone number, long after
 * their link's 90-day cookie is gone — but never on the business's own
 * customers, on a renter nobody actually rented to, or on themselves.
 *
 * Run: npm run test:referrals
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// src/db/index.ts insists on a connection string when imported; nothing here
// uses it — every function under test is handed the PGlite database.
process.env.DATABASE_URL ??= "postgres://unused@localhost:5432/unused";
const { recordRentalEarning, syncRentalEarning } = await import("../src/lib/partnerEarnings");
const { referralPartnerForRenter } = await import("../src/lib/partner");
const { takeCounterPayment } = await import("../src/lib/counterPayment");
const schema = await import("../src/db/schema");

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
const db = drizzle(pg, { schema }) as never;

const CAR = "11111111-1111-1111-1111-111111111111";
const NG_CAR = "22222222-2222-2222-2222-222222222222";
const ADA = "aaaa0000-0000-4000-8000-000000000001"; // active, on the current terms
const BEN = "bbbb0000-0000-4000-8000-000000000002"; // active, on the current terms
const CY = "cccc0000-0000-4000-8000-000000000003"; // suspended
const DEE = "dddd0000-0000-4000-8000-000000000004"; // active, still on v1
const STAFF = "99999999-9999-4999-8999-999999999999";

await pg.exec(`
  INSERT INTO markets (code, name, currency, locale, timezone, distance_unit) VALUES
    ('us','United States','USD','en-US','America/New_York','mi'),
    ('ng','Nigeria','NGN','en-NG','Africa/Lagos','km');
  INSERT INTO vehicles (id, market_code, make, model, year, mileage_unit, condition,
      price_minor, currency, status, slug) VALUES
    ('${CAR}','us','Toyota','Camry',2019,'mi','Used',1500000,'USD','available','camry'),
    ('${NG_CAR}','ng','Toyota','Corolla',2018,'km','Used',900000000,'NGN','available','corolla');
  INSERT INTO staff (id, email, role) VALUES ('${STAFF}','owner@example.com','owner');
  INSERT INTO referral_partners
      (id, market_code, code, full_name, phone, whatsapp, status, agreed_at, agreement_version) VALUES
    ('${ADA}','us','ADA-AAAA','Ada Partner','+13365550001',NULL,'active', now(),'2026-11-v2'),
    ('${BEN}','us','BEN-BBBB','Ben Partner','+13365550002','+1 336 555 0022','active', now(),'2026-11-v2'),
    ('${CY}','us','CY-CCCC','Cy Partner','+13365550003',NULL,'suspended', now(),'2026-11-v2'),
    ('${DEE}','us','DEE-DDDD','Dee Partner','+13365550004',NULL,'active', now(),'2026-10-v1');
`);

let week = 0;
/** A week-long booking on its own dates; created_at spaced so "first" is clear. */
async function booking(
  phone: string,
  partner: string | null,
  opts: {
    totalMinor?: number;
    status?: string;
    injuryCoverMinor?: number;
    holdUntil?: Date;
    market?: "us" | "ng";
    /** Book these exact dates, to set up a clash. */
    from?: Date;
  } = {},
) {
  week++;
  const id = `eeee0000-0000-4000-8000-${String(week).padStart(12, "0")}`;
  const from = opts.from ?? new Date(Date.UTC(2027, 0, 1 + week * 8));
  const to = new Date(from.getTime() + 7 * 86_400_000);
  const ng = opts.market === "ng";
  await pg.exec(`
    INSERT INTO rental_bookings
      (id, vehicle_id, market_code, period, customer_name, customer_phone, status,
       total_minor, injury_cover_total_minor, currency, referral_partner_id,
       payment_hold_until, created_at)
    VALUES ('${id}','${ng ? NG_CAR : CAR}','${ng ? "ng" : "us"}',
       tstzrange('${from.toISOString()}','${to.toISOString()}','[)'),
       'Renter','${phone}','${opts.status ?? "confirmed"}',${opts.totalMinor ?? 45000},
       ${opts.injuryCoverMinor ?? 0},'${ng ? "NGN" : "USD"}',
       ${partner ? `'${partner}'` : "NULL"},
       ${opts.holdUntil ? `'${opts.holdUntil.toISOString()}'` : "NULL"},
       now() - interval '${1000 - week} days');`);
  return id;
}

type Staff = { id: string; mayTakeFor: (market: "us" | "ng") => boolean };
const anyMarket: Staff = { id: STAFF, mayTakeFor: () => true };

/** Money at the counter, the way the admin action takes it. */
async function counter(bookingId: string, amountMajor: number, staff: Staff = anyMarket) {
  const outcome = await takeCounterPayment(
    { bookingId, amountMajor, method: "cash", clientKey: randomUUID() },
    staff,
    db,
  );
  if (outcome.ok) await recordRentalEarning(bookingId, db);
  return outcome;
}

let ref = 0;
/** A card payment that cleared, as the webhook records it. */
async function online(bookingId: string, amountMinor: number) {
  ref++;
  await pg.exec(`
    INSERT INTO rental_payments
      (booking_id, market_code, provider, provider_ref, amount_minor, currency, status, paid_at)
    VALUES ('${bookingId}','us','stripe','cs_test_${ref}',${amountMinor},'USD','paid',now());`);
}

/** Staff changing a booking's status, the way updateBookingStatus does. */
async function setStatus(bookingId: string, status: string) {
  await pg.exec(`UPDATE rental_bookings SET status = '${status}' WHERE id = '${bookingId}'`);
  await syncRentalEarning(bookingId, status, db);
}

async function earning(bookingId: string) {
  const r = await pg.query<{ basis_minor: string; amount_minor: string; state: string; note: string | null }>(
    `SELECT basis_minor, amount_minor, state, note FROM partner_earnings WHERE rental_booking_id = '${bookingId}'`,
  );
  const row = r.rows[0];
  return row
    ? { basis: Number(row.basis_minor), amount: Number(row.amount_minor), state: row.state, note: row.note }
    : null;
}

async function bookingRow(bookingId: string) {
  const r = await pg.query<{ status: string; payment_hold_until: string | null }>(
    `SELECT status, payment_hold_until FROM rental_bookings WHERE id = '${bookingId}'`,
  );
  return r.rows[0];
}

async function payments(bookingId: string) {
  const r = await pg.query<{ amount_minor: string; method: string | null; recorded_by: string | null }>(
    `SELECT amount_minor, method, recorded_by FROM rental_payments WHERE booking_id = '${bookingId}' AND status = 'paid'`,
  );
  return r.rows.map((p) => ({ amount: Number(p.amount_minor), method: p.method, by: p.recorded_by }));
}

const phone = (n: number) => `+1 336 555 ${String(n).padStart(4, "0")}`;

// ── The commission follows the money and the car ───────────────────────────
console.log("\nCommission follows what was paid and whether the car is back");
{
  const b = await booking(phone(100), ADA, { status: "confirmed" });
  await recordRentalEarning(b, db);
  check("nothing is owed before any money is recorded", (await earning(b)) === null);

  await counter(b, 200);
  let e = await earning(b);
  check("half paid: 5% of $200, pending until the car is back", e?.basis === 20000 && e.amount === 1000 && e.state === "pending", e);

  await counter(b, 250);
  e = await earning(b);
  check("the rest paid: the same commission grows to 5% of $450", e?.basis === 45000 && e.amount === 2250 && e.state === "pending", e);

  await recordRentalEarning(b, db);
  e = await earning(b);
  check("working it out again changes nothing", e?.basis === 45000 && e.amount === 2250, e);

  await setStatus(b, "returned");
  e = await earning(b);
  check("the car is back: confirmed", e?.state === "confirmed" && e.basis === 45000, e);
}
{
  const b = await booking(phone(101), ADA, { status: "active" });
  await setStatus(b, "returned");
  await counter(b, 450);
  const e = await earning(b);
  check("paid only after the car is back: confirmed straight away", e?.state === "confirmed" && e.basis === 45000 && e.amount === 2250, e);
}
{
  const b = await booking(phone(102), ADA, { status: "active" });
  await counter(b, 200);
  await setStatus(b, "returned");
  await counter(b, 250);
  let e = await earning(b);
  check("half at pickup, half at return: confirmed on the whole $450", e?.state === "confirmed" && e.basis === 45000 && e.amount === 2250, e);

  await setStatus(b, "active");
  e = await earning(b);
  check("a status corrected back to active un-confirms it", e?.state === "pending" && e.basis === 45000, e);
}
{
  const b = await booking(phone(103), ADA, { status: "confirmed" });
  await counter(b, 100);
  await setStatus(b, "cancelled");
  let e = await earning(b);
  check("cancelled: written off, with the reason", e?.state === "cancelled" && e.note === "The rental was cancelled.", e);

  const refused = await counter(b, 50);
  check("no money is taken for a cancelled booking", !refused.ok && /cancelled/.test(refused.ok ? "" : refused.error), refused);

  await setStatus(b, "quote");
  e = await earning(b);
  check("reopened: the commission comes back, without the reason", e?.state === "pending" && e.basis === 10000 && e.note === null, e);

  await setStatus(b, "confirmed");
  await counter(b, 350);
  e = await earning(b);
  check("and grows with the rest of the money", e?.state === "pending" && e.basis === 45000, e);
}
{
  const b = await booking(phone(104), ADA, { status: "returned" });
  await counter(b, 200);
  await pg.exec(`UPDATE partner_earnings SET state = 'paid' WHERE rental_booking_id = '${b}'`);
  await counter(b, 250);
  const e = await earning(b);
  check("a commission already paid out is never rewritten", e?.state === "paid" && e.basis === 20000, e);
}
{
  const b = await booking(phone(105), ADA, { status: "confirmed" });
  await online(b, 45000);
  await online(b, 45000);
  await recordRentalEarning(b, db);
  const e = await earning(b);
  check("paid twice: commission on the rental, not on the refund owed", e?.basis === 45000 && e.amount === 2250, e);
}
{
  const b = await booking(phone(106), ADA, { status: "confirmed", totalMinor: 50000, injuryCoverMinor: 5000 });
  await counter(b, 500);
  const e = await earning(b);
  check("the injury cover is not commissioned", e?.basis === 45000 && e.amount === 2250, e);
}
{
  const b = await booking(phone(107), CY, { status: "confirmed", totalMinor: 30000 });
  await counter(b, 300);
  check("a suspended partner accrues nothing new", (await earning(b)) === null);
}

// ── Taking money at the counter ────────────────────────────────────────────
console.log("\nMoney taken at the counter");
{
  const b = await booking(phone(200), null, {
    status: "quote",
    holdUntil: new Date(Date.now() + 2 * 86_400_000),
  });
  const r = await counter(b, 150);
  const row = await bookingRow(b);
  const paid = await payments(b);
  check("a reservation paid at the counter is confirmed", r.ok && r.confirmed && row.status === "confirmed", { r, row });
  check("and its temporary hold is released", row.payment_hold_until === null, row);
  check("recorded with how it was paid and who took it", paid.length === 1 && paid[0].amount === 15000 && paid[0].method === "cash" && paid[0].by === STAFF, paid);
}
{
  const b = await booking(phone(201), null, { status: "confirmed" });
  const key = randomUUID();
  const first = await takeCounterPayment({ bookingId: b, amountMajor: 450, method: "card", clientKey: key }, anyMarket, db);
  const again = await takeCounterPayment({ bookingId: b, amountMajor: 450, method: "card", clientKey: key }, anyMarket, db);
  check(
    "a retried submit is recognized, even after paying in full",
    first.ok && !first.duplicate && again.ok && again.duplicate && (await payments(b)).length === 1,
    { first, again },
  );
}
{
  const b = await booking(phone(202), null, { status: "confirmed" });
  await counter(b, 400);
  const over = await counter(b, 100);
  check("more than is owed is refused, saying what is owed", !over.ok && /Only \$50(\.00)? is still owed/.test(over.ok ? "" : over.error), over);
  const exact = await counter(b, 50);
  check("exactly what is owed is taken", exact.ok, exact);
  const full = await counter(b, 1);
  check("a booking paid in full takes nothing more", !full.ok && /already paid in full/.test(full.ok ? "" : full.error), full);
}
{
  const b = await booking(phone(203), null, { status: "confirmed" });
  const usOnly: Staff = { id: STAFF, mayTakeFor: (m) => m === "ng" };
  const other = await counter(b, 100, usOnly);
  const missing = await counter("eeee0000-0000-4000-8000-999999999999", 100);
  check(
    "another market's booking and a booking that doesn't exist get the same answer",
    !other.ok && !missing.ok && other.error === missing.error && (await payments(b)).length === 0,
    { other, missing },
  );
}
{
  const from = new Date(Date.UTC(2028, 5, 1));
  const reservation = await booking(phone(204), null, { status: "quote", from });
  await booking(phone(205), null, { status: "confirmed", from });
  const r = await counter(reservation, 100);
  check(
    "dates already confirmed for someone else: nothing recorded, nothing confirmed",
    !r.ok && /Nothing was recorded/.test(r.ok ? "" : r.error) && (await payments(reservation)).length === 0 && (await bookingRow(reservation)).status === "quote",
    r,
  );
}
{
  const b = await booking("+234 803 555 0100", null, { status: "confirmed", market: "ng", totalMinor: 120_000_000 });
  const r = await counter(b, 1_200_000);
  check("a ₦1,200,000 rental is recorded as one payment", r.ok && (await payments(b))[0]?.amount === 120_000_000, r);
}

// ── Who a renter belongs to ────────────────────────────────────────────────
console.log("\nWho a renter belongs to");
const who = (p: string, link: string | null) =>
  referralPartnerForRenter("us", p, { database: db, linkPartner: link });
{
  await booking("+1 (336) 555-0300", ADA, { status: "returned" });
  check("a later week is Ada's, whatever link it came through", (await who("336-555-0300", BEN)) === ADA);
  check("and with no link at all", (await who("3365550300", null)) === ADA);

  await booking("3365550300", BEN, { status: "returned" });
  check("first introduction wins over a later partner", (await who("+13365550300", null)) === ADA);

  check("a new renter goes to the link they followed", (await who("3365550400", BEN)) === BEN);
  check("a new renter with no link belongs to nobody", (await who("3365550401", null)) === null);
}
{
  await booking("3365550500", ADA, { status: "quote" });
  check("a reservation nobody came for claims no one", (await who("3365550500", BEN)) === BEN);
  await booking("3365550501", ADA, { status: "cancelled" });
  check("nor does a cancelled booking", (await who("3365550501", BEN)) === BEN);
  await booking("3365550502", ADA, { status: "confirmed" });
  check("nor a confirmed booking nobody has paid for", (await who("3365550502", BEN)) === BEN);
  const paid = await booking("3365550503", ADA, { status: "confirmed" });
  await online(paid, 45000);
  check("a confirmed booking that was paid for does", (await who("3365550503", BEN)) === ADA);
}
{
  await booking("3365550600", null, { status: "returned" });
  await booking("3365550600", null, { status: "returned" });
  check("someone who first rented with us directly is ours, whatever link", (await who("3365550600", BEN)) === null);
  await booking("3365550600", BEN, { status: "returned" });
  check("and stays ours after a booking that carried a partner", (await who("3365550600", null)) === null);
}
{
  check("a partner's own phone earns nothing through their own link", (await who("+1 336 555 0002", BEN)) === null);
  check("nor their WhatsApp number", (await who("336-555-0022", BEN)) === null);
  await booking("3365550001", ADA, { status: "returned" });
  check("nor their own rental through their history", (await who("3365550001", null)) === null);
}
{
  await booking("3365550700", DEE, { status: "returned" });
  check("a partner still on the old terms: the link decides", (await who("3365550700", BEN)) === BEN);
  check("their own link still works for them", (await who("3365550700", DEE)) === DEE);
  check("and without a link, nobody", (await who("3365550700", null)) === null);
}
{
  await booking("3365550800", CY, { status: "returned" });
  check("a suspended partner's renter is not given to another partner", (await who("3365550800", BEN)) === null);
}

console.log(
  `\n${passed} passed, ${failed} failed.` +
    (failed ? "  \x1b[31mREFERRALS WRONG\x1b[0m\n" : "  \x1b[32mReferrals verified.\x1b[0m\n"),
);
process.exit(failed ? 1 : 0);
