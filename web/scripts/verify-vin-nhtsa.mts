#!/usr/bin/env node
/**
 * The car check's NHTSA lookups, against canned replies.
 *
 * Runs the real src/lib/vin/nhtsa.ts with fetch replaced, so every way NHTSA
 * answers — including the ways it fails — can be produced on demand:
 * an HTML error page, a reply cut off halfway, "no match" as HTTP 400, a
 * model filed under another name. Each case here is one a review found
 * breaking the page or showing the wrong thing (Nov 2026).
 *
 * Run: npm run test:vin
 */
process.env.DATABASE_URL ??= "postgres://unused@localhost:5432/unused";
const n = await import("../src/lib/vin/nhtsa");

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

/* ── A fake NHTSA ─────────────────────────────────────────────────────── */

type Reply = { status?: number; type?: string; body?: unknown; cut?: boolean };
let routes: [RegExp, Reply][] = [];
const seen: { url: string; body?: string }[] = [];
const json = (body: unknown, status = 200): Reply => ({ status, body });

n.__setFetchForTests(async (input, init) => {
  const url = String(input);
  seen.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
  const r = routes.find(([re]) => re.test(url))?.[1] ?? json({ Count: 0, results: [], Results: [] });
  if (r.cut) {
    // Headers arrive, then the connection drops mid-body.
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"results":[{"components":'));
        c.error(new TypeError("terminated"));
      },
    });
    return new Response(stream, { status: 200, headers: { "content-type": "application/json" } });
  }
  const text = typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? {});
  return new Response(text, { status: r.status ?? 200, headers: { "content-type": r.type ?? "application/json" } });
});

const errors: string[] = [];
const realError = console.error;
console.error = (...a: unknown[]) => {
  errors.push(a.map(String).join(" "));
};

const VIN = "1HGBH41JXMN109186";

/** A car's matching details, with everything a test doesn't name unknown. */
const fit = (f: Partial<import("../src/lib/vin/nhtsa").VersionFit>): import("../src/lib/vin/nhtsa").VersionFit => ({
  doors: null,
  cab: null,
  drive: null,
  body: null,
  power: null,
  words: [],
  ...f,
});

/* ── Names ────────────────────────────────────────────────────────────── */
console.log("\nThe model names each lookup tries");
{
  const eq = (label: string, got: string[], want: string[]) =>
    check(label, JSON.stringify(got) === JSON.stringify(want), got);
  eq("Mercedes: the family, then the badge", n.nhtsaModelNames("C-Class", null, "C300"), ["C-Class", "C300"]);
  eq("Mercedes with a suffix: the badge only", n.nhtsaModelNames("GLE-Class", null, "GLE350-4M"), ["GLE-Class", "GLE350"]);
  eq(
    "Lexus: model plus trim number, never the list of codes",
    n.nhtsaModelNames("RX", "GYL25L/GGL25L/GGL20L/GYL26L/GGL21L/GGL26L", "350/350 F Sport"),
    ["RX", "RX350", "RX 350"],
  );
  eq("Lexus with words after the number", n.nhtsaModelNames("NX", "AGZ10L/AGZ15L/AYZ15L", "300 Luxury"), ["NX", "NX300", "NX 300"]);
  eq("a truck: model plus its load series", n.nhtsaModelNames("Silverado", "1500", "LT"), ["Silverado", "Silverado 1500"]);
  eq("a chassis code is not a series", n.nhtsaModelNames("Corolla", "ZRE172L", "L/LE/SE/XLE/XSE"), ["Corolla"]);
  eq(
    "a Mercedes decoded without its badge tries the family's badges, not 'C-Class4'",
    n.nhtsaModelNames("C-Class", null, "4-MATIC"),
    ["C-Class", "C250", "C300", "C350", "C400", "C450", "C500", "C550"],
  );
  eq("a model with a note in parentheses is looked up without it", n.nhtsaModelNames("RAV4 Prime (PHEV)", null, "SE"), ["RAV4 Prime"]);
  eq("a model named two ways is looked up both ways", n.nhtsaModelNames("Caravan/Grand Caravan", null, null), ["Caravan", "Grand Caravan"]);
  eq(
    "a Super Duty is also looked up as Ford files its recalls, \"F-250 SD\"",
    n.nhtsaModelNames("F-250", "F-Series Super Duty - Single Rear Wheel", "XLT"),
    ["F-250", "F-250 SD"],
  );
  eq("an AMG is looked up by its whole badge", n.nhtsaModelNames("C-Class", null, "AMG C43"), ["C-Class", "AMG C43"]);
  eq("a trim like \"SR5\" is not a model", n.nhtsaModelNames("Tacoma", "GRN305L", "SR5"), ["Tacoma"]);
  eq("an engine like \"I4\" is not a model", n.nhtsaModelNames("Mustang", null, "I4 Convertible"), ["Mustang"]);
  eq("a model NHTSA can't be asked about gives no names", n.nhtsaModelNames("Mod\u00e8le \u20ac", null, null), []);
  eq("BMW: vPIC's \"3-series\" is NHTSA's \"3 Series\"", n.nhtsaModelNames("328i", "3-series", null), ["328i", "3 Series"]);
  eq("MINI: the series is part of NHTSA's name", n.nhtsaModelNames("Hardtop", "Cooper", null, "MINI"), ["Hardtop", "Cooper Hardtop", "Cooper"]);
  eq("but only for MINI", n.nhtsaModelNames("Civic", "Sport", null, "HONDA"), ["Civic"]);
  eq("a plug-in hybrid is also looked up as NHTSA files plug-ins", n.powerNames("Pacifica", "plugin", "Limited"), ["Pacifica Hybrid", "Pacifica Plug-In Hybrid", "Pacifica PHEV"]);
  eq("a hybrid", n.powerNames("Ioniq", "hybrid", "Blue"), ["Ioniq Hybrid"]);
  eq("a 4xe", n.powerNames("Wrangler", "plugin", "Unlimited Sahara 4xe"), ["Wrangler Hybrid", "Wrangler Plug-In Hybrid", "Wrangler PHEV", "Wrangler 4xe"]);
  eq("a gasoline car gets none", n.powerNames("RAV4", "gas", "XLE"), []);

  const ford2015 = ["F-150 REGULAR CAB", "F-150 SUPER CREW", "F-150 SUPERCAB", "F-250 SUPER CREW", "MUSTANG"];
  eq(
    "complaints: a crew cab F-150 is looked up under the crew cab's name, once",
    n.expandNames(["F-150"], ford2015, { power: "gas", cab: "CC" }, "complaints"),
    ["F-150", "F-150 SUPER CREW"],
  );
  check(
    "with the cab unknown, one sibling (they hold the same complaints)",
    n.expandNames(["F-150"], ford2015, { power: null, cab: null }, "complaints").length === 2,
  );
  eq(
    "\"RX\" is not lengthened to the RX 350L when \"RX 350\" is on the list",
    n.expandNames(["RX", "RX350", "RX 350"], ["RX 350", "RX 350L", "RX 450H"], { power: "gas", cab: null }, "complaints"),
    ["RX", "RX350", "RX 350"],
  );
  eq(
    "a gasoline RAV4 is not given the hybrid's records",
    n.expandNames(["RAV4"], ["RAV4", "RAV4 HYBRID", "RAV4 PRIME"], { power: "gas", cab: null }, "recalls"),
    ["RAV4"],
  );
  eq(
    "a Tesla's version names are found",
    n.expandNames(["Model S"], ["MODEL S 70D", "MODEL S 90D", "MODEL X 90D"], { power: "electric", cab: null }, "complaints"),
    ["Model S", "MODEL S 70D"],
  );
  eq(
    "a separate model vPIC knows is never a version: no Rogue Sport records for a Rogue",
    n.expandNames(["Rogue"], ["ROGUE", "ROGUE SPORT"], { power: "gas", cab: null }, "complaints", ["Rogue", "Rogue Sport", "Altima"]),
    ["Rogue"],
  );
  eq(
    "nor a MINI Countryman's for a Hardtop, while the Hardtop's own names stay",
    // As decoded: vPIC's model ("Hardtop") first, then NHTSA's forms.
    n.expandNames(["Hardtop", "Cooper"], ["COOPER COUNTRYMAN", "COOPER S HARDTOP"], { power: null, cab: null }, "recalls", ["Hardtop", "Countryman"]),
    ["Hardtop", "Cooper", "COOPER S HARDTOP"],
  );
  check(
    "an F-150's cab names are versions, not separate models",
    !n.isSeparateModel("F-150 SUPERCAB", "F-150", ["F-150", "F-250", "Transit", "Transit Connect"], "F-150"),
  );
  eq(
    "a hybrid's complaints: the plain name and the hybrid's own",
    n.expandNames(["F-150"], ["F-150 SUPER CREW", "F-150 SUPER CREW HEV", "F-150 SUPER CREW DIESEL", "F-150 SUPERCAB"], { power: "hybrid", cab: "CC" }, "complaints"),
    ["F-150", "F-150 SUPER CREW", "F-150 SUPER CREW HEV"],
  );
  eq(
    "when NHTSA lists the name itself, another version's complaints stay out (no SRT for a Limited)",
    n.expandNames(["Grand Cherokee"], ["GRAND CHEROKEE", "GRAND CHEROKEE SRT"], { power: "gas", cab: null, words: ["LIMITED"] }, "complaints"),
    ["Grand Cherokee"],
  );
  eq(
    "and a diesel's stay out of a gasoline car's",
    n.expandNames(["Jetta"], ["JETTA", "JETTA TDI"], { power: "gas", cab: null, words: ["SE"] }, "complaints"),
    ["Jetta"],
  );
  eq(
    "but the car's own version is used: an Unlimited's trim names it",
    n.expandNames(["Wrangler"], ["WRANGLER", "WRANGLER UNLIMITED"], { power: "gas", cab: null, words: ["UNLIMITED", "SAHARA"] }, "complaints"),
    ["Wrangler", "WRANGLER UNLIMITED"],
  );
  eq(
    "and its cab: a 2017 F-150 crew cab gets \"F-150 CREW CAB\" beside \"F-150\"",
    n.expandNames(["F-150"], ["F-150", "F-150 CREW CAB", "F-150 REGULAR CAB"], { power: "gas", cab: "CC", words: [] }, "complaints"),
    ["F-150", "F-150 CREW CAB"],
  );
  eq(
    "recalls also take the family a variant belongs to",
    n.expandNames(["Civic Type R"], ["CIVIC", "CIVIC SI", "CIVIC TYPE R", "PILOT"], { power: "gas", cab: null }, "recalls"),
    ["Civic Type R", "CIVIC"],
  );
  check(
    "no name ever carries a slash or a comma",
    [
      n.nhtsaModelNames("RX", "A/B", "350/F"),
      n.nhtsaModelNames("Camry", "AXVA70L/GSV70L", "L/LE/SE/XLE"),
      n.nhtsaModelNames("X/Y", null, null),
    ]
      .flat()
      .every((x) => !/[/,]/.test(x)),
  );
}

/* ── Decode ───────────────────────────────────────────────────────────── */
console.log("\nDecoding a VIN");
{
  routes = [
    [
      /DecodeVINValuesBatch/,
      json({
        Results: [
          {
            ModelYear: "2019",
            Make: "CHEVROLET",
            Model: "Silverado",
            Series: "1500",
            Trim: "LT",
            BodyClass: "Pickup",
            BodyCabType: "Crew/Super Crew/Crew Max",
            Doors: "4",
            DriveType: "4WD/4-Wheel Drive/4x4",
            ErrorCode: "4",
            ErrorText: "4 - VIN corrected, error in one position only (indicated by ! in Suggested VIN), multiple matches found",
            PlantCountry: "UNITED STATES (USA)",
          },
        ],
      }),
    ],
  ];
  seen.length = 0;
  const car = await n.uncached.decodeVin(VIN);
  const call = seen.at(-1);
  check("the VIN goes in the request body", !!call?.body?.includes(VIN), call);
  check("and never in the URL", !!call && !call.url.includes(VIN), call?.url);
  check("names to look it up under", JSON.stringify(car?.names) === '["Silverado","Silverado 1500"]', car?.names);
  check(
    "doors, cab and drive, for matching crash tests",
    car?.fit.doors === 4 && car.fit.cab === "CC" && car.fit.drive === "4WD",
    car?.fit,
  );
  check(
    "NHTSA's warning in plain words, not its code text",
    car?.warnings.length === 1 && !car.warnings[0].includes("Suggested VIN") && car.warnings[0].includes("guess"),
    car?.warnings,
  );
  check("the plant country without its abbreviation", car?.builtIn === "UNITED STATES", car?.builtIn);

  routes = [[/DecodeVINValuesBatch/, json({ Results: [{ ModelYear: "2018", Make: "TOYOTA", Model: "Camry", Series: "AXVA70L/GSV70L/AXVH70L/AXVH71L", Trim: "L/LE/SE/XLE", DriveType: "AWD/All-Wheel Drive" }] })]];
  const camry = await n.uncached.decodeVin(VIN);
  check("a list of codes is not shown as the series or trim", camry?.series === null && camry?.trim === null, camry);
  check("all-wheel drive is read", camry?.fit.drive === "AWD", camry?.fit);

  const decodeAs = async (v: Record<string, string>) => {
    routes = [[/DecodeVINValuesBatch/, json({ Results: [{ ModelYear: "2019", Make: "TOYOTA", ...v }] })]];
    return n.uncached.decodeVin(VIN);
  };
  const tacoma = await decodeAs({ Model: "Tacoma", Series: "GRN305L", Series2: "Double Cab", Trim: "SR5", BodyClass: "Pickup", BodyCabType: "Extra/Super/Quad/Double/King/Extended" });
  check("a Tacoma Double Cab matches NHTSA's crew cab", tacoma?.fit.cab === "CC", tacoma?.fit);
  check("and its chassis code is not shown as a series", tacoma?.series === null && tacoma?.trim === "SR5", tacoma);
  const access = await decodeAs({ Model: "Tacoma", Series2: "Access Cab", BodyClass: "Pickup", BodyCabType: "Extra/Super/Quad/Double/King/Extended" });
  check("a Tacoma Access Cab is an extended cab, though vPIC's label also says \"Double\"", access?.fit.cab === "EC", access?.fit);
  const gle = await decodeAs({ Make: "MERCEDES-BENZ", Model: "GLE-Class", Trim: "GLE350" });
  check("a Mercedes badge stays in the car's name", gle?.trim === "GLE350", gle);
  const pacifica = await decodeAs({ Make: "CHRYSLER", Model: "Pacifica", FuelTypePrimary: "Gasoline", ElectrificationLevel: "PHEV (Plug-in Hybrid Electric Vehicle)" });
  check("a plug-in's names include its own", !!pacifica?.names.includes("Pacifica Plug-In Hybrid") && pacifica.names[0] === "Pacifica", pacifica?.names);
  const older = await decodeAs({ Model: "Camry", FuelTypePrimary: "Gasoline", FuelTypeSecondary: "Electric" });
  check("an older decode with electricity as the second fuel is a hybrid", older?.fit.power === "hybrid", older?.fit);
  const tundra = await decodeAs({ Model: "Tundra", Series2: "Double Cab", BodyClass: "Pickup", BodyCabType: "Extra/Super/Quad/Double/King/Extended" });
  check("a Tundra Double Cab matches NHTSA's extended cab", tundra?.fit.cab === "EC", tundra?.fit);
  const hybrid = await decodeAs({ Model: "RAV4", BodyClass: "Sport Utility Vehicle [SUV]/Multipurpose Vehicle [MPV]", FuelTypePrimary: "Gasoline", ElectrificationLevel: "Strong HEV (Hybrid Electric Vehicle)" });
  check("a hybrid SUV is read as one", hybrid?.fit.power === "hybrid" && hybrid.fit.body === "suv", hybrid?.fit);
  const mild = await decodeAs({ Model: "1500", FuelTypePrimary: "Gasoline", ElectrificationLevel: "Mild HEV (Hybrid Electric Vehicle)" });
  check("a mild hybrid is rated as the gasoline car", mild?.fit.power === "gas", mild?.fit);
  const plugin = await decodeAs({ Model: "RAV4 Prime (PHEV)", FuelTypePrimary: "Gasoline", ElectrificationLevel: "PHEV (Plug-in Hybrid Electric Vehicle)" });
  check("a plug-in hybrid is read as one", plugin?.fit.power === "plugin", plugin?.fit);
  const civic = await decodeAs({ Model: "Civic", Trim: "Type R", BodyClass: "Hatchback/Liftback/Notchback", Doors: "5" });
  check("a hatchback with five doors", civic?.fit.body === "hatchback" && civic.fit.doors === 5, civic?.fit);
  check("the trim's words, \"Type R\" also as \"TYPER\"", !!civic?.fit.words.includes("TYPER"), civic?.fit.words);
  const lt = await decodeAs({ Model: "Silverado", Series: "1500", Trim: "LT (1LT)" });
  check("a trim's code in parentheses is not shown", lt?.trim === "LT" && lt.series === "1500", lt);

  check("several codes, several sentences", n.decodeWarnings("1,14").length === 2);
  check("an unknown code still says something", n.decodeWarnings("99")[0]?.length > 10);
  check("a clean decode says nothing", n.decodeWarnings("0").length === 0);
}

/* ── Failures ─────────────────────────────────────────────────────────── */
console.log("\nWhen NHTSA fails, the page says so instead of breaking");
{
  errors.length = 0;
  routes = [[/DecodeVINValuesBatch/, { status: 503, type: "text/html", body: "<html>down</html>" }]];
  check("a decoder outage is null, not an exception", (await n.uncached.decodeVin(VIN)) === null);
  check("and the log line has no VIN in it", errors.length > 0 && errors.every((e) => !e.includes(VIN)), errors);

  routes = [[/SafetyRatings\/modelyear/, { status: 400, type: "text/html", body: "<html>Bad Request</html>" }]];
  check("an HTML 400 is an outage, not a crash", (await n.uncached.crashRatings(2018, "LEXUS", ["RX"], fit({ doors: null, cab: null, drive: null }))) === null);

  routes = [[/complaintsByVehicle/, { cut: true }]];
  check("a reply cut off halfway is null", (await n.uncached.complaintsForModel(2019, "CHEVROLET", ["Silverado"])) === null);

  routes = [[/recallsByVehicle/, json({ Count: 0, Message: "No results found for this request", results: [] }, 400)]];
  const none = await n.uncached.recallsForModel(2019, "CHEVROLET", ["Silverado"]);
  check("NHTSA's JSON 400 for no match is an empty list, not an outage", none !== null && none.list.length === 0, none);

  routes = [
    [/model=C-Class/, json({ results: [] })],
    [/model=C300/, { status: 500, type: "text/html", body: "oops" }],
  ];
  check(
    "if any name fails, recalls are an outage, not a partial list cached for a day",
    (await n.uncached.recallsForModel(2015, "MERCEDES-BENZ", ["C-Class", "C300"])) === null,
  );

  routes = [
    [/complaintsByVehicle.*model=RX&/, { status: 500, type: "text/html", body: "oops" }],
    [/complaintsByVehicle.*model=RX350/, json({ results: [{ odiNumber: 1, components: "ENGINE" }] })],
  ];
  routes = [
    [/products\/vehicle\/models/, { status: 503, type: "text/html", body: "down" }],
    [/recallsByVehicle/, json({ results: [] })],
  ];
  check(
    "if NHTSA's list of names can't be read, recalls are an outage, not a shorter list",
    (await n.uncached.recallsForModel(2018, "CHRYSLER", ["Pacifica"])) === null,
  );

  check(
    "if any name fails, complaints are an outage, not a smaller count",
    (await n.uncached.complaintsForModel(2018, "LEXUS", ["RX", "RX350"])) === null,
  );

  seen.length = 0;
  routes = [];
  const nameless = await Promise.all([
    n.uncached.recallsForModel(2019, "X", []),
    n.uncached.complaintsForModel(2019, "X", []),
    n.uncached.crashRatings(2019, "X", [], fit({})),
  ]);
  check(
    "with no name to ask under, each part is unavailable, never \"none on file\"",
    nameless.every((x) => x === null) && seen.length === 0,
    nameless,
  );
}

/* ── Names that differ between NHTSA's databases ──────────────────────── */
console.log("\nFinding a model filed under another name");
{
  const recall = (campaign: string, date: string) => ({
    NHTSACampaignNumber: campaign,
    ReportReceivedDate: date,
    Component: "AIR BAGS",
    Summary: "s",
    parkIt: false,
    parkOutSide: false,
  });
  routes = [
    [/recallsByVehicle.*model=C-Class/, json({ Count: 0, results: [] }, 400)],
    [
      /recallsByVehicle.*model=C300/,
      json({ results: [recall("15V001000", "02/01/2015"), recall("16V002000", "03/02/2016"), recall("15E003000", "04/03/2015")] }),
    ],
  ];
  const r = await n.uncached.recallsForModel(2015, "MERCEDES-BENZ", ["C-Class", "C300"]);
  check("the C300's recalls are found for a C-Class", r?.list.length === 2, r);
  check("and labeled with the name they were found under", JSON.stringify(r?.foundUnder) === '["C300"]', r?.foundUnder);
  check("equipment campaigns are left out", !r?.list.some((x) => x.campaign.charAt(2) === "E"));
  check("newest first", r?.list[0]?.campaign === "16V002000", r?.list.map((x) => x.campaign));

  routes = [
    [/recallsByVehicle.*model=RX&/, json({ results: [recall("18V001000", "01/01/2018")] })],
    [/recallsByVehicle.*model=RX350/, json({ results: [recall("18V001000", "01/01/2018"), recall("19V002000", "01/01/2019")] })],
  ];
  const both = await n.uncached.recallsForModel(2018, "LEXUS", ["RX", "RX350"]);
  check("a recall listed under two names counts once", both?.list.length === 2, both?.list.map((x) => x.campaign));

  routes = [
    [/complaintsByVehicle.*model=RX&/, json({ count: 0, results: [] }, 400)],
    [
      /complaintsByVehicle.*model=RX350/,
      json({
        results: [
          { odiNumber: 1, components: "SERVICE BRAKES, HYDRAULIC,ENGINE", crash: true, fire: false, numberOfInjuries: 1 },
          { odiNumber: 2, components: "SERVICE BRAKES, HYDRAULIC", crash: false, fire: false, numberOfInjuries: 0 },
        ],
      }),
    ],
  ];
  const c = await n.uncached.complaintsForModel(2018, "LEXUS", ["RX", "RX350"]);
  check("complaints are found under the badge", c?.total === 2 && JSON.stringify(c.foundUnder) === '["RX350"]', c);

  routes = [
    [/products\/vehicle\/models.*issueType=r/, json({ results: [{ model: "PACIFICA" }, { model: "PACIFICA PHEV" }] })],
    [/recallsByVehicle.*model=Pacifica&/, json({ results: [recall("18V524000", "01/08/2018")] })],
    [/recallsByVehicle.*model=Pacifica%20Hybrid&/, json({ results: [{ ...recall("22V077000", "01/02/2022"), parkOutSide: true }] })],
    [/recallsByVehicle.*model=Pacifica%20Plug-In%20Hybrid&/, json({ results: [recall("18V524000", "01/08/2018"), { ...recall("24V536000", "01/08/2024"), parkOutSide: true }] })],
  ];
  const ph = await n.uncached.recallsForModel(2018, "CHRYSLER", ["Pacifica", "Pacifica Hybrid", "Pacifica Plug-In Hybrid", "Pacifica PHEV"], { power: "plugin", cab: null });
  check(
    "a plug-in hybrid's own fire recalls are found, each once",
    ph?.list.length === 3 && ph.list.filter((r) => r.parkOutside).length === 2,
    ph?.list.map((r) => r.campaign),
  );

  // A 2018 Lexus IS: 3 under "IS", 6 under "IS300", one of them filed under both.
  routes = [
    [/complaintsByVehicle.*model=IS&/, json({ results: [{ odiNumber: 10, components: "ENGINE" }, { odiNumber: 11, components: "ENGINE" }, { odiNumber: 12, components: "ENGINE" }] })],
    [/complaintsByVehicle.*model=IS300/, json({ results: [12, 13, 14, 15, 16, 17].map((id) => ({ odiNumber: id, components: "STEERING" })) })],
  ];
  const is = await n.uncached.complaintsForModel(2018, "LEXUS", ["IS", "IS300"]);
  check("complaints under every name, each complaint once", is?.total === 8 && JSON.stringify(is.foundUnder) === '["IS","IS300"]', is);
  check(
    "a part with a comma in its name stays one part",
    c?.topParts[0]?.part === "SERVICE BRAKES, HYDRAULIC" && c.topParts[0].count === 2,
    c?.topParts,
  );
  check(
    "the parts split",
    JSON.stringify(n.complaintParts("SERVICE BRAKES, HYDRAULIC,FUEL SYSTEM, GASOLINE,ENGINE")) ===
      '["SERVICE BRAKES, HYDRAULIC","FUEL SYSTEM, GASOLINE","ENGINE"]',
  );
}

/* ── Which crash-tested version ───────────────────────────────────────── */
console.log("\nCrash-test stars for the right version");
{
  const v = (description: string, overall: string | null) => ({ description, overall, front: "4", side: "5", rollover: "4" });
  const silverado = [
    v("2019 Chevrolet Silverado 1500 PU/EC RWD", "5"),
    v("2019 Chevrolet Silverado 1500 PU/EC 4WD", "5"),
    v("2019 Chevrolet Silverado 1500 PU/CC 4WD", "4"),
    v("2019 Chevrolet Silverado 1500 PU/CC RWD", "4"),
    v("2019 Chevrolet Silverado 1500 PU/RC RWD", "5"),
    v("2019 Chevrolet Silverado 1500 PU/RC 4WD", "5"),
  ];
  const crew = n.pickVersions(silverado, fit({ doors: 4, cab: "CC", drive: "4WD" }));
  check("a crew-cab 4WD gets the crew cab's 4 stars, not the extended cab's 5", crew.length === 1 && crew[0].overall === "4" && crew[0].description.includes("PU/CC 4WD"), crew);

  const cClass = [
    v("2015 Mercedes-Benz C-Class 2 DR RWD", null),
    v("2015 Mercedes-Benz C-Class 2 DR 4WD", null),
    v("2015 Mercedes-Benz C-Class 4 DR RWD", "4"),
    v("2015 Mercedes-Benz C-Class 4 DR 4WD", "4"),
  ];
  const sedan = n.pickVersions(cClass, fit({ doors: 4, cab: null, drive: "AWD" }));
  check("a 4MATIC sedan gets the 4-door 4WD rating, not the unrated coupe", sedan.length === 1 && sedan[0].description.includes("4 DR 4WD"), sedan);

  const read = n.readVersion("2015 Mercedes-Benz C-Class 4 DR 4WD");
  check("\"C-Class\" is not read as a convertible", read.body === "closed" && read.doors === 4 && read.drive === "4WD", read);
  const f150 = n.readVersion("2018 Ford F-150 Super Crew PU/CC 4x4");
  check("Ford's \"4x4\" is four-wheel drive", f150.drive === "4WD" && f150.cab === "CC" && f150.body === "pickup", f150);
  check("\"5 HB\" is a five-door hatchback", JSON.stringify(n.readVersion("2016 Mazda Mazda3 5 HB FWD")) === JSON.stringify({ doors: 5, cab: null, drive: "FWD", body: "hatchback", power: null }));
  check("\"PRIME\" is a plug-in", n.readVersion("2021 Toyota RAV4 PRIME SUV AWD").power === "plugin");
  const later = n.readVersion("2022 Nissan Rogue SUV FWD Later Release");
  check("a note after the drive doesn't hide the drive and body", later.drive === "FWD" && later.body === "suv", later);
  const sab = n.readVersion("2015 Mercedes-Benz C-Class 4 DR 4WD W/ SAB");
  check("nor \"W/ SAB\"", sab.drive === "4WD" && sab.doors === 4 && sab.body === "closed", sab);
  const titan = n.readVersion("2019 Nissan Titan Crew Cab AWD");
  check("a cab in words is read", titan.cab === "CC" && titan.body === "pickup", titan);
  check("a rated name in parentheses is kept", n.ratedModelsFor(["MODEL S (ALL VARIANTS)", "MODEL X"], ["Model S"]).map((m) => m.model).join() === "MODEL S (ALL VARIANTS)");

  const mustang = [v("2018 Ford Mustang C RWD", "5"), v("2018 Ford Mustang 2 DR RWD", "4")];
  const soft = n.pickVersions(mustang, fit({ doors: 2, drive: "RWD", body: "convertible" }));
  check("a convertible gets the convertible's stars", soft.length === 1 && soft[0].description.endsWith("C RWD"), soft);
  const coupe = n.pickVersions(mustang, fit({ doors: 2, drive: "RWD", body: "closed" }));
  check("a coupe gets the coupe's", coupe.length === 1 && coupe[0].description.endsWith("2 DR RWD"), coupe);

  const mazda = [v("2016 Mazda Mazda3 5 HB FWD", "5"), v("2016 Mazda Mazda3 4 DR FWD", "4")];
  const hatch = n.pickVersions(mazda, fit({ doors: 5, drive: "FWD", body: "hatchback" }));
  check("a hatchback gets the hatchback's", hatch.length === 1 && hatch[0].overall === "5", hatch);

  const tacomaVersions = ["PU/CC 4WD", "PU/CC 2WD", "PU/EC 4WD", "PU/EC 2WD"].map((x) => v(`2019 Toyota Tacoma ${x}`, "4"));
  const double = n.pickVersions(tacomaVersions, fit({ doors: 4, cab: "CC", drive: "4WD", body: "pickup" }));
  check("a Tacoma Double Cab 4x4 gets the crew cab 4WD", double.length === 1 && double[0].description.endsWith("PU/CC 4WD"), double);

  const bmw = [
    { ...v("2015 BMW 328 I 4 DR RWD", "5"), extra: [] },
    { ...v("2015 BMW 328I Xdrive SW AWD", "4"), extra: ["XDRIVE"] },
    { ...v("2015 BMW 328 I Xdrive 4 DR AWD", "5"), extra: ["XDRIVE"] },
  ];
  const xdrive = n.pickVersions(bmw, fit({ doors: 4, drive: "AWD", body: "closed", words: ["XDRIVE"] }));
  check("a 328i xDrive sedan gets the xDrive sedan, not the wagon or the rear-drive car", xdrive.length === 1 && xdrive[0].description.endsWith("Xdrive 4 DR AWD"), xdrive);

  const rav4 = [v("2021 Toyota RAV4 SUV AWD", "5"), v("2021 Toyota RAV4 HYBRID SUV AWD", "4"), v("2021 Toyota RAV4 PRIME SUV AWD", "3")];
  const gas = n.pickVersions(rav4, fit({ drive: "AWD", body: "suv", power: "gas" }));
  check("a gasoline RAV4 is not given the hybrid's stars", gas.length === 1 && gas[0].overall === "5", gas);
  const hy = n.pickVersions(rav4, fit({ drive: "AWD", body: "suv", power: "hybrid" }));
  check("and a hybrid gets the hybrid's", hy.length === 1 && hy[0].overall === "4", hy);

  const drives = n.pickVersions([v("X 4 DR FWD", "4"), v("X 4 DR 2WD", "5")], fit({ drive: "RWD" }));
  check("rear-wheel drive is closer to \"2WD\" than to front-wheel drive", drives.length === 1 && drives[0].overall === "5", drives);

  const ram = [v("2019 Ram 1500 Crew PU/CC 4WD", "4"), { ...v("2019 Ram 1500 Classic Crew PU/CC 4WD", "3"), extra: ["CLASSIC"] }];
  check(
    "a Ram 1500 that vPIC can't tell from the Classic keeps both versions",
    n.pickVersions(ram, fit({ cab: "CC", drive: "4WD", body: "pickup", words: ["SLT"] })).length === 2,
  );

  const models = (rated: string[], names: string[]) => n.ratedModelsFor(rated, names).map((m) => m.model);
  const eqm = (label: string, got: string[], want: string[]) => check(label, JSON.stringify(got) === JSON.stringify(want), got);
  eqm(
    "BMW: the model NHTSA rates as it is, and the longer names beside it",
    models(["320I", "328I", "328I XDRIVE", "328I XDRIVE GT", "335I"], ["328i"]),
    ["328I", "328I XDRIVE", "328I XDRIVE GT"],
  );
  check(
    "with the words each longer name adds",
    JSON.stringify(n.ratedModelsFor(["328I", "328I XDRIVE GT"], ["328i"]).map((m) => m.extra)) === '[[],["XDRIVE","GT"]]',
  );
  eqm(
    "F-150: rated only under its cabs, so the longer names are read",
    models(["F-150 REGULAR CAB", "F-150 SUPER CREW", "F-150 SUPERCAB", "F-250 CREW CAB", "MUSTANG"], ["F-150"]),
    ["F-150 REGULAR CAB", "F-150 SUPER CREW", "F-150 SUPERCAB"],
  );
  eqm(
    "Silverado: the 1500 is rated as it is, so no 2500 or 3500",
    models(["SILVERADO 1500", "SILVERADO 2500", "SILVERADO 3500", "SILVERADO LD 1500"], ["Silverado", "Silverado 1500"]),
    ["SILVERADO 1500"],
  );
  eqm("Ram: the 1500 and the 1500 Classic", models(["1500", "1500 CLASSIC", "2500", "PROMASTER"], ["1500"]), ["1500", "1500 CLASSIC"]);
  eqm("Lexus: the RX350, not the RX350L", models(["RX350", "RX350L", "RX450H"], ["RX", "RX350"]), ["RX350"]);

  const rx = [v("2018 Lexus RX350 SUV AWD", "5"), v("2018 Lexus RX350 SUV FWD", "4")];
  check("drive decides between versions", n.pickVersions(rx, fit({ doors: null, cab: null, drive: "FWD" }))[0]?.overall === "4");
  check("with nothing to go on, every version is kept", n.pickVersions(rx, fit({ doors: null, cab: null, drive: null })).length === 2);

  const stars = (id: number, description: string, overall: string): [RegExp, Reply] => [
    new RegExp(`VehicleId/${id}$`),
    json({ Results: [{ VehicleDescription: description, OverallRating: overall, OverallFrontCrashRating: "4", OverallSideCrashRating: "5", RolloverRating: "4" }] }),
  ];
  routes = [
    [/SafetyRatings\/modelyear\/2019\/make\/CHEVROLET$/, json({ Results: [{ Model: "SILVERADO 1500" }, { Model: "SILVERADO 2500" }] })],
    [
      /SafetyRatings\/modelyear\/2019\/make\/CHEVROLET\/model\/SILVERADO%201500$/,
      json({
        Results: [
          { VehicleId: 1, VehicleDescription: "2019 Chevrolet Silverado 1500 PU/EC RWD" },
          { VehicleId: 2, VehicleDescription: "2019 Chevrolet Silverado 1500 PU/CC 4WD" },
        ],
      }),
    ],
    stars(1, "2019 Chevrolet Silverado 1500 PU/EC RWD", "5"),
    stars(2, "2019 Chevrolet Silverado 1500 PU/CC 4WD", "4"),
  ];
  seen.length = 0;
  const live = await n.uncached.crashRatings(2019, "CHEVROLET", ["Silverado", "Silverado 1500"], fit({ doors: 4, cab: "CC", drive: "4WD" }));
  check("end to end: the series name is found, and the crew cab is picked", live?.versions.length === 1 && live.versions[0].overall === "4", live);
  check(
    "stars are fetched only for the version that matches, and the 2500 is never read",
    !seen.some((x) => /VehicleId\/1$/.test(x.url) || x.url.includes("2500")),
    seen.map((x) => x.url),
  );

  routes = [
    [/SafetyRatings\/modelyear\/2018\/make\/FORD$/, json({ Results: ["F-150 REGULAR CAB", "F-150 SUPER CREW", "F-150 SUPERCAB", "MUSTANG"].map((Model) => ({ Model })) })],
    [/model\/F-150%20REGULAR%20CAB$/, json({ Results: [{ VehicleId: 11, VehicleDescription: "2018 Ford F-150 Regular Cab PU/RC 4x4" }, { VehicleId: 12, VehicleDescription: "2018 Ford F-150 Regular Cab PU/RC 4x2" }] })],
    [/model\/F-150%20SUPER%20CREW$/, json({ Results: [{ VehicleId: 21, VehicleDescription: "2018 Ford F-150 Super Crew PU/CC 4x4" }, { VehicleId: 22, VehicleDescription: "2018 Ford F-150 Super Crew PU/CC 4x2" }] })],
    [/model\/F-150%20SUPERCAB$/, json({ Results: [{ VehicleId: 31, VehicleDescription: "2018 Ford F-150 SuperCab PU/EC 4x4" }] })],
    stars(21, "2018 Ford F-150 Super Crew PU/CC 4x4", "4"),
  ];
  seen.length = 0;
  const ford = await n.uncached.crashRatings(2018, "FORD", ["F-150"], fit({ cab: "CC", drive: "4WD", body: "pickup" }));
  check(
    "an F-150, rated only under its cabs, gets the SuperCrew 4x4's stars",
    ford?.versions.length === 1 && ford.versions[0].description.endsWith("Super Crew PU/CC 4x4"),
    ford,
  );
  check("and the Mustang's list is never read", !seen.some((x) => x.url.includes("MUSTANG")));

  routes = [
    [/SafetyRatings\/modelyear\/2019\/make\/RAM$/, json({ Results: [{ Model: "1500" }, { Model: "1500 CLASSIC" }] })],
    [/model\/1500$/, json({ Results: [{ VehicleId: 41, VehicleDescription: "2019 Ram 1500 Crew PU/CC 4WD" }] })],
    [/model\/1500%20CLASSIC$/, json({ Results: [{ VehicleId: 51, VehicleDescription: "2019 Ram 1500 Classic Crew PU/CC 4WD" }] })],
    stars(41, "2019 Ram 1500 Crew PU/CC 4WD", "4"),
    [/VehicleId\/51$/, { status: 502, type: "text/html", body: "bad gateway" }],
  ];
  check(
    "if one of the matching versions fails, ratings are an outage, not the other version's stars",
    (await n.uncached.crashRatings(2019, "RAM", ["1500"], fit({ cab: "CC", drive: "4WD", body: "pickup" }))) === null,
  );
  routes[routes.length - 1] = [/VehicleId\/51$/, json({ Results: [] })];
  check(
    "nor if one comes back empty",
    (await n.uncached.crashRatings(2019, "RAM", ["1500"], fit({ cab: "CC", drive: "4WD", body: "pickup" }))) === null,
  );

  routes = [[/SafetyRatings\/modelyear/, json({ Results: [] })]];
  const unrated = await n.uncached.crashRatings(2008, "TOYOTA", ["Camry"], fit({ doors: 4, cab: null, drive: "FWD" }));
  check("no versions on file is an empty list, which the page words differently from an outage", unrated !== null && unrated.versions.length === 0, unrated);
}

console.error = realError;
console.log(
  `\n${passed} passed, ${failed} failed.` +
    (failed ? "  \x1b[31mNHTSA LOOKUPS WRONG\x1b[0m\n" : "  \x1b[32mNHTSA lookups verified.\x1b[0m\n"),
);
process.exit(failed ? 1 : 0);
