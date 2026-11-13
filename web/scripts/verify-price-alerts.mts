#!/usr/bin/env node
/**
 * Price-drop alerts, end to end, with nothing leaving the building.
 *
 * Runs the real store and the real after-save hook against the real
 * migrations in an in-memory Postgres (PGlite). Messages go to a capturing
 * transport: this suite never sends an email or a notification, and fails if
 * anything reaches the network.
 *
 * What it proves: who can watch, one row per person per car, an address gets
 * nothing until it confirms, a drop sends once and a rise never, stopping
 * deletes the row, a sold car goes quiet and is cleared after 30 days, the
 * switch really is off when off, and every path behaves when migration 0033
 * has not been applied.
 *
 * Run: npm run test:alerts
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// src/db/index.ts insists on a connection string when imported. Nothing here
// uses that connection: every function is handed the PGlite one.
process.env.DATABASE_URL = "postgres://unused@localhost:5432/unused";
process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
// No keys: if a live transport were ever reached it could not send.
delete process.env.RESEND_API_KEY;
delete process.env.VAPID_PRIVATE_KEY;
delete process.env.PRICE_ALERTS_ENABLED;

// Anything that tries the network fails the suite.
let networkCalls = 0;
globalThis.fetch = (async () => {
  networkCalls++;
  throw new Error("network use in a test");
}) as typeof fetch;

const rules = await import("../src/lib/alerts/rules");
const store = await import("../src/lib/alerts/store");
const deliver = await import("../src/lib/alerts/deliver");
const schema = await import("../src/db/schema");
type AlertTransports = import("../src/lib/alerts/transports").AlertTransports;

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

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "../src/db/migrations");

async function database(opts: { withAlerts: boolean }) {
  const pg = await PGlite.create({ extensions: { btree_gist } });
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => opts.withAlerts || !f.startsWith("0033_"))
    .sort();
  for (const file of files) {
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
        price_minor, currency, status, slug, listing_kind) VALUES
      ('11111111-1111-1111-1111-111111111111','us','Toyota','Camry',2019,'mi','Used',
        1500000,'USD','available','2019-toyota-camry','sale'),
      ('22222222-2222-2222-2222-222222222222','us','Honda','Civic',2018,'mi','Used',
        1200000,'USD','sold','2018-honda-civic','sale'),
      ('33333333-3333-3333-3333-333333333333','us','Kia','Soul',2020,'mi','Used',
        1000000,'USD','available','2020-kia-soul','rental'),
      ('44444444-4444-4444-4444-444444444444','us','Ford','Focus',2017,'mi','Used',
        NULL,'USD','draft','2017-ford-focus','sale'),
      ('55555555-5555-5555-5555-555555555555','us','Nissan','Altima',2016,'mi','Used',
        900000,'USD','available','2016-nissan-altima','both');
  `);
  return { pg, db: drizzle(pg, { schema }) as never };
}

const CAMRY = {
  id: "11111111-1111-1111-1111-111111111111",
  marketCode: "us" as const,
  slug: "2019-toyota-camry",
  year: 2019,
  make: "Toyota",
  model: "Camry",
  trim: null,
};
const ALTIMA_ID = "55555555-5555-5555-5555-555555555555";

/** Everything "sent", kept in memory. */
function capture(pushAnswer: "sent" | "gone" | "failed" = "sent") {
  const pushes: { endpoint: string; title: string; body: string; url: string }[] = [];
  const mails: { to: string; subject: string; html: string; text: string; stopUrl: string }[] = [];
  const transports: AlertTransports = {
    async push(to, payload) {
      pushes.push({ endpoint: to.endpoint, ...payload });
      return pushAnswer;
    },
    async mail(to, mail) {
      mails.push({ to, ...mail });
      return true;
    },
  };
  return { pushes, mails, transports };
}

const browser = (n: number) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/browser-${n}`,
  p256dh: `p256dh-${n}`,
  auth: `auth-${n}`,
});
const TOKEN_A = "a".repeat(32);

/* ── The rules, with no database ─────────────────────────────────────────── */

console.log("\nThe switch");
check("off when unset", rules.priceAlertsEnabled() === false);
process.env.PRICE_ALERTS_ENABLED = "0";
check("off at 0", rules.priceAlertsEnabled() === false);
process.env.PRICE_ALERTS_ENABLED = "yes please";
check("off at anything but 1 or true", rules.priceAlertsEnabled() === false);
process.env.PRICE_ALERTS_ENABLED = "1";
check("on at 1", rules.priceAlertsEnabled() === true);
process.env.PRICE_ALERTS_ENABLED = "TRUE";
check("on at true", rules.priceAlertsEnabled() === true);
delete process.env.PRICE_ALERTS_ENABLED;

console.log("\nWhich cars can be watched");
const car = (status: string, listingKind = "sale", priceMinor: number | null = 1000000) => ({
  status,
  listingKind,
  priceMinor,
});
check("a car for sale", rules.canWatch(car("available")));
check("a car sold and rented both", rules.canWatch(car("available", "both")));
check("a pending sale, which can fall through", rules.canWatch(car("pending")));
check("not a sold car", !rules.canWatch(car("sold")));
check("not a draft or an unlisted car", !rules.canWatch(car("draft")) && !rules.canWatch(car("unlisted")));
check("not a rental-only car", !rules.canWatch(car("available", "rental")));
check("not a car with no price", !rules.canWatch(car("available", "sale", null)));

console.log("\nWhat counts as a drop");
const st = (priceMinor: number | null, status = "available") => ({ status, priceMinor });
check("a lower price", rules.isDropWorthChecking(st(1500000), st(1400000)));
check("not a higher price", !rules.isDropWorthChecking(st(1500000), st(1600000)));
check("not the same price", !rules.isDropWorthChecking(st(1500000), st(1500000)));
check("not a price taken away", !rules.isDropWorthChecking(st(1500000), st(null)));
check("not on a car saved as sold", !rules.isDropWorthChecking(st(1500000), st(1400000, "sold")));
check("not on a draft", !rules.isDropWorthChecking(st(1500000, "draft"), st(1400000, "draft")));
check(
  "a car coming back on sale is checked against what each watcher knew",
  rules.isDropWorthChecking(st(1500000, "pending"), st(1500000)),
);
check("a watcher is owed below the price they saw", rules.owedAlert({ priceMinorAtWatch: 1500000, lastAlertPriceMinor: null }, 1400000));
check("not at the price they saw", !rules.owedAlert({ priceMinorAtWatch: 1500000, lastAlertPriceMinor: null }, 1500000));
check("not at the price they were last told", !rules.owedAlert({ priceMinorAtWatch: 1500000, lastAlertPriceMinor: 1400000 }, 1400000));
check("owed again below the last alert", rules.owedAlert({ priceMinorAtWatch: 1500000, lastAlertPriceMinor: 1400000 }, 1300000));

console.log("\nWhat the message says");
{
  const m = rules.dropMessage(CAMRY, 1500000, 1400000);
  check("car, old price, new price, link", m.name === "2019 Toyota Camry" && m.oldPrice === "$15,000" && m.newPrice === "$14,000" && m.path === "/us/inventory/2019-toyota-camry", JSON.stringify(m));
  const p = rules.dropPush(m, CAMRY.slug);
  check("the notification carries all four", p.body.includes("2019 Toyota Camry") && p.body.includes("$14,000") && p.body.includes("$15,000") && p.url.startsWith("/us/inventory/2019-toyota-camry"));
  check("and lands where Stop price alerts is", p.url.endsWith("#price-alert"));
}

console.log("\nPush endpoints");
check("a real push service is accepted", rules.pushEndpointAllowed("https://fcm.googleapis.com/fcm/send/abc"));
check("any other host is refused", !rules.pushEndpointAllowed("https://evil.example.com/hook"));
check("http is refused", !rules.pushEndpointAllowed("http://fcm.googleapis.com/fcm/send/abc"));
check("a lookalike host is refused", !rules.pushEndpointAllowed("https://googleapis.com.evil.example/x"));

/* ── With the table ──────────────────────────────────────────────────────── */

const { pg, db } = await database({ withAlerts: true });
const n = async (where = "true") =>
  Number((await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM price_alerts WHERE ${where}`)).rows[0].n);
const setCar = (id: string, set: string) => pg.exec(`UPDATE vehicles SET ${set} WHERE id = '${id}'`);

console.log("\nWatching by notification");
{
  const r = await store.watchByPush({ market: "us", slug: CAMRY.slug, ...browser(1) }, db);
  check("a browser can watch a car for sale", r.ok === true);
  check("the price when they asked is the database's", await n("price_minor_at_watch = 1500000 AND channel = 'push' AND confirmed_at IS NOT NULL") === 1);
  await store.watchByPush({ market: "us", slug: CAMRY.slug, ...browser(1) }, db);
  check("asking twice is still one row", await n() === 1);
  check("status says watching", await store.pushStatus({ market: "us", slug: CAMRY.slug, endpoint: browser(1).endpoint }, db) === true);
  check("and not for another browser", await store.pushStatus({ market: "us", slug: CAMRY.slug, endpoint: browser(9).endpoint }, db) === false);

  const sold = await store.watchByPush({ market: "us", slug: "2018-honda-civic", ...browser(1) }, db);
  check("a sold car is refused", !sold.ok && sold.reason === "not-watchable");
  const rental = await store.watchByPush({ market: "us", slug: "2020-kia-soul", ...browser(1) }, db);
  check("a rental-only car is refused", !rental.ok && rental.reason === "not-watchable");
  const draft = await store.watchByPush({ market: "us", slug: "2017-ford-focus", ...browser(1) }, db);
  check("a draft is refused", !draft.ok && draft.reason === "not-watchable");
  const none = await store.watchByPush({ market: "us", slug: "no-such-car", ...browser(1) }, db);
  check("a car that does not exist is refused", !none.ok && none.reason === "not-watchable");
  const wrongMarket = await store.watchByPush({ market: "ng", slug: CAMRY.slug, ...browser(1) }, db);
  check("a car in another market is refused", !wrongMarket.ok);
  check("none of those left a row", await n() === 1);
}

console.log("\nWatching by email");
let confirmToken = "";
let stopToken = "";
{
  const r = await store.watchByEmail({ market: "us", slug: CAMRY.slug, email: "  Pat@Example.com ", browserToken: TOKEN_A }, db);
  check("an address can ask", r.ok === true && r.confirm !== null);
  if (r.ok && r.confirm) {
    confirmToken = r.confirm.confirmToken;
    stopToken = r.confirm.stopToken;
    check("stored lowercase", r.confirm.to === "pat@example.com" && (await n("email = 'pat@example.com'")) === 1);
    check("the asking browser's token stops it", stopToken === TOKEN_A);
    const cap = capture();
    await deliver.sendAlertConfirm(r.confirm, cap.transports);
    const mail = cap.mails[0];
    check("one confirmation email, captured not sent", cap.mails.length === 1 && networkCalls === 0);
    check("it names the car and the price", mail.text.includes("2019 Toyota Camry") && mail.text.includes("$15,000"));
    check("it carries the confirm link", mail.html.includes(`/alerts?confirm=${confirmToken}`));
    check("and a stop link", mail.html.includes(`/alerts?stop=${stopToken}`) && mail.stopUrl.endsWith(stopToken));
  }
  check("not confirmed yet", await n("email IS NOT NULL AND confirmed_at IS NULL") === 1);

  const again = await store.watchByEmail({ market: "us", slug: CAMRY.slug, email: "pat@example.com", browserToken: "b".repeat(32) }, db);
  check("asking again answers the same and sends no second email", again.ok === true && again.confirm === null);
  check("and is still one row, with the first token", await n("email IS NOT NULL") === 1 && await n(`stop_token = '${TOKEN_A}'`) === 1);

  // Unconfirmed: a drop sends this address nothing.
  const cap = capture();
  process.env.PRICE_ALERTS_ENABLED = "1";
  await setCar(CAMRY.id, "price_minor = 1450000");
  const res = await deliver.afterVehicleSaved(CAMRY, st(1500000), st(1450000), db, cap.transports);
  check("an unconfirmed address gets no alert", cap.mails.length === 0);
  check("the browser that asked does", cap.pushes.length === 1 && res.sent === 1);

  const found = await store.findByToken("confirm", confirmToken, db);
  check("the confirm page finds the car by its token", found?.slug === CAMRY.slug && found.confirmed === false);
  check("a made-up token finds nothing", await store.findByToken("confirm", "z".repeat(32), db) === null);
  check("looking does not confirm", await n("email IS NOT NULL AND confirmed_at IS NOT NULL") === 0);
  const confirmed = await store.confirmEmail(confirmToken, db);
  check("the button confirms", confirmed?.slug === CAMRY.slug && await n("email IS NOT NULL AND confirmed_at IS NOT NULL AND confirm_token IS NULL") === 1);
  check("the link works once", await store.confirmEmail(confirmToken, db) === null);
}

console.log("\nWhen the price drops");
{
  // Browser 1 was told at $14,500. The address confirmed after that drop and
  // still knows $15,000.
  const cap = capture();
  await setCar(CAMRY.id, "price_minor = 1400000");
  const res = await deliver.afterVehicleSaved(CAMRY, st(1450000), st(1400000), db, cap.transports);
  check("each watcher gets one message", res.owed === 2 && res.sent === 2 && cap.pushes.length === 1 && cap.mails.length === 1);
  check("the notification: car, old price, new price, link", cap.pushes[0].body === "2019 Toyota Camry: now $14,000, was $14,500" && cap.pushes[0].url === "/us/inventory/2019-toyota-camry#price-alert", JSON.stringify(cap.pushes[0]));
  const mail = cap.mails[0];
  check("the email: car, old price, new price", mail.to === "pat@example.com" && mail.text.includes("2019 Toyota Camry") && mail.text.includes("Was: $15,000") && mail.text.includes("Now: $14,000"), mail.text);
  check("with a link to the car", mail.html.includes("https://example.test/us/inventory/2019-toyota-camry"));
  check("and a way to stop", mail.html.includes(`https://example.test/alerts?stop=${stopToken}`) && mail.text.includes(`/alerts?stop=${stopToken}`));
  check("nothing went to the network", networkCalls === 0);

  const twice = capture();
  const res2 = await deliver.afterVehicleSaved(CAMRY, st(1450000), st(1400000), db, twice.transports);
  check("saving the same drop again sends nothing", res2.owed === 0 && twice.pushes.length + twice.mails.length === 0);

  const rise = capture();
  await deliver.afterVehicleSaved(CAMRY, st(1400000), st(1600000), db, rise.transports);
  check("a rise sends nothing", rise.pushes.length + rise.mails.length === 0);

  const small = capture();
  await deliver.afterVehicleSaved(CAMRY, st(1600000), st(1450000), db, small.transports);
  check("a cut that is still above what they were told sends nothing", small.pushes.length + small.mails.length === 0);

  const next = capture();
  await deliver.afterVehicleSaved(CAMRY, st(1450000), st(1350000), db, next.transports);
  check("the next real drop sends one each again", next.pushes.length === 1 && next.mails.length === 1 && next.mails[0].text.includes("Was: $14,000"));

  // Two saves of the same price at once: each watcher is claimed by one only.
  const [a, b] = await Promise.all([
    store.claimDrop(CAMRY.id, 1300000, db),
    store.claimDrop(CAMRY.id, 1300000, db),
  ]);
  check("two saves racing claim each watcher once", a.length + b.length === 2, `${a.length} + ${b.length}`);
}

console.log("\nWith the switch off");
{
  delete process.env.PRICE_ALERTS_ENABLED;
  const cap = capture();
  const res = await deliver.afterVehicleSaved(CAMRY, st(1300000), st(1000000), db, cap.transports);
  check("a drop sends nothing", res.owed === 0 && cap.pushes.length + cap.mails.length === 0);
  check("and marks nobody as told", await n("last_alert_price_minor = 1000000") === 0);
  process.env.PRICE_ALERTS_ENABLED = "1";
}

console.log("\nFor staff");
{
  await store.watchByPush({ market: "us", slug: CAMRY.slug, ...browser(2) }, db);
  await store.watchByEmail({ market: "us", slug: CAMRY.slug, email: "unconfirmed@example.com" }, db);
  const counts = await store.watcherCounts([CAMRY.id, ALTIMA_ID], db);
  check("the count is confirmed watchers only", counts.get(CAMRY.id) === 3, String(counts.get(CAMRY.id)));
  check("a car nobody watches has no count", counts.get(ALTIMA_ID) === undefined);
}

console.log("\nStopping");
{
  const found = await store.findByToken("stop", stopToken, db);
  check("the stop page finds the car", found?.slug === CAMRY.slug);
  check("looking does not stop", await n("email = 'pat@example.com'") === 1);
  const stopped = await store.stopByToken(stopToken, db);
  check("the button deletes the row, address and all", stopped?.slug === CAMRY.slug && await n("email = 'pat@example.com'") === 0);
  check("a second press finds nothing", await store.stopByToken(stopToken, db) === null);

  await store.stopByPush({ market: "us", slug: CAMRY.slug, endpoint: browser(2).endpoint }, db);
  check("a browser stops from the car page", await n(`push_endpoint = '${browser(2).endpoint}'`) === 0);
  check("status then says not watching", await store.pushStatus({ market: "us", slug: CAMRY.slug, endpoint: browser(2).endpoint }, db) === false);

  const cap = capture();
  await deliver.afterVehicleSaved(CAMRY, st(1300000), st(1250000), db, cap.transports);
  check("after stopping, a drop reaches only who is left", cap.mails.length === 0 && cap.pushes.length === 1 && cap.pushes[0].endpoint === browser(1).endpoint);
}

console.log("\nWhen a notification cannot be delivered");
{
  await store.watchByPush({ market: "us", slug: "2016-nissan-altima", ...browser(1) }, db);
  const gone = capture("gone");
  const res = await deliver.afterVehicleSaved(CAMRY, st(1250000), st(1200000), db, gone.transports);
  check("a browser that is gone is counted", res.gone === 1 && res.sent === 0);
  check("and all its alerts are deleted", await n(`push_endpoint = '${browser(1).endpoint}'`) === 0);

  await store.watchByPush({ market: "us", slug: CAMRY.slug, ...browser(3) }, db);
  const shaky = capture("failed");
  await setCar(CAMRY.id, "price_minor = 1200000");
  await store.watchByPush({ market: "us", slug: CAMRY.slug, ...browser(4) }, db);
  const res2 = await deliver.afterVehicleSaved(CAMRY, st(1200000), st(1100000), db, shaky.transports);
  check("another failure is counted against the row and the row kept", res2.failed === 2 && await n("failure_count = 1") === 2);
  const retry = capture();
  await deliver.afterVehicleSaved(CAMRY, st(1200000), st(1100000), db, retry.transports);
  check("a failed alert is not sent twice", retry.pushes.length === 0);

  const broken: AlertTransports = {
    push: async () => {
      throw new Error("boom https://fcm.googleapis.com/secret");
    },
    mail: async () => {
      throw new Error("boom someone@example.com");
    },
  };
  let threw = false;
  const res3 = await deliver.afterVehicleSaved(CAMRY, st(1100000), st(1050000), db, broken).catch(() => {
    threw = true;
    return null;
  });
  check("a transport that throws never reaches the save", !threw && res3?.failed === 2);
}

console.log("\nWhen the car sells or is unlisted");
{
  await store.watchByEmail({ market: "us", slug: CAMRY.slug, email: "sam@example.com" }, db);
  await pg.exec(`UPDATE price_alerts SET confirmed_at = now(), confirm_token = NULL WHERE email = 'sam@example.com'`);
  const live = await n("vehicle_id = '11111111-1111-1111-1111-111111111111' AND confirmed_at IS NOT NULL");

  await setCar(CAMRY.id, "status = 'sold', sold_at = now()");
  const cap = capture();
  await deliver.afterVehicleSaved(CAMRY, st(1050000), st(900000, "sold"), db, cap.transports);
  check("saved as sold at a lower price: nobody is told", cap.pushes.length + cap.mails.length === 0);
  check("its watchers are marked ended", await n("vehicle_id = '11111111-1111-1111-1111-111111111111' AND ended_at IS NOT NULL AND confirmed_at IS NOT NULL") === live);
  check("and no longer counted for staff", (await store.watcherCounts([CAMRY.id], db)).get(CAMRY.id) === undefined);
  check("status says not watching", await store.pushStatus({ market: "us", slug: CAMRY.slug, endpoint: browser(3).endpoint }, db) === false);
  const late = await store.watchByPush({ market: "us", slug: CAMRY.slug, ...browser(7) }, db);
  check("nobody new can watch it", !late.ok);

  const day = 86_400_000;
  await store.sweepAlerts(db, new Date(Date.now() + 29 * day));
  check("still on file after 29 days", await n("vehicle_id = '11111111-1111-1111-1111-111111111111' AND confirmed_at IS NOT NULL") === live);

  // The sale falls through inside the 30 days.
  await setCar(CAMRY.id, "status = 'available', sold_at = NULL, price_minor = 900000");
  const back = capture();
  await deliver.afterVehicleSaved(CAMRY, st(1050000, "sold"), st(900000), db, back.transports);
  check("back on sale: watching resumes", await n("ended_at IS NOT NULL") === 0);
  check("and the lower price is one message each", back.pushes.length + back.mails.length === live, `${back.pushes.length + back.mails.length} of ${live}`);

  await setCar(CAMRY.id, "status = 'unlisted'");
  await deliver.afterVehicleSaved(CAMRY, st(900000), st(900000, "unlisted"), db, capture().transports);
  check("unlisted: ended the same way", await n("vehicle_id = '11111111-1111-1111-1111-111111111111' AND ended_at IS NULL") === 0);
  await store.sweepAlerts(db, new Date(Date.now() + 31 * day));
  check("cleared after 30 days", await n("vehicle_id = '11111111-1111-1111-1111-111111111111'") === 0);
}

console.log("\nHousekeeping and limits");
{
  await store.watchByEmail({ market: "us", slug: "2016-nissan-altima", email: "never@example.com" }, db);
  await store.sweepAlerts(db, new Date(Date.now() + 6 * 86_400_000));
  check("an unconfirmed address is kept 6 days", await n("email = 'never@example.com'") === 1);
  await store.sweepAlerts(db, new Date(Date.now() + 8 * 86_400_000));
  check("and deleted after 7", await n("email = 'never@example.com'") === 0);

  await pg.exec(`DELETE FROM price_alerts`);
  await store.watchByPush({ market: "us", slug: "2016-nissan-altima", ...browser(5) }, db);
  await pg.exec(`DELETE FROM vehicles WHERE id = '${ALTIMA_ID}'`);
  check("deleting a car deletes its watchers", await n() === 0);

  // The hourly fuse on confirmation emails.
  await pg.exec(`
    INSERT INTO price_alerts (vehicle_id, market_code, channel, email, price_minor_at_watch, stop_token, confirm_token, confirm_sent_at)
    SELECT '11111111-1111-1111-1111-111111111111', 'us', 'email', 'bulk' || g || '@example.com', 1000000,
           'stop-' || g, 'confirm-' || g, now()
    FROM generate_series(1, ${rules.MAX_CONFIRMS_PER_HOUR}) g;
    UPDATE vehicles SET status = 'available' WHERE id = '11111111-1111-1111-1111-111111111111';
  `);
  const fused = await store.watchByEmail({ market: "us", slug: CAMRY.slug, email: "one-more@example.com" }, db);
  check("the hourly fuse refuses one confirmation email too many", !fused.ok && fused.reason === "busy");
  check("and stores nothing for it", await n("email = 'one-more@example.com'") === 0);

  let rejected = false;
  await pg
    .exec(`INSERT INTO price_alerts (vehicle_id, market_code, channel, email, push_endpoint, push_p256dh, push_auth, price_minor_at_watch, stop_token)
           VALUES ('11111111-1111-1111-1111-111111111111','us','email','x@example.com','https://e','k','a',1,'both-ways')`)
    .catch(() => {
      rejected = true;
    });
  check("the database refuses a row with two destinations", rejected);
  rejected = false;
  await pg
    .exec(`INSERT INTO price_alerts (vehicle_id, market_code, channel, email, price_minor_at_watch, stop_token)
           VALUES ('11111111-1111-1111-1111-111111111111','us','email','Mixed@Example.com',1,'mixed-case')`)
    .catch(() => {
      rejected = true;
    });
  check("and an address that is not lowercase", rejected);
}

/* ── Before migration 0033 is applied ────────────────────────────────────── */

console.log("\nWith the table missing (migration 0033 not applied)");
{
  const bare = await database({ withAlerts: false });
  const errors: unknown[][] = [];
  const realError = console.error;
  const realWarn = console.warn;
  const warnings: unknown[][] = [];
  console.error = (...a: unknown[]) => void errors.push(a);
  console.warn = (...a: unknown[]) => void warnings.push(a);

  let threw = false;
  try {
    check("status: cannot be known, so the button offers itself", await store.pushStatus({ market: "us", slug: CAMRY.slug, endpoint: browser(1).endpoint }, bare.db) === null);
    check("staff counts: empty, the admin list still renders", (await store.watcherCounts([CAMRY.id], bare.db)).size === 0);
    const w = await store.watchByPush({ market: "us", slug: CAMRY.slug, ...browser(1) }, bare.db);
    check("watching by notification: refused politely", !w.ok && w.reason === "unavailable");
    const e = await store.watchByEmail({ market: "us", slug: CAMRY.slug, email: "pat@example.com" }, bare.db);
    check("watching by email: refused, so no email goes out", !e.ok && e.reason === "unavailable");
    check("confirm and stop links: not valid", await store.confirmEmail(TOKEN_A, bare.db) === null && await store.stopByToken(TOKEN_A, bare.db) === null && await store.findByToken("stop", TOKEN_A, bare.db) === null);
    check("stopping from the car page: no crash", await store.stopByPush({ market: "us", slug: CAMRY.slug, endpoint: browser(1).endpoint }, bare.db) === false);
    const cap = capture();
    const res = await deliver.afterVehicleSaved(CAMRY, st(1500000), st(1400000), bare.db, cap.transports);
    check("a price drop with the switch on: nothing sent", res.owed === 0 && cap.pushes.length + cap.mails.length === 0);
  } catch (e) {
    threw = true;
    realError(e);
  }
  console.error = realError;
  console.warn = realWarn;
  check("nothing threw", !threw);
  check("it is not logged as an error", errors.length === 0, JSON.stringify(errors));
  check("the after-save hook says once what is wrong", warnings.length === 1 && String(warnings[0][0]).includes("0033"));
}

/* ── What reaches the log ────────────────────────────────────────────────── */

console.log("\nLogs");
{
  const lines: string[] = [];
  const realError = console.error;
  const realLog = console.log;
  console.error = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  console.log = (...a: unknown[]) => void lines.push(a.map(String).join(" "));

  // A database that fails for a reason other than a missing table, with an
  // address in the query.
  const closed = await database({ withAlerts: true });
  await closed.pg.exec(`ALTER TABLE price_alerts ADD CONSTRAINT nope CHECK (email IS NULL OR email NOT LIKE 'log%')`);
  const r = await store.watchByEmail({ market: "us", slug: CAMRY.slug, email: "logme@example.com" }, closed.db);
  await store.watchByPush({ market: "us", slug: CAMRY.slug, ...browser(1) }, closed.db);
  await store.watchByEmail({ market: "us", slug: CAMRY.slug, email: "quiet@example.com" }, closed.db);
  await closed.pg.exec(`UPDATE price_alerts SET confirmed_at = now() WHERE email IS NOT NULL`);
  await deliver.afterVehicleSaved(CAMRY, st(1500000), st(1400000), closed.db, capture("failed").transports);

  console.error = realError;
  console.log = realLog;
  const all = lines.join("\n");
  check("a failed write is refused and logged", !r.ok && lines.some((l) => l.includes("watch by email failed")));
  check("a drop is logged with counts", lines.some((l) => l.includes("price drop on us/2019-toyota-camry")), all);
  check("no address in any log line", !all.includes("@example.com"), all);
  check("no push endpoint in any log line", !all.includes("googleapis"), all);
}

check("the suite never touched the network", networkCalls === 0);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
