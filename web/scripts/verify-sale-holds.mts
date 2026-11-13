#!/usr/bin/env node
/**
 * Holding a car for sale with a refundable deposit.
 *
 * Runs the real code in src/lib/saleHolds against the real migrations in an
 * in-memory Postgres (PGlite), with a stand-in for Stripe: no network, no
 * real key, no message sent. What it proves is what would cost money or
 * trust if it were wrong:
 *
 *  - one hold per car is the database's rule, not only the code's
 *  - only a correctly signed, paid Stripe event makes a hold
 *  - a hold ends on time and the car goes back on sale
 *  - nothing here can refund, and a second payment is never dropped
 *  - with the switch off, or the table not created yet, nothing breaks
 *
 * Run: npm run test:holds-sale
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import Stripe from "stripe";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// src/db/index.ts insists on a connection string when imported. Nothing here
// uses that connection: every function is handed the PGlite one.
process.env.DATABASE_URL = "postgres://unused@localhost:5432/unused";
// Stand-ins. The key is never sent anywhere: signatures are checked locally.
process.env.STRIPE_SECRET_KEY = "sk_test_standin_not_a_real_key";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_standin_not_a_real_secret";
process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
delete process.env.SALE_HOLD_ENABLED;
delete process.env.VERCEL_ENV;

const core = await import("../src/lib/saleHolds/core");
const settings = await import("../src/lib/saleHolds/settings");
const { saleHoldOffer } = await import("../src/lib/saleHolds/offer");
const holdStripeFile = await import("../src/lib/saleHolds/stripe");
const { handleSaleHoldEvent, isSaleHoldEvent } = await import("../src/lib/saleHolds/webhook");
const { verifyStripeWebhook } = await import("../src/lib/payments/stripe");
const actions = await import("../src/lib/actions/saleHolds");
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

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "../src/db/migrations");
const HOLD_MIGRATION = "0034_sale_holds.sql";

/** A fresh database with every migration, or every one but this feature's. */
async function database(withHolds: boolean) {
  const pg = await PGlite.create({ extensions: { btree_gist } });
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    if (!withHolds && file === HOLD_MIGRATION) continue;
    const statements = readFileSync(join(migrationsDir, file), "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) await pg.exec(stmt);
  }
  await pg.exec(`
    INSERT INTO markets (code, name, currency, locale, timezone, distance_unit) VALUES
      ('us','United States','USD','en-US','America/New_York','mi');
    INSERT INTO staff (id, email, role) VALUES
      ('99999999-9999-9999-9999-999999999999','staff@example.test','owner');
  `);
  return { pg, db: drizzle(pg, { schema }) as never };
}

const { pg, db } = await database(true);

/*
 * Every statement the feature sends, to check at the end that each carried a
 * parameter. On the live site a query with none, sent while others are
 * queued on the one pooled connection, stalls every query behind it (see
 * holdsTableReady). The fixtures below use rawQuery so they are not counted.
 */
const rawQuery = pg.query.bind(pg) as typeof pg.query;
const statements: { text: string; params: number }[] = [];
pg.query = ((q: string, params?: unknown[], ...rest: unknown[]) => {
  statements.push({ text: q, params: params?.length ?? 0 });
  return (rawQuery as (...a: unknown[]) => unknown)(q, params, ...rest);
}) as typeof pg.query;

let carCount = 0;
/** A car for sale at $15,000, with its own slug. */
async function car(status = "available", priceMinor: number | null = 1_500_000) {
  carCount++;
  const id = `aaaaaaaa-0000-0000-0000-${String(carCount).padStart(12, "0")}`;
  const slug = `car-${carCount}`;
  await pg.exec(`
    INSERT INTO vehicles (id, market_code, make, model, year, mileage_unit, condition,
        price_minor, currency, status, slug, listing_kind)
      VALUES ('${id}','us','Toyota','Camry',2019,'mi','Used',
        ${priceMinor ?? "NULL"},'USD','${status}','${slug}','sale');`);
  return { id, slug };
}

async function ask(sql: string): Promise<boolean> {
  const r = await rawQuery<{ ok: boolean }>(sql);
  return r.rows[0]?.ok === true;
}
async function one<T>(sql: string): Promise<T | undefined> {
  return (await rawQuery<T>(sql)).rows[0];
}

/** Everything the stand-in Stripe was asked to do. It has no refund at all. */
const stripeCalls: { call: string; ref: string }[] = [];
let sessionCount = 0;
let stripeDown = false;
const standIn: import("../src/lib/saleHolds/core").HoldStripe = {
  async createCheckout(req) {
    if (stripeDown) throw new Error("stand-in Stripe is down");
    const reference = `cs_test_standin_${++sessionCount}`;
    stripeCalls.push({ call: "create", ref: reference });
    return { url: `https://checkout.stripe.test/${reference}?for=${req.holdId}`, reference };
  },
  async retrieve() {
    return null;
  },
  async expire(ref) {
    stripeCalls.push({ call: "expire", ref });
  },
};

/** Staff alerts are captured, never sent. */
const alerts: import("../src/lib/notify").LeadNotification[] = [];
const deps = {
  database: db,
  notify: async (lead: import("../src/lib/notify").LeadNotification) => {
    alerts.push(lead);
  },
  stripe: standIn,
};

const signer = new Stripe(process.env.STRIPE_SECRET_KEY!);
let eventCount = 0;

/** A Stripe event as it arrives: raw text and the signature header. */
function stripeEvent(
  type: string,
  o: { holdId?: string; sessionId: string; paid?: boolean; amount?: number; secret?: string },
) {
  const payload = JSON.stringify({
    id: `evt_test_${++eventCount}`,
    object: "event",
    type,
    livemode: false,
    data: {
      object: {
        id: o.sessionId,
        object: "checkout.session",
        livemode: false,
        payment_status: o.paid === false ? "unpaid" : "paid",
        amount_total: o.amount ?? 20_000,
        currency: "usd",
        payment_intent: `pi_test_${eventCount}`,
        metadata: o.holdId ? { saleHoldId: o.holdId } : { bookingId: "a-rental-booking" },
      },
    },
  });
  const header = signer.webhooks.generateTestHeaderString({
    payload,
    secret: o.secret ?? process.env.STRIPE_WEBHOOK_SECRET!,
  });
  return { payload, header };
}

/** What the webhook route does: verify the signature, then hand it over. */
async function deliver(type: string, o: Parameters<typeof stripeEvent>[1]) {
  const { payload, header } = stripeEvent(type, o);
  const event = verifyStripeWebhook(payload, header);
  return handleSaleHoldEvent(event, deps);
}

async function start(slug: string, phone = "+13365550100") {
  return core.startHoldCheckout(
    { market: "us", slug, name: "Test Buyer", phone, email: null },
    { stripe: standIn, baseUrl: "https://example.test", database: db },
  );
}

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

// ── The switch ──────────────────────────────────────────────────────────────
console.log("\nThe switch is off unless it is set");
{
  const forSale = { status: "available", listingKind: "sale", priceMinor: 1_500_000 };
  check("off by default", settings.saleHoldEnabled() === false);
  check("off: the car page gets no card", saleHoldOffer("us", forSale) === null);

  const c = await car();
  const before = stripeCalls.length;
  const refused = await actions.startSaleHold(
    null,
    form({ marketCode: "us", slug: c.slug, name: "Test Buyer", phone: "+13365550100", terms: "on" }),
  );
  check("off: the action refuses", refused.ok === false && !refused.url);
  check("off: Stripe is never asked", stripeCalls.length === before);
  check(
    "off: nothing is written",
    await ask(`SELECT count(*) = 0 AS ok FROM sale_holds`),
  );
  check("off: the staff preview says no", (await actions.saleHoldStaffPreview()) === false);

  process.env.SALE_HOLD_ENABLED = "yes please";
  check("anything but 1 or true is still off", settings.saleHoldEnabled() === false);
  process.env.SALE_HOLD_ENABLED = "1";
  check("1 turns it on", settings.saleHoldEnabled() === true);

  const offer = saleHoldOffer("us", forSale);
  check("on: the card shows the deposit from the settings", offer?.amount === "$200" && offer.hours === 48);
  check("on: four terms, each with the amount or the hours filled in", offer?.terms.length === 4 && offer.terms[0].includes("$200") && offer.terms[2].includes("48 hours"));
  check("a test key is reported as test mode", offer?.testMode === true && holdStripeFile.stripeKeyMode() === "test");
  check("no card for a car on hold or sold", saleHoldOffer("us", { ...forSale, status: "pending" }) === null && saleHoldOffer("us", { ...forSale, status: "sold" }) === null);
  check("no card for a rental-only car", saleHoldOffer("us", { ...forSale, listingKind: "rental" }) === null);
  check("no card without a price", saleHoldOffer("us", { ...forSale, priceMinor: null }) === null);
  check("no card in Nigeria (no deposit set)", saleHoldOffer("ng", forSale) === null);

  const key = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  check("no card when Stripe has no key", saleHoldOffer("us", forSale) === null);
  process.env.STRIPE_SECRET_KEY = key;
}

// ── The constraint ──────────────────────────────────────────────────────────
console.log("\nOne hold per car is the database's rule");
{
  const c = await car();
  const row = (status: string, extra = "") => `
    INSERT INTO sale_holds (vehicle_id, market_code, status, buyer_name, buyer_phone,
        amount_minor, currency, hold_hours, terms_version, terms_accepted_at
        ${status === "active" ? ", paid_at, deposit_state, held_until" : ""})
      VALUES ('${c.id}','us','${status}','Raw Insert','+13365550111',20000,'USD',48,'t',now()
        ${status === "active" ? ", now(), 'held', now() + interval '48 hours'" : ""}) ${extra};`;

  await pg.exec(row("active"));
  let refusedBy = "";
  try {
    await pg.exec(row("active"));
  } catch (e) {
    refusedBy = (e as Error).message;
  }
  check("a second active hold on the same car is refused", refusedBy.includes("sale_holds_one_active_per_vehicle"), refusedBy);

  await pg.exec(row("checkout"));
  refusedBy = "";
  try {
    await pg.exec(row("checkout"));
  } catch (e) {
    refusedBy = (e as Error).message;
  }
  check("and a second checkout for it", refusedBy.includes("sale_holds_one_checkout_per_vehicle"), refusedBy);

  refusedBy = "";
  try {
    await pg.exec(`UPDATE sale_holds SET status = 'active', held_until = now() + interval '1 hour' WHERE vehicle_id = '${c.id}' AND status = 'checkout'`);
  } catch (e) {
    refusedBy = (e as Error).message;
  }
  check("a hold cannot be active without a payment on record", refusedBy.includes("sale_holds_paid_is_recorded"), refusedBy);

  const other = await car();
  let allowed = true;
  try {
    await pg.exec(row("active").replace(c.id, other.id));
  } catch {
    allowed = false;
  }
  check("a different car can be held at the same time", allowed);
  await pg.exec(`DELETE FROM sale_holds`);
}

// ── Starting a checkout ─────────────────────────────────────────────────────
console.log("\nStarting a checkout holds nothing");
const first = await car();
let firstHold = "";
let firstSession = "";
{
  const r = await start(first.slug);
  check("the buyer is sent to Stripe's page", r.ok === true && r.url.startsWith("https://checkout.stripe.test/"));
  if (r.ok) firstHold = r.holdId;
  const row = await one<{ status: string; provider_ref: string; amount_minor: string; terms_version: string }>(
    `SELECT status, provider_ref, amount_minor, terms_version FROM sale_holds WHERE id = '${firstHold}'`,
  );
  firstSession = row?.provider_ref ?? "";
  check("the request is recorded as a checkout, with Stripe's reference", row?.status === "checkout" && firstSession.startsWith("cs_test_standin_"));
  check("for the amount in the settings", Number(row?.amount_minor) === settings.HOLD_DEPOSIT_MINOR.us);
  check("with the version of the terms agreed to", row?.terms_version === settings.HOLD_TERMS_VERSION);
  check("the car is still for sale", await ask(`SELECT status = 'available' AS ok FROM vehicles WHERE id = '${first.id}'`));
  check("no lead yet, and nobody told", alerts.length === 0 && (await ask(`SELECT count(*) = 0 AS ok FROM leads`)));

  const again = await start(first.slug, "+13365550122");
  check("a second buyer cannot start while the first is paying", again.ok === false && /right now/.test(again.error), again.ok ? "" : again.error);

  const c2 = await car();
  stripeDown = true;
  const down = await start(c2.slug);
  stripeDown = false;
  check("if Stripe cannot open a page, the buyer is told nothing was charged", down.ok === false && /Nothing was charged/.test(down.error));
  check("and the request is not kept", await ask(`SELECT count(*) = 0 AS ok FROM sale_holds WHERE vehicle_id = '${c2.id}'`));

  const sold = await car("sold");
  const no = await start(sold.slug);
  check("a sold car cannot be held", no.ok === false);
  const cheap = await car("available", 15_000);
  check("nor one priced under the deposit", (await start(cheap.slug)).ok === false);
}

// ── The webhook ─────────────────────────────────────────────────────────────
console.log("\nOnly a signed, paid Stripe event makes a hold");
{
  const forged = stripeEvent("checkout.session.completed", {
    holdId: firstHold,
    sessionId: firstSession,
    secret: "whsec_somebody_elses_secret",
  });
  let rejected = false;
  try {
    verifyStripeWebhook(forged.payload, forged.header);
  } catch {
    rejected = true;
  }
  check("an event signed with the wrong secret is rejected", rejected);

  const good = stripeEvent("checkout.session.completed", { holdId: firstHold, sessionId: firstSession });
  rejected = false;
  try {
    verifyStripeWebhook(good.payload.replace("20000", "1"), good.header);
  } catch {
    rejected = true;
  }
  check("and so is one changed after signing", rejected);
  check("neither made a hold", await ask(`SELECT status = 'checkout' AS ok FROM sale_holds WHERE id = '${firstHold}'`));

  const rental = verifyStripeWebhook(...Object.values(stripeEvent("checkout.session.completed", { sessionId: "cs_rental" })) as [string, string]);
  check("a rental's event is left to the rental code", isSaleHoldEvent(rental) === false && (await handleSaleHoldEvent(rental, deps)) === null);

  const unpaid = await deliver("checkout.session.completed", { holdId: firstHold, sessionId: firstSession, paid: false });
  check("a completed checkout that is not paid holds nothing", unpaid?.outcome === "unpaid" && (await ask(`SELECT status = 'checkout' AS ok FROM sale_holds WHERE id = '${firstHold}'`)));

  const wrong = await deliver("checkout.session.completed", { holdId: firstHold, sessionId: "cs_test_someone_elses" });
  check("another checkout's event cannot pay for this hold", wrong?.outcome === "mismatch" && (await ask(`SELECT status = 'checkout' AS ok FROM sale_holds WHERE id = '${firstHold}'`)));

  const paid = await deliver("checkout.session.completed", { holdId: firstHold, sessionId: firstSession });
  check("the signed, paid event makes the hold", paid?.outcome === "activated");
  check(
    "it runs for the hours in the settings",
    await ask(`SELECT status = 'active' AND deposit_state = 'held' AND paid_at IS NOT NULL
                 AND held_until BETWEEN now() + interval '47 hours 59 minutes' AND now() + interval '48 hours 1 minute' AS ok
               FROM sale_holds WHERE id = '${firstHold}'`),
  );
  check("the car shows as sale pending", await ask(`SELECT status = 'pending' AS ok FROM vehicles WHERE id = '${first.id}'`));
  check("Stripe's payment id is kept for the admin's link", await ask(`SELECT payment_ref LIKE 'pi_test_%' AND livemode = false AS ok FROM sale_holds WHERE id = '${firstHold}'`));

  const lead = await one<{ name: string; phone: string; source: string; message: string; vehicle_id: string; type: string }>(
    `SELECT l.name, l.phone, l.source, l.message, l.vehicle_id, l.type FROM leads l
       JOIN sale_holds h ON h.lead_id = l.id WHERE h.id = '${firstHold}'`,
  );
  check("a lead is filed with the buyer's details and the car", lead?.name === "Test Buyer" && lead.phone === "+13365550100" && lead.vehicle_id === first.id && lead.source === "sale_hold");
  check("saying what was paid, until when, and the reference", Boolean(lead?.message.includes("$200") && lead.message.includes(settings.holdReference(firstHold)) && /until \w{3}, \w{3} \d/.test(lead.message)), lead?.message);
  check("staff are told once", alerts.length === 1 && alerts[0].vehicle === "2019 Toyota Camry" && alerts[0].adminUrl === "https://example.test/admin/holds");

  const repeat = await deliver("checkout.session.completed", { holdId: firstHold, sessionId: firstSession });
  check("Stripe sending it again changes nothing", repeat?.outcome === "already" && alerts.length === 1 && (await ask(`SELECT count(*) = 1 AS ok FROM leads`)));

  const blocked = await start(first.slug, "+13365550133");
  check("nobody else can start a checkout for a held car", blocked.ok === false && /already on hold/.test(blocked.error));
}

// ── A checkout that is never paid ───────────────────────────────────────────
console.log("\nA checkout that ends unpaid holds nothing");
{
  const c = await car();
  const r = await start(c.slug);
  const id = r.ok ? r.holdId : "";
  const ref = (await one<{ provider_ref: string }>(`SELECT provider_ref FROM sale_holds WHERE id = '${id}'`))!.provider_ref;
  await deliver("checkout.session.expired", { holdId: id, sessionId: ref, paid: false });
  check("Stripe's expiry removes the request and the buyer's details", await ask(`SELECT count(*) = 0 AS ok FROM sale_holds WHERE id = '${id}'`));
  check("the car was never anything but for sale", await ask(`SELECT status = 'available' AS ok FROM vehicles WHERE id = '${c.id}'`));
  check("and another buyer can start", (await start(c.slug, "+13365550144")).ok === true);

  await deliver("checkout.session.expired", { holdId: firstHold, sessionId: firstSession, paid: false });
  check("an expiry can never remove a paid hold", await ask(`SELECT status = 'active' AS ok FROM sale_holds WHERE id = '${firstHold}'`));

  // Left open with no word from Stripe: the place at the checkout frees itself.
  const c3 = await car();
  const left = await start(c3.slug);
  const leftId = left.ok ? left.holdId : "";
  await pg.exec(`UPDATE sale_holds SET created_at = now() - interval '36 minutes' WHERE id = '${leftId}'`);
  await core.sweepSaleHolds(db);
  check("an abandoned checkout stops blocking the car after its time", await ask(`SELECT status = 'abandoned' AS ok FROM sale_holds WHERE id = '${leftId}'`) && (await start(c3.slug, "+13365550155")).ok === true);
  await pg.exec(`UPDATE sale_holds SET created_at = now() - interval '8 days' WHERE id = '${leftId}'`);
  await core.sweepSaleHolds(db);
  check("and its details are deleted a week later", await ask(`SELECT count(*) = 0 AS ok FROM sale_holds WHERE id = '${leftId}'`));
}

// ── Two payments, one car ───────────────────────────────────────────────────
console.log("\nA second payment for a held car is recorded, never dropped, never refunded here");
{
  // The first buyer's page timed out on our side, then their payment arrived
  // late, after a second buyer had started. Both end up paying.
  const c = await car();
  const a = await start(c.slug, "+13365550166");
  const aId = a.ok ? a.holdId : "";
  const aRef = (await one<{ provider_ref: string }>(`SELECT provider_ref FROM sale_holds WHERE id = '${aId}'`))!.provider_ref;
  await pg.exec(`UPDATE sale_holds SET created_at = now() - interval '36 minutes' WHERE id = '${aId}'`);
  await core.sweepSaleHolds(db);
  const b = await start(c.slug, "+13365550177");
  const bId = b.ok ? b.holdId : "";
  const bRef = (await one<{ provider_ref: string }>(`SELECT provider_ref FROM sale_holds WHERE id = '${bId}'`))!.provider_ref;

  const before = alerts.length;
  const late = await deliver("checkout.session.completed", { holdId: aId, sessionId: aRef });
  check("the late payment still makes its hold", late?.outcome === "activated");
  check("the other buyer's checkout is closed at Stripe before they can pay", stripeCalls.some((s) => s.call === "expire" && s.ref === bRef) && (await ask(`SELECT status = 'abandoned' AS ok FROM sale_holds WHERE id = '${bId}'`)));

  // Stripe could not close it in time, and the second buyer paid too.
  const second = await deliver("checkout.session.completed", { holdId: bId, sessionId: bRef });
  check("a second payment is refused the car by the database", second?.outcome === "conflict");
  check("it is recorded as money to return", await ask(`SELECT status = 'conflict' AND deposit_state = 'held' AND paid_at IS NOT NULL AND held_until IS NULL AS ok FROM sale_holds WHERE id = '${bId}'`));
  check("the first hold is untouched", await ask(`SELECT status = 'active' AS ok FROM sale_holds WHERE id = '${aId}'`) && (await ask(`SELECT count(*) = 1 AS ok FROM sale_holds WHERE vehicle_id = '${c.id}' AND status = 'active'`)));
  check("staff are told to refund it", alerts.length === before + 2 && /Refund the deposit in Stripe/.test(alerts.at(-1)!.message ?? ""));

  const odd = await car();
  const o = await start(odd.slug, "+13365550188");
  const oId = o.ok ? o.holdId : "";
  const oRef = (await one<{ provider_ref: string }>(`SELECT provider_ref FROM sale_holds WHERE id = '${oId}'`))!.provider_ref;
  const mismatch = await deliver("checkout.session.completed", { holdId: oId, sessionId: oRef, amount: 100 });
  check("a payment for the wrong amount holds nothing and goes to staff", mismatch?.outcome === "conflict" && (await ask(`SELECT status = 'available' AS ok FROM vehicles WHERE id = '${odd.id}'`)));

  const gone = await car();
  const g = await start(gone.slug, "+13365550199");
  const gId = g.ok ? g.holdId : "";
  const gRef = (await one<{ provider_ref: string }>(`SELECT provider_ref FROM sale_holds WHERE id = '${gId}'`))!.provider_ref;
  await pg.exec(`UPDATE vehicles SET status = 'sold' WHERE id = '${gone.id}'`);
  const tooLate = await deliver("checkout.session.completed", { holdId: gId, sessionId: gRef });
  check("a payment for a car sold in the meantime holds nothing, and the car stays sold", tooLate?.outcome === "conflict" && (await ask(`SELECT status = 'sold' AS ok FROM vehicles WHERE id = '${gone.id}'`)));

  check("Stripe was only ever asked to open or close a checkout", stripeCalls.every((s) => s.call === "create" || s.call === "expire"));
  check("the code that talks to Stripe has no refund", !("refund" in holdStripeFile.holdStripe) && !/refunds?\s*\.\s*create|\.refunds\b/.test(readFileSync(join(here, "../src/lib/saleHolds/stripe.ts"), "utf8")));
}

// ── Time running out ────────────────────────────────────────────────────────
console.log("\nA hold ends on time");
{
  await pg.exec(`UPDATE sale_holds SET held_until = now() - interval '1 minute' WHERE id = '${firstHold}'`);
  const changed = await core.sweepSaleHolds(db);
  check("the next read ends it", changed === true && (await ask(`SELECT status = 'expired' AND ended_at = held_until AS ok FROM sale_holds WHERE id = '${firstHold}'`)));
  check("the car is for sale again", await ask(`SELECT status = 'available' AS ok FROM vehicles WHERE id = '${first.id}'`));
  check("the deposit is still on record as with us, for staff to refund", await ask(`SELECT deposit_state = 'held' AS ok FROM sale_holds WHERE id = '${firstHold}'`));
  check("a second sweep finds nothing to do", (await core.sweepSaleHolds(db)) === false);
  check("and the car can be held again", (await start(first.slug, "+13365550201")).ok === true);

  // Staff sold the car during the hold: the hold ending must not relist it.
  const c = await car();
  const r = await start(c.slug, "+13365550202");
  const id = r.ok ? r.holdId : "";
  const ref = (await one<{ provider_ref: string }>(`SELECT provider_ref FROM sale_holds WHERE id = '${id}'`))!.provider_ref;
  await deliver("checkout.session.completed", { holdId: id, sessionId: ref });
  await pg.exec(`UPDATE vehicles SET status = 'sold' WHERE id = '${c.id}'`);
  await pg.exec(`UPDATE sale_holds SET held_until = now() - interval '1 minute' WHERE id = '${id}'`);
  await core.sweepSaleHolds(db);
  check("a car staff marked sold stays sold when its hold ends", await ask(`SELECT status = 'sold' AS ok FROM vehicles WHERE id = '${c.id}'`));

  const running = await car();
  const rr = await start(running.slug, "+13365550203");
  const rid = rr.ok ? rr.holdId : "";
  const rref = (await one<{ provider_ref: string }>(`SELECT provider_ref FROM sale_holds WHERE id = '${rid}'`))!.provider_ref;
  await deliver("checkout.session.completed", { holdId: rid, sessionId: rref });
  await core.sweepSaleHolds(db);
  check("a hold with time left is not ended", await ask(`SELECT status = 'active' AS ok FROM sale_holds WHERE id = '${rid}'`));
  check("time left reads in hours, then minutes", settings.timeLeft(new Date(Date.now() + 47.5 * 3_600_000)) === "47 hr left" && settings.timeLeft(new Date(Date.now() + 40.5 * 60_000)) === "40 min left");
  check(
    "the end time is shown on the dealership's clock",
    settings.formatHoldEnd(new Date("2026-11-15T20:42:00Z"), "en-US", "America/New_York") === "Sun, Nov 15, 3:42 PM EST",
    settings.formatHoldEnd(new Date("2026-11-15T20:42:00Z"), "en-US", "America/New_York"),
  );
}

// ── Staff ───────────────────────────────────────────────────────────────────
console.log("\nWhat staff record");
{
  const STAFF = "99999999-9999-9999-9999-999999999999";
  const held = async (phone: string) => {
    const c = await car();
    const r = await start(c.slug, phone);
    const id = r.ok ? r.holdId : "";
    const ref = (await one<{ provider_ref: string }>(`SELECT provider_ref FROM sale_holds WHERE id = '${id}'`))!.provider_ref;
    await deliver("checkout.session.completed", { holdId: id, sessionId: ref });
    return { car: c, id };
  };
  const callsBefore = stripeCalls.filter((s) => s.call !== "create").length;

  const a = await held("+13365550301");
  const released = await core.releaseSaleHold(a.id, STAFF, db);
  check("Release hold ends it and says who did", released.ok && (await ask(`SELECT status = 'released' AND ended_by = '${STAFF}' AND ended_at IS NOT NULL AS ok FROM sale_holds WHERE id = '${a.id}'`)));
  check("the car is for sale again", await ask(`SELECT status = 'available' AS ok FROM vehicles WHERE id = '${a.car.id}'`));
  check("releasing does not touch the deposit record", await ask(`SELECT deposit_state = 'held' AS ok FROM sale_holds WHERE id = '${a.id}'`));
  check("releasing twice is refused", (await core.releaseSaleHold(a.id, STAFF, db)).ok === false);

  const refunded = await core.markSaleHoldDeposit(a.id, "refunded", STAFF, db);
  check("Mark deposit refunded is recorded with who and when", refunded.ok && (await ask(`SELECT deposit_state = 'refunded' AND deposit_marked_by = '${STAFF}' AND deposit_marked_at IS NOT NULL AS ok FROM sale_holds WHERE id = '${a.id}'`)));
  check("it cannot be marked twice", (await core.markSaleHoldDeposit(a.id, "applied", STAFF, db)).ok === false);
  const undone = await core.markSaleHoldDeposit(a.id, "held", STAFF, db);
  check("a wrong tap can be undone", undone.ok && (await ask(`SELECT deposit_state = 'held' AND deposit_marked_at IS NULL AND status = 'released' AS ok FROM sale_holds WHERE id = '${a.id}'`)));

  const b = await held("+13365550302");
  await core.markSaleHoldDeposit(b.id, "applied", STAFF, db);
  check("Applied to sale finishes the hold and keeps the car off the market", await ask(`SELECT h.status = 'completed' AND h.deposit_state = 'applied' AND v.status = 'pending' AS ok FROM sale_holds h JOIN vehicles v ON v.id = h.vehicle_id WHERE h.id = '${b.id}'`));

  const c = await held("+13365550303");
  await core.markSaleHoldDeposit(c.id, "refunded", STAFF, db);
  check("refunding a running hold ends it and relists the car", await ask(`SELECT h.status = 'released' AND v.status = 'available' AS ok FROM sale_holds h JOIN vehicles v ON v.id = h.vehicle_id WHERE h.id = '${c.id}'`));

  check("none of it asked Stripe for anything", stripeCalls.filter((s) => s.call !== "create").length === callsBefore);

  const list = await core.listSaleHolds(["us"], db);
  check("the admin lists paid holds only, with their cars", Boolean(list && list.length > 0 && list.every((r) => r.hold.paidAt && r.car)));
  check("and none for a market the staff member cannot see", ((await core.listSaleHolds(["ng"], db)) ?? []).length === 0);
  const got = await core.getSaleHold(c.id, db);
  check("a hold is found by the id in the buyer's link", got?.hold.id === c.id && got.car?.slug === c.car.slug);
  check("and not by anything that is not an id", (await core.getSaleHold("' or 1=1 --", db)) === null && (await core.getSaleHold("", db)) === null);
}

// ── Before the migration is applied ─────────────────────────────────────────
console.log("\nBefore migration 0034 is applied");
{
  const bare = await database(false);
  await bare.pg.exec(`
    INSERT INTO vehicles (id, market_code, make, model, year, mileage_unit, condition,
        price_minor, currency, status, slug, listing_kind)
      VALUES ('cccccccc-0000-0000-0000-000000000001','us','Honda','Civic',2020,'mi','Used',
        1200000,'USD','available','bare-car','sale');`);
  check("there is no table", await (async () => {
    try {
      await bare.pg.query(`SELECT 1 FROM sale_holds`);
      return false;
    } catch (e) {
      return core.schemaMissing(e);
    }
  })());


  // The pooled connection on the live site must never be sent a query that
  // errors, so no statement may even mention the table before it exists.
  const sent: string[] = [];
  const realQuery = bare.pg.query.bind(bare.pg);
  bare.pg.query = ((q: string, ...rest: unknown[]) => {
    sent.push(q);
    return (realQuery as (...a: unknown[]) => unknown)(q, ...rest);
  }) as typeof bare.pg.query;

  check("asking whether it exists answers no, without an error", (await core.holdsTableReady(bare.db)) === false);
  check("and yes where the migration has run", (await core.holdsTableReady(db)) === true);

  let threw = false;
  let swept: boolean | null = null;
  try {
    swept = await core.sweepSaleHolds(bare.db);
  } catch {
    threw = true;
  }
  check("the sweep the car page runs does nothing and does not fail", !threw && swept === false);
  check("the admin list reads as not set up", (await core.listSaleHolds(["us"], bare.db)) === null);
  check("the return page finds no hold", (await core.getSaleHold("cccccccc-0000-0000-0000-000000000009", bare.db)) === null);

  const before = stripeCalls.length;
  const r = await core.startHoldCheckout(
    { market: "us", slug: "bare-car", name: "Test Buyer", phone: "+13365550400", email: null },
    { stripe: standIn, baseUrl: "https://example.test", database: bare.db },
  );
  check("starting a checkout is refused in plain words", r.ok === false && /not available yet/.test(r.error), r.ok ? "" : r.error);
  check("and Stripe is never asked", stripeCalls.length === before);
  check(
    "no query that names the missing table was ever sent",
    sent.length > 0 && sent.every((q) => !/sale_holds/.test(q) || /to_regclass/.test(q)),
    sent.filter((q) => /sale_holds/.test(q) && !/to_regclass/.test(q))[0],
  );
  check("the car is untouched", await (async () => (await bare.pg.query<{ status: string }>(`SELECT status FROM vehicles`)).rows[0].status === "available")());
  await bare.pg.close();
}

console.log("\nSafe on the shared pooled connection");
{
  const control = /^\s*(begin|commit|rollback|savepoint|release)/i;
  const bare = statements.filter((q) => q.params === 0 && !control.test(q.text));
  check(`all ${statements.length} statements the feature sent carried a parameter`, statements.length > 50 && bare.length === 0, bare[0]?.text);
}

await pg.close();
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
