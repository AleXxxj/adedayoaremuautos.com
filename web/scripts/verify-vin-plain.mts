#!/usr/bin/env node
/**
 * The car check in words a buyer understands.
 *
 * Runs the real modules against real NHTSA and Wikimedia replies saved in
 * scripts/fixtures/vin (a 2017 Toyota Highlander, Nov 2026, the car the
 * developer tried, its VIN removed):
 *   - the facts and safety equipment read from the VIN decode;
 *   - the three recalls in NHTSA's own words, trimmed, as shown without AI;
 *   - the limits an AI summary must keep, and how AI answers that come back
 *     in time are merged with NHTSA's words for the ones that don't;
 *   - the choice of a Commons photo, and the requests that find it;
 *   - the crash-test versions compared, and the rollover chance.
 *
 * No request leaves this machine: fetch and Claude are replaced.
 *
 * Run: npm run test:vin
 */
import { readFileSync } from "node:fs";

process.env.DATABASE_URL ??= "postgres://unused@localhost:5432/unused";
// Neither key is needed, and a real one must never be used by a test.
delete process.env.ANTHROPIC_API_KEY;

const n = await import("../src/lib/vin/nhtsa");
const f = await import("../src/lib/vin/features");
const plain = await import("../src/lib/vin/plain");
const rp = await import("../src/lib/vin/recallPlain");
const ph = await import("../src/lib/vin/photo");

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
const eq = (label: string, got: unknown, want: unknown) => check(label, JSON.stringify(got) === JSON.stringify(want), { got, want });

const fixture = <T = unknown,>(name: string): T =>
  JSON.parse(readFileSync(new URL(`./fixtures/vin/${name}`, import.meta.url), "utf8")) as T;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const errors: string[] = [];
const realError = console.error;
console.error = (...a: unknown[]) => {
  errors.push(a.map(String).join(" "));
};

/** The developer's VIN: it must appear in no request, and the fixtures don't carry it. */
const VIN = "5TDJZRFH1HS390174";
const decode = fixture<Record<string, unknown>>("highlander-decode.json");
const highlander = n.summarizeDecode(decode);

/**
 * Cars NHTSA's decoder names by class or series, as vPIC answered for each
 * model's VIN pattern (Nov 2026; a pattern, never anyone's VIN).
 */
const SUV = "Sport Utility Vehicle [SUV]/Multipurpose Vehicle [MPV]";
const ML350 = {
  ModelYear: "2013", Make: "MERCEDES-BENZ", Model: "ML-Class", Trim: "ML350 4-MATIC", BodyClass: SUV, Doors: "4",
  DisplacementL: "3.50", EngineCylinders: "6", EngineConfiguration: "V-Shaped", DriveType: "AWD/All-Wheel Drive",
  FuelTypePrimary: "Gasoline", PlantCity: "VANCE", PlantCountry: "UNITED STATES (USA)",
};
const GLE350 = { ModelYear: "2016", Make: "MERCEDES-BENZ", Model: "GLE-Class", Trim: "GLE350", BodyClass: SUV, Doors: "4" };
const C300 = { ModelYear: "2015", Make: "MERCEDES-BENZ", Model: "C-Class", Trim: "C300", BodyClass: "Sedan/Saloon", Doors: "4" };
const C_4MATIC = { ...C300, Trim: "4-MATIC" };
const BMW_328I = { ModelYear: "2014", Make: "BMW", Model: "328i", Series: "3-Series", BodyClass: "Sedan/Saloon", Doors: "4" };
const RX350 = { ModelYear: "2018", Make: "LEXUS", Model: "RX", Trim: "350/350 F Sport", BodyClass: SUV, Doors: "4" };
const X5 = { ModelYear: "2015", Make: "BMW", Model: "X5", Trim: "xDrive35i", BodyClass: SUV, Doors: "4" };

/* ── Facts ────────────────────────────────────────────────────────────── */
console.log("\nPlain facts from the VIN decode (2017 Highlander)");
{
  const facts = f.factLines(highlander);
  const line = (k: string) => facts.find((x) => x.key === k)?.text;
  eq("body", line("body"), "SUV · 5 doors");
  eq("seats", line("seats"), "7 seats in 3 rows");
  eq("engine", line("engine"), "3.5L V6 · 295 hp");
  eq("transmission", line("transmission"), "8-speed automatic");
  eq("drive", line("drive"), "4-wheel drive");
  eq("fuel", line("fuel"), "Gas");
  eq("built in: city and state, no country for the US", line("built"), "Princeton, Indiana");
  eq("the trims vPIC lists, as a choice", line("trim"), "SE or XLE");
  eq("the price when new", line("price"), "From $38,520 when new");
  eq("with where the price comes from", facts.find((x) => x.key === "price")?.note, "Maker’s base price reported to NHTSA.");
  eq("in the page's order", facts.map((x) => x.key), ["body", "seats", "engine", "transmission", "drive", "fuel", "built", "trim", "price"]);
  check(
    "the decode's existing fields are as they were",
    highlander.engine === "3.5 L 6-cylinder" && highlander.builtIn === "UNITED STATES" && highlander.drive === "4WD" && highlander.body === "SUV" && highlander.trim === null,
    highlander,
  );

  eq(
    "safety equipment marked standard, in plain words",
    f.safetyItems(highlander.details).map((i) => `${i.name}${i.optional ? " (optional)" : ""}`),
    [
      "Automatic emergency braking",
      "Forward collision warning",
      "Pedestrian emergency braking",
      "Blind spot warning",
      "Lane departure warning",
      "Lane keeping assist",
      "Adaptive cruise control",
      "Backup camera",
      "Stability control",
      "Anti-lock brakes",
      "Traction control",
      "Tire pressure monitor",
      "Auto high beams",
      "Keyless start",
    ],
  );
  eq("air bags in one line", f.airBagsLine(highlander.details), "Air bags: front, side, curtain and driver’s knee");
  eq("an SUV is drawn as one when there is no photo", f.bodyShape(highlander), "suv");
  eq(
    "\"Is this the car?\" says it in the same words",
    f.summaryLine(highlander),
    "SUV · 3.5L V6 · 4-wheel drive · Built in Princeton, Indiana",
  );

  const as = (v: Record<string, string>) => f.factLines(n.summarizeDecode({ ModelYear: "2021", Make: "X", Model: "Y", ...v }));
  const text = (facts: { key: string; text: string }[], k: string) => facts.find((x) => x.key === k)?.text;
  const ev = as({
    FuelTypePrimary: "Electric",
    ElectrificationLevel: "BEV (Battery Electric Vehicle)",
    EngineHP: "283",
    TransmissionStyle: "Automatic",
    TransmissionSpeeds: "1",
    DriveType: "RWD/Rear-Wheel Drive",
  });
  check(
    "an electric car: a motor, one speed, rear-wheel drive",
    text(ev, "engine") === "Electric motor · 283 hp" && text(ev, "transmission") === "Single-speed automatic" && text(ev, "fuel") === "Electric" && text(ev, "drive") === "Rear-wheel drive",
    ev,
  );
  const abroad = as({
    TransmissionStyle: "Continuously Variable Transmission (CVT)",
    FuelTypePrimary: "Gasoline",
    FuelTypeSecondary: "Ethanol (E85)",
    PlantCity: "TAHARA",
    PlantState: "AICHI",
    PlantCountry: "JAPAN",
    DriveType: "AWD/All-Wheel Drive",
  });
  check(
    "a CVT, flex fuel, built abroad: the country is named",
    text(abroad, "transmission") === "Automatic (CVT)" && text(abroad, "fuel") === "Flex fuel" && text(abroad, "built") === "Tahara, Aichi, Japan" && text(abroad, "drive") === "All-wheel drive",
    abroad,
  );
  const turbo = as({ DisplacementL: "2.0", EngineCylinders: "4", EngineConfiguration: "In-Line", Turbo: "Yes", EngineHP: "252.0", ElectrificationLevel: "Strong HEV (Hybrid Electric Vehicle)", FuelTypePrimary: "Gasoline" });
  check("a turbo four, and a hybrid", text(turbo, "engine") === "2.0L turbo 4-cylinder · 252 hp" && text(turbo, "fuel") === "Hybrid", turbo);
  const sparse = as({ Trim: "LE", BasePrice: "1.00", Seats: "0" });
  eq("what NHTSA doesn't have is left out: one trim, a price that can't be, no seats", sparse, []);
  const optional = n.summarizeDecode({ Model: "Y", BlindSpotMon: "Optional", ABS: "Standard", ESC: "Not Applicable" });
  eq("optional equipment says so, after the standard, and blanks are left out", f.safetyItems(optional.details), [
    { name: "Anti-lock brakes", optional: false },
    { name: "Blind spot warning", optional: true },
  ]);

  // "Is this the car?" shows the results' own facts as a short list.
  eq(
    "the confirm step lists the results' facts: gas is left out next to an engine, and so are the trims and the price",
    f.confirmFacts(highlander).map((x) => `${x.label}: ${x.text}`),
    ["Body: SUV · 5 doors", "Seats: 7 seats in 3 rows", "Engine: 3.5L V6 · 295 hp", "Transmission: 8-speed automatic", "Drive: 4-wheel drive", "Built in: Princeton, Indiana"],
  );
  check(
    "every fact on the confirm step is word for word a fact on the results",
    f.confirmFacts(highlander).every((c) => f.factLines(highlander).some((r) => r.key === c.key && r.text === c.text && r.icon === c.icon)),
  );
  eq("a hybrid is named on the confirm step", f.confirmFacts(n.summarizeDecode({ ModelYear: "2021", Make: "X", Model: "Y", DisplacementL: "2.5", EngineCylinders: "4", ElectrificationLevel: "Strong HEV (Hybrid Electric Vehicle)", FuelTypePrimary: "Gasoline" })).map((x) => x.text), ["2.5L 4-cylinder", "Hybrid"]);
  eq("and an electric car, which has no engine size", f.confirmFacts(n.summarizeDecode({ ModelYear: "2021", Make: "X", Model: "Y", FuelTypePrimary: "Electric", ElectrificationLevel: "BEV (Battery Electric Vehicle)" })).map((x) => `${x.label}: ${x.text}`), ["Motor: Electric motor", "Fuel: Electric"]);

  // The developer's car: a 2013 ML350, as vPIC decodes one (Nov 2026). It
  // gives the plant's city and no state, and no seats or transmission.
  const ml = n.summarizeDecode(ML350);
  eq(
    "a U.S. plant vPIC gives no state for gets its state: \"Vance\" means nothing, \"Vance, Alabama\" does",
    f.confirmFacts(ml).map((x) => `${x.label}: ${x.text}`),
    ["Body: SUV · 4 doors", "Engine: 3.5L V6", "Drive: All-wheel drive", "Built in: Vance, Alabama"],
  );
  eq("the results say the same", text(f.factLines(ml), "built"), "Vance, Alabama");
  eq("the state is worked out when shown, so a decode already cached gets it", ml.details.plant, { city: "Vance", state: null, country: "United States" });
  eq("vPIC's own state is kept", text(as({ PlantCity: "VANCE", PlantState: "ALABAMA", PlantCountry: "UNITED STATES (USA)" }), "built"), "Vance, Alabama");
  eq("a city the list doesn't have stays a city alone", text(as({ PlantCity: "SPRINGFIELD", PlantCountry: "UNITED STATES (USA)" }), "built"), "Springfield");
  eq("a city of the same name abroad gets no U.S. state", text(as({ PlantCity: "LINCOLN", PlantCountry: "CANADA" }), "built"), "Lincoln, Canada");
  eq("Kansas City is in two states, so it gets neither", text(as({ PlantCity: "KANSAS CITY", PlantCountry: "UNITED STATES (USA)" }), "built"), "Kansas City");
}

/* ── Recalls without AI ───────────────────────────────────────────────── */
console.log("\nThe Highlander's recalls in NHTSA's own words, trimmed");
const raw = fixture<{ results: Record<string, unknown>[] }>("highlander-recalls.json").results;
const asRecall = (x: Record<string, unknown>) => ({
  campaign: String(x.NHTSACampaignNumber),
  date: null,
  component: (x.Component as string) ?? null,
  summary: (x.Summary as string) ?? null,
  consequence: (x.Consequence as string) ?? null,
  remedy: (x.Remedy as string) ?? null,
  parkIt: x.parkIt === true,
  parkOutside: x.parkOutSide === true,
});
const vehicleRecalls = raw.filter((x) => String(x.NHTSACampaignNumber).charAt(2) === "V").map(asRecall);
{
  eq("three vehicle recalls (the windshield one is equipment)", vehicleRecalls.map((r) => r.campaign), ["17V520000", "17V295000", "20V682000"]);
  const t = Object.fromEntries(vehicleRecalls.map((r) => [r.campaign, rp.fallbackText(r)]));
  eq("roof rails", t["17V520000"], {
    headline: "Accessory",
    problem: "It affects vehicles equipped with accessory roof rail cross bars. The fasteners for the roof rails may not be torqued properly.",
    risk: "The roof rails may loosen and possibly detach from the vehicle, becoming a road hazard and increasing the risk of a crash.",
    fix: "Dealers will inspect and properly torque the fasteners, free of charge.",
  });
  eq("spare tire", t["17V295000"], {
    headline: "Spare tire",
    problem: "The spare tire air pressure was not adjusted to the proper pressure as stated on the Tire Pressure Label.",
    risk: "A spare tire that is not inflated to the proper value may not perform as intended, increasing the risk of a crash.",
    fix: "Dealers will inspect the spare tires, adjusting their pressure as necessary, free of charge.",
  });
  eq("fuel pump", t["20V682000"], {
    headline: "Fuel pump",
    problem: "The low-pressure fuel pump inside the fuel tank may fail.",
    risk: "If the fuel pump fails, the engine can stall while driving, increasing the risk of a crash.",
    fix: "Dealers will replace the fuel pump assembly with an improved one, free of charge.",
  });
  const fixes = Object.values(t).map((x) => x.fix ?? "");
  check(
    "no fix keeps a phone number, a date, a letter to owners or a reference number",
    fixes.every((x) => !/\d{3}-\d{4}|20\d\d|notif|number for this recall|note:/i.test(x)),
    fixes,
  );
  check("each says the fix is free, from NHTSA's words", vehicleRecalls.every((r) => plain.freeFix(r.remedy)));
  eq("the spec's component names", ["FUEL SYSTEM, GASOLINE:DELIVERY:FUEL PUMP", "TIRES:TEMPORARY/EMERGENCY SPARE TIRE", "AIR BAGS", "SERVICE BRAKES", "POWER TRAIN", "EQUIPMENT"].map(plain.recallPart), [
    "Fuel pump",
    "Spare tire",
    "Air bags",
    "Brakes",
    "Transmission",
    "Accessory",
  ]);
  eq(
    "an old notice in capitals reads as sentences",
    rp.fallbackText({
      component: "SERVICE BRAKES, HYDRAULIC:FOUNDATION COMPONENTS:HOSES, LINES/PIPING, AND FITTINGS",
      summary: "FORD MOTOR COMPANY IS RECALLING CERTAIN 2005 FORD F-150 VEHICLES. THE FRONT BRAKE HOSE MAY LEAK.",
      consequence: "A LEAK MAY REDUCE BRAKING, INCREASING THE RISK OF A CRASH.",
      remedy: "DEALERS WILL REPLACE THE BRAKE HOSES FREE OF CHARGE. THE RECALL BEGAN ON JUNE 1, 2005. OWNERS MAY CONTACT FORD AT 1-866-436-7332.",
    }),
    {
      headline: "Brakes",
      problem: "The front brake hose may leak.",
      risk: "A leak may reduce braking, increasing the risk of a crash.",
      fix: "Dealers will replace the brake hoses free of charge.",
    },
  );
  eq("a one-sentence summary is kept whole", rp.fallbackText({ component: null, summary: "X is recalling certain vehicles whose doors may open.", consequence: null, remedy: null }).problem, "X is recalling certain vehicles whose doors may open.");
  eq("\"Inc.\" and \"U.S.\" don't end a sentence", plain.sentences("Gulf States Toyota, Inc. (GST) is recalling U.S. vehicles. The bolts may be loose."), [
    "Gulf States Toyota, Inc. (GST) is recalling U.S. vehicles.",
    "The bolts may be loose.",
  ]);
}

/* ── Recalls with AI: the limits ──────────────────────────────────────── */
console.log("\nAn AI summary is kept only within its limits");
{
  const remedy = "Dealers will tighten the bolts, free of charge.";
  const good = {
    headline: "Roof rack bars can come loose.",
    problem: "The bolts that hold the roof rack bars may not be tight enough.",
    risk: "The bars could come off while driving and cause a crash.",
    fix: "Dealers will check the bolts and tighten them for free.",
  };
  const ok = rp.checkPlain(good, remedy);
  check("a good answer is kept, its headline without a period", typeof ok === "object" && ok.headline === "Roof rack bars can come loose", ok);
  eq("a headline over 8 words is not", rp.checkPlain({ ...good, headline: "The roof rack bars on this car can come loose" }, remedy), "headline too long");
  eq("a headline over 60 characters is not", rp.checkPlain({ ...good, headline: "Supercalifragilistic expialidocious roofrackcrossbarfasteners loosen" }, remedy), "headline too long");
  eq("a problem of 3 sentences is not", rp.checkPlain({ ...good, problem: "One. Two. Three." }, remedy), "problem too long");
  eq("a risk of 2 sentences is not", rp.checkPlain({ ...good, risk: "The bars could fall. That could cause a crash." }, remedy), "risk too long");
  eq("an exclamation mark is not", rp.checkPlain({ ...good, fix: "Dealers will tighten them for free!" }, remedy), "exclamation mark");
  eq("\"free\" is not, when NHTSA's remedy doesn't say so", rp.checkPlain(good, "Dealers will tighten the bolts."), "says free");
  eq("a British spelling is not", rp.checkPlain({ ...good, problem: "The spare tyre may be soft." }, remedy), "British spelling");
  check("the instructions name every limit", /8 words/.test(rp.SYSTEM) && /60 characters/.test(rp.SYSTEM) && /1 or 2 short sentences/.test(rp.SYSTEM) && /free only if/.test(rp.SYSTEM));
  const notice = rp.noticeFor(vehicleRecalls[0], "TOYOTA");
  check("Claude is given NHTSA's text and the make, nothing else", notice.startsWith("Make: TOYOTA\nPart: EQUIPMENT\nSummary: Gulf States") && !notice.includes(VIN), notice);
}

/* ── Recalls with AI: the time budget ─────────────────────────────────── */
console.log("\nAI answers back in time are used, the rest are NHTSA's words");
{
  const words = (h: string) => ({ headline: h, problem: "P.", risk: "R.", fix: "F." });
  const at = (campaign: string, date: string) => ({ ...vehicleRecalls[2], campaign, date });
  const list = [at("24V001000", "2024-01-01"), at("23V002000", "2023-01-01"), at("22V003000", "2022-01-01"), at("21V004000", "2021-01-01")];
  const calls: string[] = [];
  rp.__setSummarizerForTests(async (r) => {
    calls.push(r.campaign);
    if (r.campaign === "23V002000") {
      await sleep(300);
      return words("Late answer");
    }
    if (r.campaign === "22V003000") throw new Error("boom");
    return words(`Answer for ${r.campaign}`);
  });
  errors.length = 0;
  const t0 = Date.now();
  const { texts, rest } = await rp.recallTexts(list, "TOYOTA", 100);
  const waited = Date.now() - t0;
  check("the check waits for the budget, not for the slowest answer", waited >= 90 && waited < 250, waited);
  eq(
    "answers back in time are AI; the late one and the failed one are NHTSA's",
    list.map((r) => texts[r.campaign].source),
    ["ai", "nhtsa", "nhtsa", "ai"],
  );
  eq("an AI answer is used as given", texts["24V001000"].headline, "Answer for 24V001000");
  eq("NHTSA's words are trimmed as without AI", texts["23V002000"].headline, "Fuel pump");
  await rp.warmRecallTexts(list.slice(1, 2), "TOYOTA").then(() => undefined);
  eq("a summary already on its way is not asked for twice", calls.filter((c) => c === "23V002000").length, 1);
  await rest;
  check("the late answer still arrives, for the cache", calls.includes("23V002000"));
  check(
    "a failure is logged with the campaign number only",
    errors.some((e) => e === "[recall-plain] 22V003000: Error") && errors.every((e) => !e.includes(VIN)),
    errors,
  );

  const many = Array.from({ length: 14 }, (_, i) => at(`${String(30 - i)}V${String(i).padStart(3, "0")}000`, `20${30 - i}-01-01`));
  calls.length = 0;
  const twelve = await rp.recallTexts(many, "TOYOTA", 200);
  await twelve.rest;
  check("only the 12 newest are asked about", calls.length === 12 && !calls.includes(many[12].campaign) && !calls.includes(many[13].campaign), calls);
  check("and every recall still has words", many.every((r) => twelve.texts[r.campaign]?.headline), twelve.texts);

  rp.__setSummarizerForTests(null);
  calls.length = 0;
  const none = await rp.recallTexts(list, "TOYOTA", 100);
  check("without a key nothing is asked, and every recall is in NHTSA's words", calls.length === 0 && list.every((r) => none.texts[r.campaign].source === "nhtsa"), none.texts);

  const got = await rp.settleWithin([sleep(10).then(() => "a"), sleep(200).then(() => "b"), Promise.reject(new Error("x"))], 60);
  eq("settleWithin: what's back in time, nothing for the late or the failed", got, ["a", undefined, undefined]);
}

/* ── The request Claude is sent ───────────────────────────────────────── */
console.log("\nThe request Claude is sent, to a stand-in on this machine");
{
  const { createServer } = await import("node:http");
  const got: { url: string; headers: Record<string, unknown>; body: Record<string, unknown> }[] = [];
  let answer: Record<string, unknown> = {};
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      got.push({ url: req.url ?? "", headers: req.headers, body: JSON.parse(body || "{}") });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(answer));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.ANTHROPIC_API_KEY = "test-key-not-a-real-one";

  const message = (stop: string, text: string | null) => ({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: text === null ? [] : [{ type: "text", text }],
    stop_reason: stop,
    stop_sequence: null,
    stop_details: stop === "refusal" ? { type: "refusal", category: "cyber", explanation: null } : null,
    usage: { input_tokens: 400, output_tokens: 90 },
  });
  const fuelPump = vehicleRecalls[2];
  answer = message(
    "end_turn",
    JSON.stringify({
      headline: "Fuel pump can stop working",
      problem: "A part inside the gas tank that pumps fuel may fail.",
      risk: "The engine could stall while you drive, which raises the chance of a crash.",
      fix: "Dealers will put in a new, better fuel pump for free.",
    }),
  );
  const words = await rp.summarizeUncached(fuelPump, "TOYOTA");
  eq("the answer is read from the structured output", words.headline, "Fuel pump can stop working");
  const sent = got[0];
  const body = sent.body as {
    model: string;
    max_tokens: number;
    fallbacks: unknown;
    output_config: { effort: string; format: { type: string; schema: { properties: Record<string, unknown>; required: string[] } } };
    system: string;
    messages: { role: string; content: string }[];
  };
  check("to the Messages API, beta", sent.url.startsWith("/v1/messages"), sent.url);
  // The SDK's parse() adds its own structured-outputs beta beside ours.
  check(
    "with the server-side fallback beta",
    String(sent.headers["anthropic-beta"]).split(",").includes("server-side-fallback-2026-07-01"),
    sent.headers["anthropic-beta"],
  );
  check(
    "Claude Opus 5.5, 2000 tokens, low effort, fallbacks by default",
    body.model === "claude-opus-5-5" && body.max_tokens === 2000 && body.fallbacks === "default" && body.output_config.effort === "low",
    body,
  );
  check(
    "the answer's shape as a JSON schema",
    body.output_config.format.type === "json_schema" &&
      JSON.stringify(Object.keys(body.output_config.format.schema.properties)) === '["headline","problem","risk","fix"]',
    body.output_config.format,
  );
  check("the instructions and NHTSA's notice, nothing about the car or the visitor", body.system === rp.SYSTEM && body.messages.length === 1 && body.messages[0].content === rp.noticeFor(fuelPump, "TOYOTA") && !JSON.stringify(body).includes(VIN));

  answer = message("refusal", null);
  const refused = await rp.summarizeUncached(fuelPump, "TOYOTA").then(() => "kept", (e: Error) => e.message);
  eq("a refusal is not used", refused, "refused");
  answer = message("end_turn", JSON.stringify({ headline: "The low-pressure fuel pump inside the tank may fail and stall it", problem: "P.", risk: "R.", fix: "F." }));
  const long = await rp.summarizeUncached(fuelPump, "TOYOTA").then(() => "kept", (e: Error) => e.message);
  eq("nor an answer over its limits", long, "headline too long");
  answer = message("max_tokens", '{"headline": "Fuel pump');
  const cut = await rp.summarizeUncached(fuelPump, "TOYOTA").then(() => "kept", () => "not used");
  eq("nor one cut off", cut, "not used");

  server.close();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_BASE_URL;
}

/* ── The photo ────────────────────────────────────────────────────────── */
console.log("\nA photo of the model from Wikimedia Commons");
{
  type Reply = { query: { pages: Record<string, { title: string; index: number; imageinfo: Record<string, unknown>[] }> } };
  const reply = fixture<Reply>("commons-2016-toyota-highlander.json");
  const want: import("../src/lib/vin/photo").PhotoWant = { series: null, shape: "suv", words: highlander.fit.words };
  const best = ph.pickPhoto(reply, 2016, "Toyota", "Highlander", want);
  eq("a front view is chosen, credited and licensed", best, {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9a/2016_Toyota_Highlander_LE%2C_Front_Left.jpg/960px-2016_Toyota_Highlander_LE%2C_Front_Left.jpg",
    width: 960,
    height: 467,
    photoYear: 2016,
    model: "Highlander",
    title: "2016 Toyota Highlander LE, Front Left",
    pageUrl: "https://commons.wikimedia.org/wiki/File:2016_Toyota_Highlander_LE,_Front_Left.jpg",
    artist: "SsmIntrigue",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  });

  const edit = (fn: (p: Reply["query"]["pages"][string]) => void): Reply => {
    const copy = structuredClone(reply);
    Object.values(copy.query.pages).forEach(fn);
    return copy;
  };
  const meta = (p: { imageinfo: Record<string, unknown>[] }) => p.imageinfo[0].extmetadata as Record<string, { value: string }>;
  const noFront = edit((p) => {
    if (/front/i.test(p.title)) p.imageinfo[0].mime = "image/tiff";
  });
  eq("without a front view, the next in search order, never the rear", ph.pickPhoto(noFront, 2016, "Toyota", "Highlander", want)?.title, "2016 Toyota Highlander (XU50) IMG 2932");
  const reordered = edit((p) => {
    p.index = p.title.includes("XU50") ? 1 : p.index + 10;
  });
  eq("a front view beats an earlier search result", ph.pickPhoto(reordered, 2016, "Toyota", "Highlander", want)?.title, "2016 Toyota Highlander LE, Front Left");
  const nc = edit((p) => {
    meta(p).LicenseShortName.value = "CC BY-NC-SA 2.0";
  });
  eq("a non-commercial license is never used", ph.pickPhoto(nc, 2016, "Toyota", "Highlander", want), null);
  const small = edit((p) => {
    p.imageinfo[0].width = 640;
  });
  eq("nor a small image", ph.pickPhoto(small, 2016, "Toyota", "Highlander", want), null);
  const tall = edit((p) => {
    p.imageinfo[0].width = 1000;
    p.imageinfo[0].height = 1500;
  });
  eq("nor a portrait one", ph.pickPhoto(tall, 2016, "Toyota", "Highlander", want), null);
  const anon = edit((p) => {
    meta(p).Artist.value = "";
  });
  eq("nor a CC BY-SA photo without an author to credit", ph.pickPhoto(anon, 2016, "Toyota", "Highlander", want), null);
  const pd = edit((p) => {
    meta(p).Artist.value = "";
    meta(p).LicenseShortName.value = "Public domain";
  });
  check("a public-domain photo needs no author", ph.pickPhoto(pd, 2016, "Toyota", "Highlander", want)?.license === "Public domain");
  const elsewhere = edit((p) => {
    p.imageinfo[0].thumburl = "https://example.com/wikipedia/commons/thumb/a.jpg";
  });
  eq("nor a thumbnail on a host next.config.ts doesn't allow", ph.pickPhoto(elsewhere, 2016, "Toyota", "Highlander", want), null);

  const page = (title: string, extra: Record<string, unknown> = {}) => ({
    title: `File:${title}.jpg`,
    index: 1,
    imageinfo: [
      {
        mime: "image/jpeg",
        width: 2000,
        height: 1200,
        thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/960px-X.jpg?utm_source=x",
        thumbwidth: 960,
        thumbheight: 576,
        descriptionurl: "https://commons.wikimedia.org/wiki/File:X.jpg",
        extmetadata: { Artist: { value: "A. Person" }, LicenseShortName: { value: "CC BY 2.0" }, LicenseUrl: { value: "https://creativecommons.org/licenses/by/2.0" } },
        ...extra,
      },
    ],
  });
  const one = (title: string) => ({ query: { pages: { "1": page(title) } } });
  const pick = (title: string, year: number, make: string, model: string, w: Partial<typeof want> = {}) =>
    ph.pickPhoto(one(title), year, make, model, { ...want, ...w })?.title ?? null;
  eq("the name must start with the year, make and model", pick("Toyota Highlander 2016 front", 2016, "Toyota", "Highlander"), null);
  eq("parts and scenes are left out", ["2016 Toyota Highlander interior", "2016 Toyota Highlander wrecked", "2016 Toyota Highlander police car", "2016 Toyota Highlander at the Geneva motor show", "2016 Toyota Highlander rear view"].map((t) => pick(t, 2016, "Toyota", "Highlander")), [null, null, null, null, null]);
  eq("another truck series is not this one", pick("2019 Chevrolet Silverado 2500HD LT", 2019, "Chevrolet", "Silverado", { series: "1500", shape: "pickup" }), null);
  eq("the same series is", pick("2019 Chevrolet Silverado 1500 LT Crew Cab", 2019, "Chevrolet", "Silverado", { series: "1500", shape: "pickup" }), "2019 Chevrolet Silverado 1500 LT Crew Cab");
  eq("a coupe is not a sedan", pick("2016 Honda Accord Coupe, front", 2016, "Honda", "Accord", { shape: "sedan" }), null);
  eq("a Rogue Sport is not a Rogue", pick("2019 Nissan Rogue Sport SV", 2019, "Nissan", "Rogue", { shape: "suv", words: ["SV"] }), null);
  eq("but a Civic Sport is a Civic Sport", pick("2019 Honda Civic Sport sedan", 2019, "Honda", "Civic", { shape: "sedan", words: ["SPORT"] }), "2019 Honda Civic Sport sedan");
  eq("a longer model name is not this model", pick("2016 Toyota Highlanders in a row", 2016, "Toyota", "Highlander"), null);
  check("the thumbnail loses its tracking query", ph.pickPhoto(one("2016 Toyota Highlander XLE"), 2016, "Toyota", "Highlander", want)?.src.includes("?") === false);
  eq("the author's name without its link", ph.plainArtist('<bdi><a href="//commons.wikimedia.org/wiki/User:X" title="User:X">Jane &amp; John O&#39;Neil</a></bdi>'), "Jane & John O'Neil");
  eq("names to search: a truck's series first", ph.photoNames("Silverado", "1500"), ["Silverado 1500", "Silverado"]);
  eq("a model without its note", ph.photoNames("RAV4 Prime (PHEV)", null), ["RAV4 Prime"]);
  eq("a model named two ways", ph.photoNames("Caravan/Grand Caravan", null), ["Caravan", "Grand Caravan"]);

  // Makes that sell a class under badges. NHTSA calls a 2013 ML350 an
  // "ML-Class"; photographers name their files "ML350", "ML 350" or "M-Class".
  const namesOf = (v: Record<string, string>) => {
    const car = n.summarizeDecode(v);
    return ph.photoNames(car.model!, car.series, car.names, car.fit.words);
  };
  const badgeOf = (v: Record<string, string>) => {
    const car = n.summarizeDecode(v);
    return ph.ownBadge(car.model!, car.names, car.fit.words);
  };
  eq("an ML350: its badge, any ML, then the class as Commons spells it", namesOf(ML350), ["ML350", "ML-Class", "M-Class"]);
  eq("a GLE350: its badge, then its class", namesOf(GLE350), ["GLE350", "GLE-Class"]);
  eq("a C300: its badge, then its class", namesOf(C300), ["C300", "C-Class"]);
  eq("a C-Class whose VIN names no badge: the class alone, none of the badges NHTSA's recalls are tried under", namesOf(C_4MATIC), ["C-Class"]);
  eq("a BMW 328i: the badge that is its model, then its series", namesOf(BMW_328I), ["328i", "3 Series"]);
  eq("a Lexus RX with trim \"350\": the badge, then the model", namesOf(RX350), ["RX350", "RX"]);
  eq("a drive name with digits is not a badge", namesOf(X5), ["X5"]);
  eq("the badge is the one NHTSA's names and the trim agree on", [ML350, GLE350, C300, C_4MATIC, BMW_328I, RX350, X5, decode as Record<string, string>].map(badgeOf), ["ML350", "GLE350", "C300", null, null, "RX350", null, null]);
  eq("the badges come from nhtsaModelNames, not from a second reading of the trim", n.summarizeDecode(ML350).names, ["ML-Class", "ML350"]);

  const asked = (model: string) => new URL(ph.searchUrl(2016, "Mercedes-Benz", model)).searchParams.get("gsrsearch");
  eq("a badge is asked for as written", asked("GLE350"), 'intitle:"2016 Mercedes-Benz GLE350"');
  eq("a class is asked for by its letters, which finds \"GLE 350 d\", \"GLE 250\" and \"GLE-Class\"", asked("GLE-Class"), 'intitle:"2016 Mercedes-Benz GLE"');
  eq("the M-Class by its own letter", asked("M-Class"), 'intitle:"2016 Mercedes-Benz M"');

  // Commons' real replies (Nov 2026), saved as fixtures.
  const mlReply = fixture<Reply>("commons-2013-mercedes-benz-ml350.json");
  const gleReply = fixture<Reply>("commons-2016-mercedes-benz-gle.json");
  const mlWant = { series: null, shape: "suv" as const, words: n.summarizeDecode(ML350).fit.words, badge: "ML350" };
  const mlPhoto = ph.pickPhoto(mlReply, 2013, "Mercedes-Benz", "ML350", mlWant);
  eq(
    "the ML350's photo: filed as \"ML 350\", and an SUV an Australian calls a wagon",
    mlPhoto && { title: mlPhoto.title, model: mlPhoto.model, photoYear: mlPhoto.photoYear, license: mlPhoto.license, artist: mlPhoto.artist },
    { title: "2013 Mercedes-Benz ML 350 (W 166) BlueTEC wagon (2014-10-02)", model: "ML350", photoYear: 2013, license: "CC BY-SA 4.0", artist: "EurovisionNim" },
  );
  eq("the same file under the class name", ph.pickPhoto(mlReply, 2013, "Mercedes-Benz", "ML-Class", mlWant)?.title, "2013 Mercedes-Benz ML 350 (W 166) BlueTEC wagon (2014-10-02)");
  eq("a sedan is still not a wagon", pick("2015 Subaru Legacy wagon", 2015, "Subaru", "Legacy", { shape: "sedan" }), null);

  const gleWant = { series: null, shape: "suv" as const, words: ["GLE350"], badge: "GLE350" };
  const glePhoto = ph.pickPhoto(gleReply, 2016, "Mercedes-Benz", "GLE-Class", gleWant);
  eq(
    "among a class's photos the car's own badge comes first, ahead of a front view of another",
    glePhoto && { title: glePhoto.title, model: glePhoto.model },
    { title: "2016 Mercedes-Benz GLE 350 d (W 166) wagon (2016-03-05) 01", model: "GLE350" },
  );
  const anyGle = ph.pickPhoto(gleReply, 2016, "Mercedes-Benz", "GLE-Class", { ...gleWant, words: [], badge: null });
  eq(
    "with no badge, a plain car before an AMG one, and it is credited as the class",
    anyGle && { title: anyGle.title, model: anyGle.model },
    { title: "2016 Mercedes-Benz GLE 350 d (W 166) wagon (2016-03-05) 01", model: "GLE-Class" },
  );
  eq(
    "an AMG car gets the AMG photo's front view",
    ph.pickPhoto(gleReply, 2016, "Mercedes-Benz", "GLE-Class", { ...gleWant, words: ["AMG"], badge: null })?.title,
    "2016 Mercedes-Benz GLE 250 Diesel 4MATIC AMG Line Premium 2.1 Front",
  );
  check(
    "the fixture's rear view and its nearly square photo are never chosen",
    [gleWant, { ...gleWant, badge: null }, { ...gleWant, words: ["AMG"], badge: null }].every((w) => {
      const t = ph.pickPhoto(gleReply, 2016, "Mercedes-Benz", "GLE-Class", w)?.title ?? "";
      return !/Rear/.test(t) && t !== "2016 Mercedes-Benz GLE 350";
    }),
  );
  eq("a class is not a longer class: a CLA is not a C-Class", pick("2015 Mercedes-Benz CLA 250", 2015, "Mercedes-Benz", "C-Class", { shape: "sedan" }), null);
  eq("but a C 200 is", pick("2015 Mercedes-Benz C 200 (W 205) sedan", 2015, "Mercedes-Benz", "C-Class", { shape: "sedan" }), "2015 Mercedes-Benz C 200 (W 205) sedan");
  eq("and so is a C300, written together", pick("2014 Mercedes-Benz C300 4Matic, Front Left", 2014, "Mercedes-Benz", "C-Class", { shape: "sedan" }), "2014 Mercedes-Benz C300 4Matic, Front Left");
  eq("a C-Class coupe is not the sedan", pick("2015 Mercedes-Benz C 63 AMG (C204) Edition 507 coupe", 2015, "Mercedes-Benz", "C-Class", { shape: "sedan" }), null);
  eq("a name may be written with or without its hyphen or space", [pick("2019 Ford F150 XLT", 2019, "Ford", "F-150", { shape: "pickup" }), pick("2018 Lexus RX 350 F Sport", 2018, "Lexus", "RX350")], ["2019 Ford F150 XLT", "2018 Lexus RX 350 F Sport"]);
  eq("a longer number is another model", pick("2018 Lexus RX 3500", 2018, "Lexus", "RX350"), null);

  // End to end: the developer's ML350, which showed a drawing before.
  {
    const mlSeen: string[] = [];
    ph.__setPhotoFetchForTests(async (input) => {
      const search = new URL(String(input)).searchParams.get("gsrsearch") ?? "";
      mlSeen.push(search);
      return json(search === 'intitle:"2013 Mercedes-Benz ML350"' ? mlReply : search === 'intitle:"2016 Mercedes-Benz GLE"' ? gleReply : { batchcomplete: "" });
    });
    const gotMl = await ph.carPhotoUncached(n.summarizeDecode(ML350));
    check("the 2013 ML350 gets a photo of a 2013 ML 350", gotMl?.title === "2013 Mercedes-Benz ML 350 (W 166) BlueTEC wagon (2014-10-02)" && gotMl.model === "ML350" && gotMl.photoYear === 2013, gotMl);
    eq("in one request", mlSeen, ['intitle:"2013 Mercedes-Benz ML350"']);

    mlSeen.length = 0;
    const gotGle = await ph.carPhotoUncached(n.summarizeDecode(GLE350));
    check("the 2016 GLE350, filed nowhere as \"GLE350\", gets a GLE 350 from its class", gotGle?.title === "2016 Mercedes-Benz GLE 350 d (W 166) wagon (2016-03-05) 01" && gotGle.model === "GLE350", gotGle);
    eq("the badge first, then the class", mlSeen, ['intitle:"2016 Mercedes-Benz GLE350"', 'intitle:"2016 Mercedes-Benz GLE"']);

    mlSeen.length = 0;
    ph.__setPhotoFetchForTests(async (input) => {
      mlSeen.push(new URL(String(input)).searchParams.get("gsrsearch") ?? "");
      return json({ batchcomplete: "" });
    });
    check("an ML350 with nothing on Commons is no photo", (await ph.carPhotoUncached(n.summarizeDecode(ML350))) === null);
    eq(
      "at most nine requests: three names, three years",
      mlSeen,
      ["2013", "2012", "2014"].flatMap((y) => ["ML350", "ML", "M"].map((name) => `intitle:"${y} Mercedes-Benz ${name}"`)),
    );
    mlSeen.length = 0;
    await ph.carPhotoUncached(n.summarizeDecode(C_4MATIC));
    eq("a class with no badge: three requests", mlSeen, ['intitle:"2015 Mercedes-Benz C"', 'intitle:"2014 Mercedes-Benz C"', 'intitle:"2016 Mercedes-Benz C"']);
  }

  // End to end: the exact year has nothing on Commons, the year before does.
  const seen: { url: URL; ua: string | null }[] = [];
  const replies: Record<string, unknown> = {
    'intitle:"2017 Toyota Highlander"': fixture("commons-2017-toyota-highlander.json"),
    'intitle:"2016 Toyota Highlander"': reply,
  };
  ph.__setPhotoFetchForTests(async (input, init) => {
    const url = new URL(String(input));
    seen.push({ url, ua: new Headers(init?.headers).get("user-agent") });
    return json(replies[url.searchParams.get("gsrsearch") ?? ""] ?? { batchcomplete: "" });
  });
  const got = await ph.carPhotoUncached(highlander);
  check("the 2017 Highlander gets the 2016 front view", got?.photoYear === 2016 && got.title === "2016 Toyota Highlander LE, Front Left", got);
  eq("the exact year first, then the year before; the year after is never asked", seen.map((s) => s.url.searchParams.get("gsrsearch")), [
    'intitle:"2017 Toyota Highlander"',
    'intitle:"2016 Toyota Highlander"',
  ]);
  const q = seen[0].url.searchParams;
  check(
    "the query Commons is sent",
    seen[0].url.origin === "https://commons.wikimedia.org" && q.get("generator") === "search" && q.get("gsrnamespace") === "6" && q.get("gsrlimit") === "30" && q.get("iiurlwidth") === "960" && q.get("iiprop") === "url|extmetadata|size|mime",
    String(seen[0].url),
  );
  check(
    "it names itself, with a way to reach the business",
    seen.every((s) => /^AdedayoAremuAutos-CarCheck\/1\.0 \(\+https?:\/\/[^ ]+\/us\/contact\)$/.test(s.ua ?? "")),
    seen.map((s) => s.ua),
  );
  check("only the year, make and model are sent, never the VIN", seen.every((s) => !String(s.url).includes(VIN) && !String(s.url).includes("390174")));

  seen.length = 0;
  const silverado = n.summarizeDecode({ ModelYear: "2019", Make: "CHEVROLET", Model: "Silverado", Series: "1500", BodyClass: "Pickup" });
  check("nothing on Commons is no photo", (await ph.carPhotoUncached(silverado)) === null);
  eq(
    "one request at a time: each year under the series name, then the plain name",
    seen.map((s) => s.url.searchParams.get("gsrsearch")),
    ["2019", "2018", "2020"].flatMap((y) => [`intitle:"${y} Chevrolet Silverado 1500"`, `intitle:"${y} Chevrolet Silverado"`]),
  );

  errors.length = 0;
  ph.__setPhotoFetchForTests(async () => new Response("Too many requests", { status: 429, headers: { "content-type": "text/html" } }));
  check("a 429 is no photo, not an error on the page", (await ph.carPhotoUncached(highlander)) === null);
  check("and is logged without the car", errors.length === 1 && errors[0] === "[vin] photo: commons: HTTP 429", errors);
  ph.__setPhotoFetchForTests(async (_i, init) => {
    await new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    return json({});
  });
  const slow = Date.now();
  // AbortSignal.timeout's timer doesn't keep Node running; a server always
  // has something that does, this script needs one.
  const awake = setTimeout(() => undefined, 6_000);
  const never = await ph.carPhotoUncached(highlander);
  clearTimeout(awake);
  check("a reply that never comes is given up on after 4 seconds", never === null && Date.now() - slow < 4_600, Date.now() - slow);
}

/* ── Crash tests ──────────────────────────────────────────────────────── */
console.log("\nCrash-test stars: this car's version, and the others to compare");
{
  // The 2017 Highlander's three rated versions, as NHTSA gave them (Nov 2026).
  const rating = (id: number, description: string, risk: number) => [
    new RegExp(`VehicleId/${id}$`),
    { Results: [{ VehicleDescription: description, OverallRating: "5", OverallFrontCrashRating: "4", OverallSideCrashRating: "5", RolloverRating: "4", RolloverPossibility: risk }] },
  ] as const;
  const routes: (readonly [RegExp, unknown])[] = [
    [/SafetyRatings\/modelyear\/2017\/make\/TOYOTA$/, { Results: ["HIGHLANDER", "HIGHLANDER HYBRID", "RAV4"].map((Model) => ({ Model })) }],
    [/model\/HIGHLANDER$/, { Results: [{ VehicleId: 11155, VehicleDescription: "2017 Toyota Highlander SUV AWD" }, { VehicleId: 11154, VehicleDescription: "2017 Toyota Highlander SUV FWD" }] }],
    [/model\/HIGHLANDER%20HYBRID$/, { Results: [{ VehicleId: 11156, VehicleDescription: "2017 Toyota Highlander HV SUV AWD" }] }],
    rating(11155, "2017 Toyota Highlander SUV AWD", 0.169),
    rating(11154, "2017 Toyota Highlander SUV FWD", 0.185),
    rating(11156, "2017 Toyota Highlander HV SUV AWD", 0.169),
  ];
  const urls: string[] = [];
  n.__setFetchForTests(async (input) => {
    const url = String(input);
    urls.push(url);
    return json(routes.find(([re]) => re.test(url))?.[1] ?? { Count: 0, Results: [], results: [] });
  });
  const r = await n.uncached.crashRatings(2017, "TOYOTA", highlander.names, highlander.fit);
  eq("the VIN pins down the AWD (\"HV\" is the hybrid, not a tie)", r?.versions.map((v) => v.description), ["2017 Toyota Highlander SUV AWD"]);
  eq("with its rollover chance", r?.versions[0].rolloverRisk, 0.169);
  eq("the FWD and the hybrid are read to compare, closest first", r?.others.map((v) => v.description), ["2017 Toyota Highlander SUV FWD", "2017 Toyota Highlander HV SUV AWD"]);
  eq("and NHTSA rates no other versions", r?.otherCount, 2);
  check("the RAV4 is never read", !urls.some((u) => u.includes("RAV4")));
  eq("\"HV\" is a hybrid", n.readVersion("2017 Toyota Highlander HV SUV AWD").power, "hybrid");
  const pickup = n.siblingVersions(
    { description: "2019 Chevrolet Silverado 1500 PU/CC 4WD" },
    [{ description: "2019 Chevrolet Silverado 1500 PU/EC RWD" }, { description: "2019 Chevrolet Silverado 1500 PU/CC RWD" }],
    { doors: 4, cab: "CC", drive: "4WD", body: "pickup", power: "gas", words: [] },
  );
  eq("a crew cab is compared with crew cabs only", pickup.map((v) => v.description), ["2019 Chevrolet Silverado 1500 PU/CC RWD"]);
}

/* ── Complaints in plain groups ───────────────────────────────────────── */
console.log("\nComplaints grouped in plain words, each counted once per group");
{
  n.__setFetchForTests(async (input) => {
    const url = String(input);
    if (/complaintsByVehicle/.test(url)) {
      return json({
        results: [
          { odiNumber: 1, components: "SERVICE BRAKES,SERVICE BRAKES, HYDRAULIC" },
          { odiNumber: 2, components: "POWER TRAIN" },
          { odiNumber: 3, components: "POWER TRAIN,ELECTRICAL SYSTEM" },
          { odiNumber: 4, components: "UNKNOWN OR OTHER" },
        ],
      });
    }
    return json({ Count: 0, results: [], Results: [] }, 400);
  });
  const c = await n.uncached.complaintsForModel(2017, "TOYOTA", ["Highlander"]);
  eq("plain names, most first", c?.topAreas, [
    { area: "Transmission and drivetrain", count: 2 },
    { area: "Brakes", count: 1 },
    { area: "Electrical", count: 1 },
    { area: "Other", count: 1 },
  ]);
  eq("NHTSA's own parts are still counted as before", c?.topParts[0], { part: "POWER TRAIN", count: 2 });
  eq("the spec's names", ["STRUCTURE", "VISIBILITY", "SERVICE BRAKES, HYDRAULIC", "SOMETHING NEW"].map(plain.complaintArea), ["Body and frame", "Windows, wipers and mirrors", "Brakes", "Something New"]);
}

console.error = realError;
console.log(
  `\n${passed} passed, ${failed} failed.` +
    (failed ? "  \x1b[31mPLAIN-WORDS CAR CHECK WRONG\x1b[0m\n" : "  \x1b[32mPlain-words car check verified.\x1b[0m\n"),
);
process.exit(failed ? 1 : 0);
