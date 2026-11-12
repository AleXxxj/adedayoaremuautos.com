#!/usr/bin/env node
/**
 * "Sell your car": what a request may say, what staff read, and where it goes.
 *
 * First the pure parts: the server's schema (src/lib/sellRequest.ts) against
 * the checks the page runs before each Next (src/components/sellSteps.ts),
 * so the two never disagree; the message staff read, for the US and Nigeria;
 * the email that is needed only for an email reply; and NUL characters,
 * which Postgres can't store.
 *
 * Then the lead helper both forms share (src/lib/leadIntake.ts), against the
 * real migrations in an in-memory Postgres (PGlite), with the staff alert's
 * email and text message captured instead of sent: the row a sell request
 * becomes, the per-phone limit, the bot checks, a failed write, and that the
 * VIN reaches the message staff read but never the alert's subject, its text
 * message, a URL or a log line.
 *
 * Nothing here touches the live database or the network.
 *
 * Run: npm run test:sell
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// src/db/index.ts insists on a connection string when imported. Forced, not
// defaulted: nothing here may ever reach a real database, and every query
// below is handed the in-memory one.
process.env.DATABASE_URL = "postgres://unused@localhost:5432/unused";

let passed = 0;
let failed = 0;

function eq(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
  }
}

function ok(label: string, cond: boolean, detail: unknown = "") {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
}

/** A form as the browser sends it. */
function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

/** Mid-November 2026 in Greensboro: next year's models make the newest year 2027. */
const NOW = new Date("2026-11-12T17:00:00Z");

const VIN = "5TDJZRFH1HS390174";

/** Everything a US owner fills in, with the car found by its VIN. */
const US_FULL: Record<string, string> = {
  marketCode: "us",
  leave_empty: "",
  vin: VIN.toLowerCase(),
  year: "2017",
  make: "Toyota",
  model: "Highlander",
  trim: "XLE",
  mileage: "85,000",
  location: "Greensboro 27407",
  condition: "good",
  accident: "no",
  warningLights: "no",
  title: "clean",
  keys: "2",
  wants: "sell",
  price: "$18,000",
  notes: "New tires in May.",
  name: "Ada Obi",
  phone: "(336) 555-0142",
  email: "",
  replyBy: "sms",
  elapsedMs: "48000",
  landingPath: "/us/sell",
};

/** A Nigerian owner, typing the car in. */
const NG_FULL: Record<string, string> = {
  marketCode: "ng",
  leave_empty: "",
  year: "2012",
  make: "lexus",
  model: "RX 350",
  mileage: "140000",
  location: "Lekki, Lagos",
  condition: "fair",
  accident: "not_sure",
  warningLights: "yes",
  title: "some",
  keys: "1",
  wants: "trade",
  price: "₦6,500,000",
  notes: "Line one\r\n\r\n\r\n\r\nLine two   ",
  name: "Chidi Okafor",
  phone: "0803 123 4567",
  email: "chidi@example.com",
  replyBy: "whatsapp",
  elapsedMs: "61000",
  landingPath: "/ng/sell",
};

async function main() {
  const steps = await import("../src/components/sellSteps");
  const { cleanForm, parseSellRequest, sellLead } = await import("../src/lib/sellRequest");
  const { leadTypeLabel, contactLabel } = await import("../src/lib/leadLabels");

  const parse = (fields: Record<string, string>) => parseSellRequest(cleanForm(form(fields)), NOW);
  /** The server's first message for a field, or null when it accepts it. */
  const serverSays = (fields: Record<string, string>, field: string): string | null => {
    const r = parse(fields);
    return r.ok ? null : (r.fieldErrors[field]?.[0] ?? null);
  };
  const without = (fields: Record<string, string>, ...keys: string[]) =>
    Object.fromEntries(Object.entries(fields).filter(([k]) => !keys.includes(k)));
  /** US_FULL typed in rather than found by VIN. */
  const US_TYPED = without(US_FULL, "vin", "trim");

  // ── 1. A full request is accepted ──────────────────────────────────────
  console.log("\nA full request is accepted");
  {
    const r = parse(US_FULL);
    ok("US, car found by its VIN", r.ok, r.ok ? "" : r.fieldErrors);
    if (r.ok) {
      const v = r.data;
      eq("the VIN is written as VINs are", v.vin, VIN);
      eq("the year is a number", v.year, 2017);
      eq("the miles lose their comma", v.mileage, 85000);
      eq("the price loses its dollar sign and comma", v.price, 18000);
      eq("no email, and none needed for a text", v.email, undefined);
      eq("the reply is by text", v.replyBy, "sms");
      eq("the bot timer is a number", v.elapsedMs, 48000);
    }
    const t = parse(US_TYPED);
    ok("US, car typed in, no VIN", t.ok && t.data.vin === undefined, t.ok ? "" : t.fieldErrors);
    const n = parse(NG_FULL);
    ok("Nigeria, papers and WhatsApp", n.ok, n.ok ? "" : n.fieldErrors);
    if (n.ok) {
      eq("a common make in its usual spelling", n.data.make, "Lexus");
      eq("the price in naira", n.data.price, 6500000);
    }
    const bare = parse(without(US_TYPED, "location", "price", "notes"));
    ok("the optional answers can be left out", bare.ok, bare.ok ? "" : bare.fieldErrors);
    if (bare.ok) eq("no price is no price, not zero", bare.data.price, undefined);
  }

  // ── 2. Bad requests are refused, in plain words ────────────────────────
  console.log("\nBad requests are refused, in plain words");
  {
    const us = steps.sellMessages("us");
    const ng = steps.sellMessages("ng");
    const empty = parse({ marketCode: "us" });
    ok("an empty form is refused", !empty.ok);
    if (!empty.ok) {
      const expected: Record<string, string> = {
        year: us.year, make: us.make, model: us.model, mileage: us.mileage,
        condition: us.condition, accident: us.accident, warningLights: us.warningLights,
        title: us.title, keys: us.keys, wants: us.wants,
        name: us.name, phone: us.phone, replyBy: us.replyBy,
      };
      for (const [field, message] of Object.entries(expected)) {
        eq(`missing ${field}: "${message}"`, empty.fieldErrors[field]?.[0], message);
      }
      for (const optional of ["vin", "trim", "location", "price", "notes", "email"]) {
        ok(`${optional} is optional`, !empty.fieldErrors[optional]);
      }
      ok("no message is a library default", !Object.values(empty.fieldErrors).flat().some((m) => /Invalid|expected/.test(m)));
    }

    eq("an unknown market", (parse({ ...US_FULL, marketCode: "uk" }) as { fieldErrors?: Record<string, string[]> }).fieldErrors?.marketCode?.[0], us.reload);
    eq("a 1985 car", serverSays({ ...US_TYPED, year: "1985" }, "year"), us.yearOld);
    eq("a year after next year's models", serverSays({ ...US_TYPED, year: "2028" }, "year"), us.year);
    eq("next year's models are fine", serverSays({ ...US_TYPED, year: "2027" }, "year"), null);
    eq("1990 is fine", serverSays({ ...US_TYPED, year: "1990" }, "year"), null);
    eq("a year that isn't one", serverSays({ ...US_TYPED, year: "20x7" }, "year"), us.year);
    eq("miles as words", serverSays({ ...US_TYPED, mileage: "85k" }, "mileage"), us.mileageBad);
    eq("negative miles", serverSays({ ...US_TYPED, mileage: "-5" }, "mileage"), us.mileageBad);
    eq("1,000,000 miles is the most", serverSays({ ...US_TYPED, mileage: "1,000,000" }, "mileage"), null);
    eq("more than 1,000,000 miles", serverSays({ ...US_TYPED, mileage: "1000001" }, "mileage"), us.mileageHigh);
    eq("0 miles is fine", serverSays({ ...US_TYPED, mileage: "0" }, "mileage"), null);
    eq("km in Nigeria", serverSays(without(NG_FULL, "mileage"), "mileage"), ng.mileage);
    ok("…which says km", ng.mileage.includes("km") && !ng.mileage.includes("miles"));
    eq("a negative price", serverSays({ ...US_TYPED, price: "-18000" }, "price"), us.price);
    eq("a price in words", serverSays({ ...US_TYPED, price: "eighteen" }, "price"), us.price);
    eq("a price of 0 is allowed", serverSays({ ...US_TYPED, price: "0" }, "price"), null);
    eq("a price with cents of .00", serverSays({ ...US_TYPED, price: "18000.00" }, "price"), null);
    eq("a price far too high", serverSays({ ...US_TYPED, price: "99999999999" }, "price"), us.priceHigh);
    eq("a condition that isn't offered", serverSays({ ...US_TYPED, condition: "great" }, "condition"), us.condition);
    eq("a US title answer in Nigeria", serverSays({ ...NG_FULL, title: "clean" }, "title"), ng.title);
    eq("a Nigerian papers answer in the US", serverSays({ ...US_TYPED, title: "all" }, "title"), us.title);
    eq("Text in Nigeria", serverSays({ ...NG_FULL, replyBy: "sms" }, "replyBy"), ng.replyBy);
    eq("WhatsApp in the US", serverSays({ ...US_TYPED, replyBy: "whatsapp" }, "replyBy"), us.replyBy);
    eq("keys must be 1 or 2 or more", serverSays({ ...US_TYPED, keys: "3" }, "keys"), us.keys);
    eq("a VIN that is too short", serverSays({ ...US_FULL, vin: "5TDJZRFH1" }, "vin"), "A VIN has 17 characters. This one has 9.");
    ok("a VIN with an O in it", /never use the letters I, O or Q/.test(serverSays({ ...US_FULL, vin: "5TDJZRFH1HS39O174" }, "vin") ?? ""));
    eq("a one-letter name", serverSays({ ...US_TYPED, name: "A" }, "name"), us.name);
    eq("a name of spaces", serverSays({ ...US_TYPED, name: "   " }, "name"), us.name);
    eq("a phone number without its area code", serverSays({ ...US_TYPED, phone: "555-0142" }, "phone"), us.phoneShort);
    eq("a Nigerian number in full", serverSays(NG_FULL, "phone"), null);
    eq("notes over 2,000 characters", serverSays({ ...US_TYPED, notes: "x".repeat(2001) }, "notes"), us.notes);
    eq("a make that is too long", serverSays({ ...US_TYPED, make: "x".repeat(41) }, "make"), us.makeLong);
  }

  // ── 3. Email only for an email reply ───────────────────────────────────
  console.log("\nEmail is needed only for an email reply");
  {
    const us = steps.sellMessages("us");
    const ng = steps.sellMessages("ng");
    eq("reply by email, no email", serverSays({ ...US_TYPED, replyBy: "email", email: "" }, "email"), us.emailNeeded);
    eq("…in Nigeria it offers WhatsApp", serverSays({ ...NG_FULL, replyBy: "email", email: "" }, "email"), ng.emailNeeded);
    ok("…US offers Call or Text", us.emailNeeded.includes("Call or Text"));
    ok("…Nigeria offers Call or WhatsApp", ng.emailNeeded.includes("Call or WhatsApp"));
    eq("reply by email with one", serverSays({ ...US_TYPED, replyBy: "email", email: "ada@example.com" }, "email"), null);
    eq("reply by email, a bad one", serverSays({ ...US_TYPED, replyBy: "email", email: "ada@example" }, "email"), us.email);
    eq("reply by call, no email", serverSays({ ...US_TYPED, replyBy: "phone", email: "" }, "email"), null);
    eq("reply by text, no email", serverSays({ ...US_TYPED, replyBy: "sms", email: "" }, "email"), null);
    eq("reply by text, a bad email is still refused", serverSays({ ...US_TYPED, replyBy: "sms", email: "nope" }, "email"), us.email);
    eq("reply by WhatsApp, no email", serverSays({ ...NG_FULL, replyBy: "whatsapp", email: "" }, "email"), null);
  }

  // ── 4. NUL characters ──────────────────────────────────────────────────
  console.log("\nNUL characters are removed before anything else");
  {
    const raw = cleanForm(form({ ...US_FULL, name: "Ada\u0000 Obi", notes: "Fine\u0000.", location: "\u0000" }));
    eq("from a name", raw.name, "Ada Obi");
    eq("from the notes", raw.notes, "Fine.");
    ok("a field of nothing but NULs is left out", !("location" in raw));
    ok("nothing sent keeps one", !Object.values(raw).some((v) => v.includes("\u0000")));
    const r = parseSellRequest(raw, NOW);
    ok("and the request is accepted", r.ok, r.ok ? "" : r.fieldErrors);
    eq("stripNul on its own", steps.stripNul("a\u0000b\u0000"), "ab");
    const withFile = form(US_FULL);
    withFile.append("photo", new Blob(["x"]), "x.jpg");
    ok("a file nobody asked for is dropped", !("photo" in cleanForm(withFile)));
  }

  // ── 5. What staff read ─────────────────────────────────────────────────
  console.log("\nWhat staff read, one fact per line");
  {
    const id = "4f2a9c1e-7b3d-4e5f-8a9b-0c1d2e3f4a5b";
    eq("the reference", steps.sellReference(id), "S-4F2A");
    const us = parse(US_FULL);
    const ng = parse(NG_FULL);
    if (!us.ok || !ng.ok) throw new Error("the full requests should parse");
    const usLead = sellLead(us.data, id);
    eq(
      "the US message",
      usLead.message,
      [
        "Sell request · Ref S-4F2A",
        "Car: 2017 Toyota Highlander XLE",
        `VIN: ${VIN}`,
        "Mileage: 85,000 miles",
        "Condition: Good · Accident: No · Warning lights: No · Keys: 2 or more",
        "Title: Clean title in my name",
        "Wants to: Sell it to us · Price in mind: $18,000",
        "Car is in: Greensboro 27407",
        "Reply by: Text",
        "Notes: New tires in May.",
      ].join("\n"),
    );
    const ngLead = sellLead(ng.data, "0b1c2d3e-0000-4000-8000-000000000000");
    eq(
      "the Nigerian message",
      ngLead.message,
      [
        "Sell request · Ref S-0B1C",
        "Car: 2012 Lexus RX 350",
        "Mileage: 140,000 km",
        "Condition: Fair · Accident: Not sure · Warning lights: Yes · Keys: 1",
        "Papers: Some papers",
        "Wants to: Trade it in for one of your cars · Price in mind: ₦6,500,000",
        "Car is in: Lekki, Lagos",
        "Reply by: WhatsApp",
        "Notes: Line one\n\nLine two",
      ].join("\n"),
    );
    const bare = parse(without(US_TYPED, "location", "price", "notes"));
    if (!bare.ok) throw new Error("the bare request should parse");
    const bareMessage = sellLead(bare.data, id).message ?? "";
    ok("no VIN, place, price or notes line when none was given", !/^(VIN|Car is in|Notes):|Price in mind/m.test(bareMessage), bareMessage);
    eq("the lead is a trade_in", usLead.type, "trade_in");
    eq("from the sell page", usLead.source, steps.SELL_SOURCE);
    eq("the alert names the car", usLead.vehicleLabel, "2017 Toyota Highlander XLE");
    ok("…and never its VIN", !usLead.vehicleLabel?.includes(VIN));
    eq("the reply as stored", usLead.preferredContact, "sms");
    eq("the inbox finds the car's name again", steps.carFromSellMessage(usLead.message), "2017 Toyota Highlander XLE");
    eq("…and nothing in a message without one", steps.carFromSellMessage("Hello"), null);

    // Nothing typed can pose as a line of its own.
    const forged = parse({ ...US_TYPED, location: "Greensboro\nVIN: 1HGCM82633A004352", model: "Camry\nTitle: Clean" });
    if (!forged.ok) throw new Error("the forged request should parse");
    const forgedMessage = sellLead(forged.data, id).message ?? "";
    ok("a typed newline can't start a VIN line", !/^VIN:/m.test(forgedMessage), forgedMessage);
    ok("…or a title line", forgedMessage.match(/^Title:/gm)?.length === 1, forgedMessage);
    eq("the model stays on its line", forged.data.model, "Camry Title: Clean");
  }

  // ── 6. The page and the server say the same thing ──────────────────────
  console.log("\nThe page's checks and the server's agree");
  {
    const snapshot = (fields: Record<string, string>, mode: "manual" | "found"): import("../src/components/sellSteps").Snapshot => ({
      market: fields.marketCode as "us" | "ng",
      maxYear: steps.maxModelYear(fields.marketCode as "us" | "ng", NOW),
      mode,
      vinText: "",
      year: fields.year ?? "", make: fields.make ?? "", model: fields.model ?? "",
      mileage: fields.mileage ?? "", location: fields.location ?? "",
      condition: fields.condition ?? "", accident: fields.accident ?? "", warningLights: fields.warningLights ?? "",
      title: fields.title ?? "", keys: fields.keys ?? "", wants: fields.wants ?? "",
      price: fields.price ?? "", notes: fields.notes ?? "",
      name: fields.name ?? "", phone: fields.phone ?? "", email: fields.email ?? "", replyBy: fields.replyBy ?? "",
    });
    for (const [base, label] of [[US_TYPED, "US"], [NG_FULL, "Nigeria"]] as const) {
      for (const k of [1, 2, 3, 4] as const) {
        eq(`${label}: step ${k} passes the page`, steps.stepProblem(k, snapshot(base, "manual")), null);
      }
      const cases: [string, Record<string, string>][] = [
        ["year", { year: "" }], ["year", { year: "1989" }], ["make", { make: " " }], ["model", { model: "" }],
        ["mileage", { mileage: "" }], ["mileage", { mileage: "lots" }], ["mileage", { mileage: "2,000,000" }],
        ["location", { location: "x".repeat(81) }],
        ["condition", { condition: "" }], ["accident", { accident: "" }], ["warningLights", { warningLights: "" }],
        ["title", { title: "" }], ["keys", { keys: "" }],
        ["wants", { wants: "" }], ["price", { price: "18k" }], ["price", { price: "99999999999" }],
        ["name", { name: "A" }], ["phone", { phone: "" }], ["phone", { phone: "12345" }],
        ["email", { replyBy: "email", email: "" }], ["email", { email: "a@b" }], ["replyBy", { replyBy: "fax" }],
      ];
      for (const [field, change] of cases) {
        const fields = { ...base, ...change };
        const page = steps.stepProblem(steps.FIELD_STEP[field], snapshot(fields, "manual"));
        const server = serverSays(fields, field);
        ok(
          `${label}: ${field} ${JSON.stringify(Object.values(change)[0]).slice(0, 14)} → same message`,
          page?.field === field && page.message === server && server !== null,
          { page, server },
        );
      }
    }
    // A car found by its VIN: no year box, so its year's problem shows beside the car.
    const old = steps.stepProblem(1, snapshot({ ...US_TYPED, year: "1985" }, "found"));
    eq("an old car found by VIN is flagged beside the car", old?.field, "found");
    const vinMode = steps.stepProblem(1, { ...snapshot(US_TYPED, "manual"), mode: "vin", vinText: "" });
    eq("Next before the VIN is looked up", vinMode?.message, steps.sellMessages("us").vinMissing);
    const confirming = steps.stepProblem(1, { ...snapshot(US_TYPED, "manual"), mode: "confirm" });
    eq("Next before saying whether it's the car", confirming?.message, steps.sellMessages("us").confirm);
    eq("a server error goes to its earliest step", JSON.stringify(steps.routeForResult({ phone: ["x"], mileage: ["y"] })), JSON.stringify({ step: 1, field: "mileage" }));
    eq("a field with no step goes nowhere", steps.routeForResult({ marketCode: ["x"] }), null);
    ok("every field the schema checks has a step", ["vin", "year", "make", "model", "trim", "mileage", "location", "condition", "accident", "warningLights", "title", "keys", "wants", "price", "notes", "name", "phone", "email", "replyBy"].every((f) => f in steps.FIELD_STEP));
  }

  // ── 7. Small things on the page ────────────────────────────────────────
  console.log("\nSmall things on the page");
  {
    eq("the years run from next year's models", steps.yearOptions(2027)[0], 2027);
    eq("…down to 1990", steps.yearOptions(2027).at(-1), 1990);
    eq("the newest year, mid-November", steps.maxModelYear("us", NOW), 2027);
    eq("NHTSA's capitals as people write them", steps.decodedMake("MERCEDES-BENZ"), "Mercedes-Benz");
    eq("…and BMW stays BMW", steps.decodedMake("BMW"), "BMW");
    eq("a model's note is dropped", steps.cleanModel("RAV4 Prime (PHEV)"), "RAV4 Prime");
    eq("a trim already in the model isn't said twice", steps.carName({ year: 2015, make: "Toyota", model: "Camry LE", trim: "LE" }), "2015 Toyota Camry LE");
    // The business makes an offer only for a car it wants to buy, so nothing
    // here may promise every owner a reply or an offer.
    eq("the confirmation follows the reply chosen", steps.replyPromise("sms"), "If it's a car we want to buy, we'll text you within one business day.");
    eq("…a call by default", steps.replyPromise("phone"), "If it's a car we want to buy, we'll call you within one business day.");
    eq("…WhatsApp in Nigeria", steps.replyPromise("whatsapp"), "If it's a car we want to buy, we'll message you on WhatsApp within one business day.");
    eq("…or an email", steps.replyPromise("email"), "If it's a car we want to buy, we'll email you within one business day.");
    eq("the photos line, for a call", steps.photosLine("phone"), "No photos needed now. If we want your car, we'll ask for a few when we call.");
    eq("…and for WhatsApp", steps.photosLine("whatsapp"), "No photos needed now. If we want your car, we'll ask for a few on WhatsApp.");
    ok(
      "no reply or photos line promises an offer or a reply to everyone",
      ["phone", "sms", "whatsapp", "email"].every(
        (by) => steps.replyPromise(by).startsWith("If it's a car we want to buy, ") && steps.photosLine(by).includes("If we want your car, "),
      ),
    );
    ok(
      "no choice on the form promises one either",
      [...steps.TITLE_US, ...steps.PAPERS_NG, ...steps.WANTS].every((c) => !/we make you an offer for it|when we call/i.test(c.help ?? "")),
    );
    eq("staff read trade_in as a sell request", leadTypeLabel("trade_in"), "Sell / trade-in");
    eq("…and every other type as before", leadTypeLabel("rent_to_own"), "Rent to own");
    eq("a text reply reads as text", contactLabel("sms"), "text");
    eq("…and WhatsApp as before", contactLabel("whatsapp"), "whatsapp");
  }

  // ── 8. Into the inbox (PGlite) ─────────────────────────────────────────
  console.log("\nInto the inbox: the shared lead helper against the real migrations");
  {
    const { PGlite } = await import("@electric-sql/pglite");
    const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
    const { drizzle } = await import("drizzle-orm/pglite");
    const schema = await import("../src/db/schema");
    const { intakeLead, whatFailed, RATE_LIMIT } = await import("../src/lib/leadIntake");
    const { notifyStaffOfLead } = await import("../src/lib/notify");

    const pg = await PGlite.create({ extensions: { btree_gist } });
    const migrationsDir = join(__dirname, "../src/db/migrations");
    for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
      for (const stmt of readFileSync(join(migrationsDir, file), "utf8")
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean)) {
        await pg.exec(stmt);
      }
    }
    await pg.exec(`
      INSERT INTO markets (code, name, currency, locale, timezone, distance_unit) VALUES
        ('us','United States','USD','en-US','America/New_York','mi'),
        ('ng','Nigeria','NGN','en-NG','Africa/Lagos','km')
      ON CONFLICT DO NOTHING;`);
    const db = drizzle(pg, { schema }) as never;

    // The alert is sent for real by notifyStaffOfLead — to a stand-in for
    // the network, which keeps what it was given.
    const sentOut: { url: string; body: string }[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      sentOut.push({ url: String(url), body: String(init?.body ?? "") });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    Object.assign(process.env, {
      RESEND_API_KEY: "re_test_not_a_real_key",
      LEAD_ALERT_EMAIL: "staff@example.com",
      TWILIO_ACCOUNT_SID: "AC_test_not_real",
      TWILIO_AUTH_TOKEN: "test",
      TWILIO_FROM_NUMBER: "+15550000000",
      LEAD_ALERT_SMS_TO: "+15550000001",
      NEXT_PUBLIC_SITE_URL: "https://www.example.com",
    });

    // What the helper writes to the log, kept rather than printed.
    const logged: string[] = [];
    const quietly = async <T>(fn: () => Promise<T>): Promise<T> => {
      const { log, error } = console;
      console.log = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
      console.error = (...a: unknown[]) =>
        void logged.push(a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(" "));
      try {
        return await fn();
      } finally {
        console.log = log;
        console.error = error;
      }
    };

    const request = new Headers({
      "x-vercel-ip-country": "US",
      referer: "https://www.example.com/us/sell",
    });
    const test = { database: db, headers: request, referralPartnerId: null, notify: notifyStaffOfLead };

    const parsed = parse(US_FULL);
    if (!parsed.ok) throw new Error("the full request should parse");
    const v = parsed.data;
    const raw = cleanForm(form(US_FULL));
    const id = "4f2a9c1e-7b3d-4e5f-8a9b-0c1d2e3f4a5b";
    const intake = (over: Partial<Parameters<typeof intakeLead>[0]> = {}, draft = sellLead(v, id)) =>
      quietly(() =>
        intakeLead(
          { marketCode: v.marketCode, phone: v.phone, leaveEmpty: v.leave_empty, elapsedMs: v.elapsedMs, raw, ...over },
          async () => draft,
          test,
        ),
      );
    const leadCount = async () =>
      Number((await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM leads`)).rows[0].n);

    // A bot is answered as if it worked, and nothing is saved or sent.
    eq("the hidden field filled in: a bot", (await intake({ leaveEmpty: "http://spam" })).status, "bot");
    eq("sent in under 1.5 seconds: a bot", (await intake({ elapsedMs: 900 })).status, "bot");
    eq("…nothing saved", await leadCount(), 0);
    eq("…nothing sent", sentOut.length, 0);

    // A real request.
    const saved = await intake();
    eq("a sell request is saved", saved.status, "saved");
    eq("…under the id its reference came from", saved.status === "saved" ? saved.leadId : null, id);
    const [row] = (
      await pg.query<Record<string, unknown>>(
        `SELECT type, status, source, market_code, name, phone, email, preferred_contact, message,
                vehicle_id, rental_tier_id, referral_partner_id, ip_country, referrer_url, landing_path
           FROM leads WHERE id = $1`,
        [id],
      )
    ).rows;
    eq("type trade_in", row?.type, "trade_in");
    eq("status new", row?.status, "new");
    eq("source website-sell", row?.source, "website-sell");
    eq("market us", row?.market_code, "us");
    eq("the name", row?.name, "Ada Obi");
    eq("the phone as typed", row?.phone, "(336) 555-0142");
    eq("no email", row?.email, null);
    eq("reply by text", row?.preferred_contact, "sms");
    eq("the message staff read", row?.message, sellLead(v, id).message);
    eq("no vehicle of ours", row?.vehicle_id, null);
    eq("no partner", row?.referral_partner_id, null);
    eq("the country it came from", row?.ip_country, "US");
    eq("the page it came from", row?.landing_path, "/us/sell");

    // The alert.
    const email = sentOut.find((s) => s.url.includes("resend.com"));
    const text = sentOut.find((s) => s.url.includes("twilio.com"));
    ok("an email and a text message went out", Boolean(email && text), sentOut.map((s) => s.url));
    const mail = email ? (JSON.parse(email.body) as { subject: string; text: string; html: string; reply_to?: string }) : null;
    eq("the subject", mail?.subject, "New sell / trade-in inquiry — Ada Obi · 2017 Toyota Highlander XLE");
    ok("the email says Sell / trade-in", Boolean(mail?.html.includes("Sell / trade-in")));
    ok("the email carries the message, VIN and all", Boolean(mail?.text.includes(`VIN: ${VIN}`)));
    const sms = text ? new URLSearchParams(text.body).get("Body") : null;
    eq("the text message", sms, "New sell / trade-in: Ada Obi (336) 555-0142 re 2017 Toyota Highlander XLE");
    ok("the VIN is in no subject, text message, address or log line", ![
      mail?.subject ?? "",
      sms ?? "",
      ...sentOut.map((s) => s.url),
      ...logged,
    ].some((s) => s.toUpperCase().includes(VIN)), logged);
    ok("the helper left a trace in the log", logged.some((l) => l.startsWith("[lead] trade_in from Ada Obi (us)")), logged);

    // The per-phone limit: five in an hour, then a person is asked to call.
    sentOut.length = 0;
    const contact = (n: number) => ({
      type: "contact" as const,
      source: "website",
      name: `Caller ${n}`,
      message: "Hello",
      preferredContact: "phone",
      vehicleLabel: null,
    });
    for (let n = 2; n <= RATE_LIMIT; n++) {
      eq(`request ${n} from the same number is saved`, (await intake({}, contact(n))).status, "saved");
    }
    eq(`request ${RATE_LIMIT + 1} from the same number is refused`, (await intake({}, contact(99))).status, "busy");
    eq("…and not saved", await leadCount(), RATE_LIMIT);
    eq("another number is fine", (await intake({ phone: "336-555-0199" }, contact(7))).status, "saved");
    const contactMail = sentOut.find((s) => s.url.includes("resend.com"));
    eq(
      "other inquiries' alerts read as before",
      contactMail ? (JSON.parse(contactMail.body) as { subject: string }).subject : null,
      "New contact inquiry — Caller 2",
    );
    const contactText = sentOut.find((s) => s.url.includes("twilio.com"));
    ok("…text message too", Boolean(contactText && new URLSearchParams(contactText.body).get("Body")?.startsWith("New contact: Caller 2")));

    // A write that fails: nothing is sent, and the log says why without what.
    sentOut.length = 0;
    logged.length = 0;
    const bad = { ...sellLead(v, "9e9e9e9e-0000-4000-8000-000000000000"), message: `VIN: ${VIN}\u0000` };
    eq("a message Postgres can't store is not saved", (await intake({ phone: "336-555-0111" }, bad)).status, "failed");
    eq("…and nobody is alerted", sentOut.length, 0);
    const failLine = logged.find((l) => l.startsWith("[lead] insert failed")) ?? "";
    ok("…the log says it failed", failLine !== "", logged);
    ok("…without the VIN, the name or the phone", !/5TDJZRFH1HS390174|Ada Obi|555-0111/.test(failLine), failLine);
    ok("…or the query", !/params|insert into/i.test(failLine), failLine);

    eq(
      "whatFailed keeps the driver's reason",
      whatFailed(Object.assign(new Error("Failed query: insert … params: secret"), { cause: Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" }) })),
      "Error ETIMEDOUT connect ETIMEDOUT",
    );
    eq("…and drops a query with no reason under it", whatFailed(new Error("Failed query: insert … params: secret")), "Error");

    globalThis.fetch = realFetch;
    await pg.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
