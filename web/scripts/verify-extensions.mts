#!/usr/bin/env node
/**
 * "Keep it another week", checked against the real migrations.
 *
 * Runs the functions the site runs (src/lib/extensions/*) on an in-memory
 * Postgres (PGlite) built from every migration file, so what is tested is
 * the SQL and the constraint themselves:
 *
 *  - an extension is priced by quoteRental, across the join, and never
 *    reprices what was already agreed;
 *  - approving a request the dates no longer allow is refused by
 *    rental_bookings_no_overlap, not by a check in application code;
 *  - approve and decline do what they say and nothing else;
 *  - the private token is the only way in;
 *  - with the switch off, or before migration 0035 is applied, the feature
 *    is simply absent and nothing breaks.
 *
 * Nothing here sends mail: the reminder's mailer is a recorder.
 *
 * Run: npm run test:extensions
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// src/db/index.ts insists on a connection string when imported. Nothing here
// uses that connection: every function under test is handed the PGlite one.
process.env.DATABASE_URL ??= "postgres://unused@localhost:5432/unused";
// The switch is passed to each call explicitly, so the environment can't
// decide a result by accident.
delete process.env.RENTAL_EXTENSIONS_ENABLED;

const { quoteRental } = await import("../src/lib/rental");
const {
  quoteExtension,
  extensionsEnabled,
  extensionWindow,
  addDays,
  MAX_EXTENSION_DAYS,
  MAX_REQUESTS_PER_BOOKING,
} = await import("../src/lib/extensions/pricing");
const {
  extensionViewFor,
  fileExtensionRequest,
  decideExtension,
  pendingExtensions,
  runExtensionReminders,
  notifyExtensionDecision,
} = await import("../src/lib/extensions/store");
const { renderExtensionDecision, extensionDecisionSubject } = await import("../src/lib/mail/extensionDecision");
const { extendCardProps } = await import("../src/lib/extensions/present");
const { renderReservation } = await import("../src/lib/mail/reservation");
const { renderBookingPaid } = await import("../src/lib/mail/bookingPaid");
const { renderExtensionReminder } = await import("../src/lib/mail/extensionReminder");
const schema = await import("../src/db/schema");

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, detail: unknown = "") {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m ${detail === "" ? "" : JSON.stringify(detail)}`);
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "../src/db/migrations");

/** A fresh Postgres with the migrations applied, optionally leaving some out. */
async function database(skip: (file: string) => boolean = () => false) {
  const pg = await PGlite.create({ extensions: { btree_gist } });
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    if (skip(file)) continue;
    const statements = readFileSync(join(migrationsDir, file), "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) await pg.exec(stmt);
  }
  await pg.exec(`
    INSERT INTO markets (code, name, currency, locale, timezone, distance_unit) VALUES
      ('us','United States','USD','en-US','America/New_York','mi'),
      ('ng','Nigeria','NGN','en-NG','Africa/Lagos','km');`);
  return { pg, db: drizzle(pg, { schema }) as never };
}

/* The tariff every car below uses. A month (30 days) undercuts 4 weeks. */
const DAILY = 6000;
const WEEKLY = 35000;
const MONTHLY = 120000;
const TARIFF = {
  dailyMinor: DAILY,
  weeklyMinor: WEEKLY,
  monthlyMinor: MONTHLY,
  depositMinor: 20000,
  currency: "USD" as const,
  minDays: 7,
  maxDays: 60,
  withDriverAvailable: false,
  driverDailyMinor: null,
  injuryCoverDailyMinor: 500,
};

/** A Wednesday afternoon in Greensboro. Every booking is dated from it. */
const NOW = new Date("2027-03-10T19:00:00Z");
const TODAY = "2027-03-10";
const ON = { enabled: true, now: NOW };

let n = 0;
/** One car with the tariff above, and one booking on it. */
async function rental(
  pg: PGlite,
  o: {
    status?: string;
    /** Days from today the rental started (negative) and ends. */
    from?: number;
    to?: number;
    total?: number;
    token?: string | null;
    email?: string | null;
    market?: "us" | "ng";
    vehicleId?: string;
    cover?: boolean;
  } = {},
) {
  n++;
  const market = o.market ?? "us";
  const currency = market === "us" ? "USD" : "NGN";
  const vehicleId = o.vehicleId ?? `aaaaaaaa-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const id = `bbbbbbbb-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const token = o.token === undefined ? `token-for-booking-number-${String(n).padStart(4, "0")}` : o.token;
  const from = addDays(TODAY, o.from ?? -5);
  const to = addDays(TODAY, o.to ?? 2);
  if (!o.vehicleId) {
    await pg.exec(`
      INSERT INTO vehicles (id, market_code, make, model, year, mileage_unit, condition,
          price_minor, currency, status, slug, listing_kind)
        VALUES ('${vehicleId}','${market}','Toyota','Camry',2019,'mi','Used',
          1500000,'${currency}','available','camry-${n}','rental');
      INSERT INTO rental_rates (vehicle_id, daily_minor, weekly_minor, monthly_minor, deposit_minor,
          currency, min_days, max_days, injury_cover_daily_minor)
        VALUES ('${vehicleId}',${DAILY},${WEEKLY},${MONTHLY},20000,'${currency}',7,60,500);`);
  }
  await pg.exec(`
    INSERT INTO rental_bookings
      (id, vehicle_id, market_code, period, customer_name, customer_phone, customer_email, status,
       total_minor, currency, reservation_token, insurance_choice,
       injury_cover_daily_minor, injury_cover_total_minor)
    VALUES
      ('${id}','${vehicleId}','${market}',
       tstzrange('${from}T00:00:00Z','${to}T00:00:00Z','[)'),
       'Test Renter','+13365550100',${o.email === null ? "NULL" : `'${o.email ?? "renter@example.com"}'`},
       '${o.status ?? "active"}',${o.total ?? WEEKLY},'${currency}',
       ${token === null ? "NULL" : `'${token}'`},
       ${o.cover ? "'company'" : "'declined'"}, ${o.cover ? 500 : "NULL"}, ${o.cover ? 3500 : 0});`);
  return { id, vehicleId, token: token ?? "", end: to };
}

type Row = Record<string, unknown>;
async function one(pg: PGlite, sql: string): Promise<Row> {
  return ((await pg.query<Row>(sql)).rows[0] ?? {}) as Row;
}
const bookingOf = (pg: PGlite, id: string) =>
  one(
    pg,
    `SELECT to_char(upper(period) AT TIME ZONE 'UTC','YYYY-MM-DD') AS ends,
            to_char(lower(period) AT TIME ZONE 'UTC','YYYY-MM-DD') AS starts,
            total_minor::int AS total, injury_cover_total_minor::int AS cover, status::text AS status
     FROM rental_bookings WHERE id = '${id}'`,
  );
const requestOf = (pg: PGlite, id: string) =>
  one(pg, `SELECT status, decided_by_email, decided_at IS NOT NULL AS decided FROM rental_extension_requests WHERE id = '${id}'`);
async function loadBooking(db: never, id: string) {
  const { eq } = await import("drizzle-orm");
  const rows = await (db as { select: () => { from: (t: unknown) => { where: (w: unknown) => Promise<unknown[]> } } })
    .select()
    .from(schema.rentalBookings)
    .where(eq(schema.rentalBookings.id, id));
  return rows[0] as typeof schema.rentalBookings.$inferSelect;
}

/* ── 1. The price ───────────────────────────────────────────────────────── */
console.log("\nThe price of more days comes from the tariff functions");
{
  const week = { currentDays: 7, totalMinor: WEEKLY, withDriver: false, injuryCover: false, injuryCoverDailyMinor: null };
  const q = quoteExtension(TARIFF, week, 7);
  const expected = quoteRental({ ...TARIFF, minDays: 1 }, 14).totalMinor - quoteRental({ ...TARIFF, minDays: 1 }, 7).totalMinor;
  check("1 more week costs quoteRental(14 days) minus quoteRental(7 days)", q.addedMinor === expected && expected === WEEKLY, q);
  check("the new total is what was agreed plus the added cost", q.newTotalMinor === WEEKLY * 2, q);
  check("no saving is claimed where there is none", q.savingMinor === 0, q);

  // 3 weeks + 9 days = 30 days: the month (120000) undercuts 3 weeks + 9 days.
  const three = { ...week, currentDays: 21, totalMinor: WEEKLY * 3 };
  const m = quoteExtension(TARIFF, three, 9);
  const month = quoteRental({ ...TARIFF, minDays: 1 }, 30).totalMinor;
  check("the better rate for a longer rental applies across the join", month === MONTHLY && m.addedMinor === MONTHLY - WEEKLY * 3, m);
  const alone = quoteRental({ ...TARIFF, minDays: 1 }, 9).totalMinor;
  check("and the difference is reported as the saving", m.savingMinor === alone - m.addedMinor && m.savingMinor > 0, m);

  // A total staff agreed by hand is kept, not repriced.
  const deal = quoteExtension(TARIFF, { ...week, totalMinor: 30000 }, 7);
  check("a total agreed by hand is kept: only the added days are priced", deal.newTotalMinor === 30000 + WEEKLY, deal);

  // 6 days are already priced as a week, so day 7 is free.
  const six = quoteExtension(TARIFF, { ...week, currentDays: 6 }, 1);
  check("a day the weekly rate already covered adds nothing", six.addedMinor === 0, six);

  const covered = quoteExtension(TARIFF, { ...week, injuryCover: true, injuryCoverDailyMinor: 400, totalMinor: WEEKLY + 2800 }, 7);
  check("injury cover is added per day at the fee they booked at", covered.addedCoverMinor === 2800 && covered.addedMinor === WEEKLY + 2800, covered);

  let longest = "";
  try {
    quoteExtension(TARIFF, { ...week, currentDays: 56 }, 7);
  } catch (e) {
    longest = (e as Error).message;
  }
  check("the tariff's longest rental still applies to the new length", longest.includes("60"), longest);

  let short = 0;
  try {
    short = quoteExtension(TARIFF, week, 2).addedMinor;
  } catch {
    short = -1;
  }
  check("2 more days can be priced although new rentals start at 7", short === quoteRental({ ...TARIFF, minDays: 1 }, 9).totalMinor - WEEKLY, short);

  const w = extensionWindow({ status: "active", endDate: addDays(TODAY, -3), today: TODAY, currentDays: 7, tariffMaxDays: 60, freeDays: null });
  check("an overdue car can only be extended to a date still ahead", w.minDays === 4 && w.maxDays === MAX_EXTENSION_DAYS && w.block === null, w);
  check("a quote can't be extended", extensionWindow({ status: "quote", endDate: TODAY, today: TODAY, currentDays: 7, tariffMaxDays: null, freeDays: null }).block === "status");
}

/* ── 2. The switch ──────────────────────────────────────────────────────── */
console.log("\nThe switch is off unless it is set");
{
  check("unset is off", extensionsEnabled({}) === false);
  check("empty is off", extensionsEnabled({ RENTAL_EXTENSIONS_ENABLED: "" }) === false);
  check("0 and false are off", !extensionsEnabled({ RENTAL_EXTENSIONS_ENABLED: "0" }) && !extensionsEnabled({ RENTAL_EXTENSIONS_ENABLED: "false" }));
  check("1 and true are on", extensionsEnabled({ RENTAL_EXTENSIONS_ENABLED: "1" }) && extensionsEnabled({ RENTAL_EXTENSIONS_ENABLED: " TRUE " }));
  check("this run's environment leaves it off", extensionsEnabled() === false);
}

const { pg, db } = await database();

console.log("\nWith the switch off, the feature is absent");
{
  const r = await rental(pg);
  const b = await loadBooking(db, r.id);
  check("the renter's page gets no card", (await extensionViewFor(b, { database: db, now: NOW })) === null);
  const filed = await fileExtensionRequest({ token: r.token, marketCode: "us", addedDays: 7 }, { database: db, now: NOW });
  check("a request is refused", filed.ok === false && /call us/i.test(filed.error ?? ""), filed);
  const count = await one(pg, `SELECT count(*)::int AS n FROM rental_extension_requests`);
  check("and nothing is written", count.n === 0, count);
  check("the admin lists none", (await pendingExtensions([r.id], { database: db })).size === 0);
  const sends: unknown[] = [];
  const out = await runExtensionReminders("us", async (t) => void sends.push(t), { database: db, now: NOW });
  check("no reminder is sent", sends.length === 0 && out.sent === 0 && Boolean(out.skipped), out);

  const mail = { to: "a@example.com", name: "Test Renter", vehicle: "2019 Toyota Camry", dates: "x", reference: "ABC", amount: "$350", depositDue: null, heldUntil: "Friday", payUrl: "https://example.com/us/rentals/reserved/tok", businessPhone: null, payOnline: false };
  check("the reservation email says nothing about it", !/another week/i.test(renderReservation(mail).html + renderReservation(mail).text));
  const on = renderReservation({ ...mail, canExtend: true });
  check("and with it on, both versions carry the line", /Keep it another week/.test(on.html) && /Keep it another week/.test(on.text));
  const paid = { customerName: "Test Renter", customerEmail: "a@example.com", reference: "ABC", vehicle: "2019 Toyota Camry", startLabel: "a", endLabel: "b", days: 7, amountPaid: "$350", depositDue: null, injuryCoverCharge: null, pickupLocation: null, businessPhone: null, bookingUrl: "https://example.com/us/rentals" };
  check("the paid email says nothing about it without a link", !/another week/i.test(renderBookingPaid(paid).html + renderBookingPaid(paid).text));
  const paidOn = renderBookingPaid({ ...paid, extendUrl: "https://example.com/us/rentals/reserved/tok" });
  check("and carries the link when given one", /reserved\/tok/.test(paidOn.html) && /reserved\/tok/.test(paidOn.text));
}

/* ── 3. What the renter is offered ──────────────────────────────────────── */
console.log("\nWhat the renter's page offers");
{
  const r = await rental(pg);
  const view = await extensionViewFor(await loadBooking(db, r.id), { database: db, ...ON });
  check("an active rental can ask, for 1 to 28 more days", view?.canAsk === true && view.options.length === MAX_EXTENSION_DAYS && view.options[0].addedDays === 1, view?.options.length);
  const week = view?.options.find((o) => o.addedDays === 7);
  check("1 more week is priced by the tariff", week?.addedMinor === WEEKLY && week.newTotalMinor === WEEKLY * 2 && week.newEnd === addDays(r.end, 7), week);
  const props = extendCardProps(view!, { currency: "USD", locale: "en-US" });
  check("and reaches the card as formatted money and dates", props.choices[6].added === "$350" && props.choices[6].newTotal === "$700" && /^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d+$/.test(props.choices[6].newEndLabel), props.choices[6]);

  // Someone else has the car 10 days after this rental ends.
  const busy = await rental(pg);
  await rental(pg, { vehicleId: busy.vehicleId, status: "confirmed", from: 12, to: 19 });
  const limited = await extensionViewFor(await loadBooking(db, busy.id), { database: db, ...ON });
  check("only the days before the next booking are offered", limited?.options.length === 10 && limited.bookedFrom === addDays(busy.end, 10), [limited?.options.length, limited?.bookedFrom]);
  check("so 2 more weeks is not on offer and 1 more week is", !limited?.options.some((o) => o.addedDays === 14) && Boolean(limited?.options.some((o) => o.addedDays === 7)));

  // A held, unpaid reservation by someone else counts too; a lapsed one does not.
  const held = await rental(pg);
  const holder = await rental(pg, { vehicleId: held.vehicleId, status: "quote", from: 5, to: 12 });
  await pg.exec(`UPDATE rental_bookings SET payment_hold_until = '2027-03-11T00:00:00Z' WHERE id = '${holder.id}'`);
  const withHold = await extensionViewFor(await loadBooking(db, held.id), { database: db, ...ON });
  check("a car held for someone else limits the offer", withHold?.options.length === 3, withHold?.options.length);
  await pg.exec(`UPDATE rental_bookings SET payment_hold_until = NULL WHERE id = '${holder.id}'`);
  const noHold = await extensionViewFor(await loadBooking(db, held.id), { database: db, ...ON });
  check("an unheld quote does not", noHold?.options.length === MAX_EXTENSION_DAYS, noHold?.options.length);

  // Back to back: the next renter collects the day this one returns.
  const tight = await rental(pg);
  await rental(pg, { vehicleId: tight.vehicleId, status: "confirmed", from: 2, to: 9 });
  const none = await extensionViewFor(await loadBooking(db, tight.id), { database: db, ...ON });
  check("booked right after: nothing to ask for, and the page says why", none?.canAsk === false && none.block === "booked-next" && none.options.length === 0, none);
  check("with a sentence, not a form", /right after you/.test(extendCardProps(none!, { currency: "USD", locale: "en-US" }).blockText ?? ""));

  const quote = await rental(pg, { status: "quote", from: 3, to: 10 });
  check("an unconfirmed request gets no card", (await extensionViewFor(await loadBooking(db, quote.id), { database: db, ...ON })) === null);
  const done = await rental(pg, { status: "returned", from: -10, to: -3 });
  check("a finished rental gets no card", (await extensionViewFor(await loadBooking(db, done.id), { database: db, ...ON })) === null);
  const upcoming = await rental(pg, { status: "confirmed", from: 3, to: 10 });
  check("a confirmed rental that has not started can ask", (await extensionViewFor(await loadBooking(db, upcoming.id), { database: db, ...ON }))?.canAsk === true);
}

/* ── 4. The token ───────────────────────────────────────────────────────── */
console.log("\nThe private token is the only way in");
{
  const r = await rental(pg);
  const ask = (token: string, marketCode = "us", addedDays = 7) =>
    fileExtensionRequest({ token, marketCode, addedDays }, { database: db, ...ON });
  const before = await one(pg, `SELECT count(*)::int AS n FROM rental_extension_requests`);

  check("a made-up token is refused", (await ask("x".repeat(32))).ok === false);
  check("a short token is refused", (await ask("abc")).ok === false);
  check("a token with odd characters is refused", (await ask(`${r.token}';--`)).ok === false);
  check("the booking id is not a token", (await ask(r.id)).ok === false);
  check("the right token in the wrong market is refused", (await ask(r.token, "ng")).ok === false);
  const noToken = await rental(pg, { token: null });
  check("a booking with no token can't be reached at all", (await ask("")).ok === false && noToken.token === "");
  const quote = await rental(pg, { status: "quote", from: 3, to: 10 });
  check("a valid token on an unconfirmed booking is refused", (await ask(quote.token)).ok === false);
  check("more days than are on offer are refused", (await ask(r.token, "us", 29)).ok === false);
  check("zero or negative days are refused", (await ask(r.token, "us", 0)).ok === false && (await ask(r.token, "us", -7)).ok === false);
  const after = await one(pg, `SELECT count(*)::int AS n FROM rental_extension_requests`);
  check("none of those wrote anything", after.n === before.n, [before, after]);

  const good = await ask(r.token);
  check("the right token files the request", good.ok === true && good.request?.status === "pending" && good.request.addedMinor === WEEKLY, good.request);
  check("priced on the server, whatever the browser showed", good.request?.newTotalMinor === WEEKLY * 2 && good.request.newEnd === addDays(r.end, 7));
  const again = await ask(r.token, "us", 14);
  check("a second request while one is waiting is refused", again.ok === false && /already asked/i.test(again.error ?? ""), again);
  let dup = "";
  try {
    await pg.exec(`INSERT INTO rental_extension_requests (booking_id, market_code, from_end, new_end, added_days, added_minor, new_total_minor, currency)
                   VALUES ('${r.id}','us','2027-03-12','2027-03-19',7,1,2,'USD')`);
  } catch (e) {
    dup = (e as Error).message;
  }
  check("and the database itself allows one open request per booking", dup.includes("rental_extension_requests_one_pending_idx"), dup);

  const view = await extensionViewFor(await loadBooking(db, r.id), { database: db, ...ON });
  check("the page now shows it waiting, with no form", view?.latest?.status === "pending" && view.canAsk === false && view.options.length === 0, view);
  check("the admin lists it against its booking", (await pendingExtensions([r.id], { database: db, enabled: true })).get(r.id)?.addedDays === 7);
  const still = await bookingOf(pg, r.id);
  check("asking changes nothing on the booking: no hold, no charge", still.ends === r.end && still.total === WEEKLY, still);
}

/* ── 5. Approve and decline ─────────────────────────────────────────────── */
console.log("\nStaff approve or decline");
{
  const r = await rental(pg, { cover: true, total: WEEKLY + 3500 });
  const filed = await fileExtensionRequest({ token: r.token, marketCode: "us", addedDays: 14 }, { database: db, ...ON });
  check("a covered renter is quoted cover for the added days", filed.request?.addedMinor === WEEKLY * 2 + 7000, filed.request);
  const done = await decideExtension({ id: filed.request!.id, decision: "approve", staffEmail: "staff@example.com" }, db);
  const b = await bookingOf(pg, r.id);
  check("approving moves the return date and nothing else about the dates", done.ok && b.ends === addDays(r.end, 14) && b.starts === addDays(TODAY, -5) && b.status === "active", [done, b]);
  check("adds the cost to the total", b.total === WEEKLY + 3500 + WEEKLY * 2 + 7000, b);
  check("and the cover to the cover total", b.cover === 3500 + 7000, b);
  const req = await requestOf(pg, filed.request!.id);
  check("the request is marked approved, with who and when", req.status === "approved" && req.decided_by_email === "staff@example.com" && req.decided === true, req);
  const twice = await decideExtension({ id: filed.request!.id, decision: "approve", staffEmail: "staff@example.com" }, db);
  const b2 = await bookingOf(pg, r.id);
  check("approving twice does not extend twice", twice.ok === false && b2.ends === b.ends && b2.total === b.total, [twice, b2]);
  const view = await extensionViewFor(await loadBooking(db, r.id), { database: db, ...ON });
  check("the renter's page shows it approved and can ask again", view?.latest?.status === "approved" && view.canAsk === true, view?.latest);

  const d = await rental(pg);
  const ask = await fileExtensionRequest({ token: d.token, marketCode: "us", addedDays: 7 }, { database: db, ...ON });
  const no = await decideExtension({ id: ask.request!.id, decision: "decline", staffEmail: "staff@example.com" }, db);
  const after = await bookingOf(pg, d.id);
  check("declining leaves the booking exactly as it was", no.ok && after.ends === d.end && after.total === WEEKLY, [no, after]);
  check("and marks the request declined", (await requestOf(pg, ask.request!.id)).status === "declined");
  const declined = await extensionViewFor(await loadBooking(db, d.id), { database: db, ...ON });
  check("the renter's page shows it declined", declined?.latest?.status === "declined");
  check("an unknown request is refused", (await decideExtension({ id: "cccccccc-0000-0000-0000-000000000000", decision: "approve", staffEmail: "s@example.com" }, db)).ok === false);

  // The booking moved after the renter asked.
  const s = await rental(pg);
  const stale = await fileExtensionRequest({ token: s.token, marketCode: "us", addedDays: 7 }, { database: db, ...ON });
  await pg.exec(`UPDATE rental_bookings SET period = tstzrange(lower(period), upper(period) + interval '1 day', '[)') WHERE id = '${s.id}'`);
  const moved = await decideExtension({ id: stale.request!.id, decision: "approve", staffEmail: "staff@example.com" }, db);
  check("a request priced for dates the booking no longer has is not applied", moved.ok === false && (await bookingOf(pg, s.id)).total === WEEKLY && (await requestOf(pg, stale.request!.id)).status === "pending", moved);

  // Returned before staff answered.
  const back = await rental(pg);
  const late = await fileExtensionRequest({ token: back.token, marketCode: "us", addedDays: 7 }, { database: db, ...ON });
  await pg.exec(`UPDATE rental_bookings SET status = 'returned' WHERE id = '${back.id}'`);
  const tooLate = await decideExtension({ id: late.request!.id, decision: "approve", staffEmail: "staff@example.com" }, db);
  check("a car already returned is not extended", tooLate.ok === false && (await bookingOf(pg, back.id)).ends === back.end, tooLate);

  // The link can't be used to pester staff.
  const many = await rental(pg);
  let last = { ok: true } as { ok: boolean; error?: string };
  for (let i = 0; i <= MAX_REQUESTS_PER_BOOKING; i++) {
    last = await fileExtensionRequest({ token: many.token, marketCode: "us", addedDays: 1 }, { database: db, ...ON });
    if (!last.ok) break;
    await pg.exec(`UPDATE rental_extension_requests SET status = 'declined', decided_at = now() WHERE booking_id = '${many.id}' AND status = 'pending'`);
  }
  const total = await one(pg, `SELECT count(*)::int AS n FROM rental_extension_requests WHERE booking_id = '${many.id}'`);
  check(`one booking can file ${MAX_REQUESTS_PER_BOOKING} requests and no more`, last.ok === false && total.n === MAX_REQUESTS_PER_BOOKING, [last, total]);
}

/* ── 6. The clash ───────────────────────────────────────────────────────── */
console.log("\nA clash is refused by the database constraint");
{
  const r = await rental(pg);
  const filed = await fileExtensionRequest({ token: r.token, marketCode: "us", addedDays: 7 }, { database: db, ...ON });
  check("the request is taken while the days are free", filed.ok === true);

  // A request holds nothing, so another renter can still be confirmed.
  let other = "";
  try {
    other = (await rental(pg, { vehicleId: r.vehicleId, status: "confirmed", from: 5, to: 12 })).id;
  } catch (e) {
    other = `refused: ${(e as Error).message}`;
  }
  check("a waiting request does not hold the car against a confirmed booking", other.startsWith("bbbbbbbb"), other);

  const done = await decideExtension({ id: filed.request!.id, decision: "approve", staffEmail: "staff@example.com" }, db);
  check("approving it now is refused, with the reason", done.ok === false && /another booking already covers/i.test(done.error ?? ""), done);
  const b = await bookingOf(pg, r.id);
  check("the booking is untouched: dates and total", b.ends === r.end && b.total === WEEKLY, b);
  check("the request is still waiting, for staff to decline", (await requestOf(pg, filed.request!.id)).status === "pending");

  // Prove it was Postgres that said no: the same UPDATE, by hand.
  let raw = "";
  try {
    await pg.exec(`UPDATE rental_bookings SET period = tstzrange(lower(period), '${addDays(r.end, 7)}T00:00:00Z', '[)') WHERE id = '${r.id}'`);
  } catch (e) {
    raw = (e as Error).message;
  }
  check("the same UPDATE by hand fails on rental_bookings_no_overlap", raw.includes("rental_bookings_no_overlap"), raw);

  // The 3 days before the other booking are still free.
  await decideExtension({ id: filed.request!.id, decision: "decline", staffEmail: "staff@example.com" }, db);
  const shorter = await fileExtensionRequest({ token: r.token, marketCode: "us", addedDays: 3 }, { database: db, ...ON });
  const ok = await decideExtension({ id: shorter.request!.id, decision: "approve", staffEmail: "staff@example.com" }, db);
  check("a shorter stay that ends as the next rental starts is approved", ok.ok === true && (await bookingOf(pg, r.id)).ends === addDays(r.end, 3), ok);
  const asked = await fileExtensionRequest({ token: r.token, marketCode: "us", addedDays: 1 }, { database: db, ...ON });
  check("and after that nothing more can be asked for", asked.ok === false, asked);
}

/* ── 6b. The answer email ───────────────────────────────────────────────── */
console.log("\nThe renter is emailed the answer");
{
  type Notice = Parameters<Parameters<typeof notifyExtensionDecision>[1]>[0];
  const sends: Notice[] = [];
  const record = async (n: Notice) => void sends.push(n);
  const on = { database: db, enabled: true };

  const r = await rental(pg);
  const filed = await fileExtensionRequest({ token: r.token, marketCode: "us", addedDays: 7 }, { database: db, ...ON });
  check("nothing is sent while the request is still waiting", (await notifyExtensionDecision(filed.request!.id, record, on)) === false && sends.length === 0);
  await decideExtension({ id: filed.request!.id, decision: "approve", staffEmail: "staff@example.com" }, db);
  const sent = await notifyExtensionDecision(filed.request!.id, record, on);
  const a = sends[0];
  check("an approval goes to the renter's own address", sent === true && sends.length === 1 && a.to === "renter@example.com" && a.approved === true, a);
  check("with the new return date, the added cost and the new total", a?.returnDate === addDays(r.end, 7) && a.addedMinor === WEEKLY && a.totalMinor === WEEKLY * 2, a);
  check("and their private link", a?.token === r.token);

  const d = await rental(pg);
  const ask = await fileExtensionRequest({ token: d.token, marketCode: "us", addedDays: 7 }, { database: db, ...ON });
  await decideExtension({ id: ask.request!.id, decision: "decline", staffEmail: "staff@example.com" }, db);
  await notifyExtensionDecision(ask.request!.id, record, on);
  const no = sends[1];
  check("a decline carries the unchanged return date and the unchanged total", sends.length === 2 && no.approved === false && no.returnDate === d.end && no.totalMinor === WEEKLY, no);

  const quiet = await rental(pg, { email: null });
  const q = await fileExtensionRequest({ token: quiet.token, marketCode: "us", addedDays: 7 }, { database: db, ...ON });
  await decideExtension({ id: q.request!.id, decision: "approve", staffEmail: "staff@example.com" }, db);
  check("a booking with no email gets none", (await notifyExtensionDecision(q.request!.id, record, on)) === false && sends.length === 2);
  check("with the switch off none is sent", (await notifyExtensionDecision(filed.request!.id, record, { database: db })) === false && sends.length === 2);
  check("an unknown request sends none", (await notifyExtensionDecision("cccccccc-0000-0000-0000-000000000000", record, on)) === false && sends.length === 2);

  // Mail failing must not throw, and must not touch the decision.
  const f = await rental(pg);
  const fr = await fileExtensionRequest({ token: f.token, marketCode: "us", addedDays: 7 }, { database: db, ...ON });
  await decideExtension({ id: fr.request!.id, decision: "approve", staffEmail: "staff@example.com" }, db);
  let threw = false;
  let result = true;
  try {
    result = await notifyExtensionDecision(fr.request!.id, async () => { throw new Error("mail is down"); }, on);
  } catch {
    threw = true;
  }
  check("a mail failure is reported as not sent, never thrown", threw === false && result === false);
  check("and the approval stands", (await requestOf(pg, fr.request!.id)).status === "approved" && (await bookingOf(pg, f.id)).ends === addDays(f.end, 7));

  const base = { to: "a@example.com", name: "Test Renter", vehicle: "2019 Toyota Camry", businessPhone: "(336) 555-0100", url: "https://example.com/us/rentals/reserved/tok" };
  const yes = { ...base, approved: true, returnDay: "Fri, Mar 19", added: "$350", newTotal: "$700" };
  const okMail = renderExtensionDecision(yes);
  for (const [kind, body] of [["text", okMail.text], ["html", okMail.html]] as const) {
    check(`the approval ${kind} has the date, the cost, the total, how to pay and the link`,
      /Fri, Mar 19/.test(body) && /\$350/.test(body) && /\$700/.test(body) && /You pay the added cost with us, not online\./.test(body) && /reserved\/tok/.test(body), body.slice(0, 80));
  }
  check("its subject says approved and until when", /Approved/.test(extensionDecisionSubject(yes)) && /Fri, Mar 19/.test(extensionDecisionSubject(yes)));
  const nope = { ...base, approved: false, returnDay: "Fri, Mar 12", added: null, newTotal: null };
  const noMail = renderExtensionDecision(nope);
  for (const [kind, body] of [["text", noMail.text], ["html", noMail.html]] as const) {
    check(`the decline ${kind} is kind, keeps the return date and says to call`,
      /We are sorry\. We could not extend/.test(body) && /Fri, Mar 12/.test(body) && /has not changed/.test(body) && /Call us at \(336\) 555-0100/.test(body) && !/\$/.test(body), body.slice(0, 80));
  }
  check("a free extension does not ask for money", /There is no added cost\./.test(renderExtensionDecision({ ...yes, added: null }).text) && !/not online/.test(renderExtensionDecision({ ...yes, added: null }).text));
  check("with no private link the email has no button", !/View your booking/.test(renderExtensionDecision({ ...yes, url: null }).html + renderExtensionDecision({ ...yes, url: null }).text));
}

/* ── 7. The reminder ────────────────────────────────────────────────────── */
console.log("\nThe reminder 2 days before return");
{
  // A database of its own, so the bookings above don't count.
  const { pg: p2, db: d2 } = await database();
  const due = await rental(p2, { to: 2 });
  await rental(p2, { to: 3 }); // due later
  await rental(p2, { to: 2, email: null }); // no address
  await rental(p2, { to: 2, token: null }); // no private link
  await rental(p2, { to: 2, status: "confirmed", from: -5 }); // never collected
  const asked = await rental(p2, { to: 2 }); // already asked
  await fileExtensionRequest({ token: asked.token, marketCode: "us", addedDays: 7 }, { database: d2, ...ON });

  const sends: { bookingId: string; to: string; returnDate: string; token: string }[] = [];
  const record = async (t: (typeof sends)[number]) => void sends.push(t);
  const first = await runExtensionReminders("us", record, { database: d2, ...ON });
  check("goes to the one renter it is for", sends.length === 1 && sends[0].bookingId === due.id && sends[0].to === "renter@example.com" && first.sent === 1, [sends, first]);
  check("with their return date and their own link", sends[0]?.returnDate === due.end && sends[0]?.token === due.token);
  const second = await runExtensionReminders("us", record, { database: d2, ...ON });
  check("a second run the same day sends nothing", sends.length === 1 && second.sent === 0, second);
  const ng = await runExtensionReminders("ng", record, { database: d2, ...ON });
  check("the other market's run does not pick it up", sends.length === 1 && ng.due === 0, ng);

  // A mail failure costs that one reminder; it is not retried into a flood.
  const { pg: p3, db: d3 } = await database();
  await rental(p3, { to: 2 });
  const failing = await runExtensionReminders("us", async () => { throw new Error("mail is down"); }, { database: d3, ...ON });
  const retry: unknown[] = [];
  await runExtensionReminders("us", async (t) => void retry.push(t), { database: d3, ...ON });
  check("a failed send is counted as not sent and not repeated", failing.sent === 0 && failing.due === 1 && retry.length === 0, failing);

  const mail = renderExtensionReminder({ to: "a@example.com", name: "Test Renter", vehicle: "2019 Toyota Camry", returnDay: "Friday, March 12", url: "https://example.com/us/rentals/reserved/tok", businessPhone: "(336) 555-0100" });
  check("the email carries the link, the date and why it was sent", /reserved\/tok/.test(mail.text) && /Friday, March 12/.test(mail.text) && /once before each return date/.test(mail.text) && /reserved\/tok/.test(mail.html));
}

/* ── 8. Before the migration ────────────────────────────────────────────── */
console.log("\nBefore migration 0035 is applied");
{
  const { pg: old, db: oldDb } = await database((f) => f.startsWith("0035_"));
  const exists = await one(old, `SELECT to_regclass('rental_extension_requests') IS NULL AS missing`);
  check("the tables are not there", exists.missing === true);
  const r = await rental(old);
  const b = await loadBooking(oldDb, r.id);
  check("bookings still load", b?.id === r.id);
  check("the renter's page gets no card, and no error", (await extensionViewFor(b, { database: oldDb, ...ON })) === null);
  const filed = await fileExtensionRequest({ token: r.token, marketCode: "us", addedDays: 7 }, { database: oldDb, ...ON });
  check("a request is refused politely", filed.ok === false && /call us/i.test(filed.error ?? ""), filed);
  check("the admin lists none, and no error", (await pendingExtensions([r.id], { database: oldDb, enabled: true })).size === 0);
  const out = await runExtensionReminders("us", async () => { throw new Error("must not send"); }, { database: oldDb, ...ON });
  check("the reminder run does nothing, and says why", out.sent === 0 && /0035/.test(out.skipped ?? ""), out);
  const told = await notifyExtensionDecision("cccccccc-0000-0000-0000-000000000000", async () => { throw new Error("must not send"); }, { database: oldDb, enabled: true });
  check("the answer email does nothing, and no error", told === false);
  const decided = await decideExtension({ id: "cccccccc-0000-0000-0000-000000000000", decision: "approve", staffEmail: "s@example.com" }, oldDb);
  check("deciding a request is refused, not thrown", decided.ok === false, decided);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
