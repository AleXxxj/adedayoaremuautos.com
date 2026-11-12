#!/usr/bin/env node
/**
 * What the car lists and car pages work out from a car's record
 * (src/components/cars/carData.ts).
 *
 * Runs on every build. Records are typed by hand, so the same thing is
 * spelled many ways, and these functions decide what a visitor sees: which
 * chip a car is counted under, what name a card shows, which cars a make
 * finds, which cars are "similar", and what a saved list may send to the
 * server. None of it can be tried by submitting forms from a laptop (the
 * database is production), so it is checked here, as pure functions, against
 * the cars as they were typed in November 2026.
 *
 * Run: npm run test:cars
 */

// Run via tsx, which resolves the @/ paths and extensionless imports as Next does.
import {
  INTEREST_CHOICES,
  MAX_SAVED,
  SLUGS_PER_REQUEST,
  bodyCounts,
  bodyTypeOf,
  brandOf,
  cardFor,
  compareHref,
  isJustIn,
  isSlug,
  makeMatches,
  makeOptions,
  parseBand,
  parseSlugList,
  priceCuts,
  roundFigure,
  shortDrive,
  shortFuel,
  shortTransmission,
  similarCars,
  slugRequests,
  slugsFrom,
  splitName,
  toggleSlug,
  withRecent,
  type PublicCar,
} from "../src/components/cars/carData";
import { MARKETS } from "../src/lib/market";

let passed = 0;
let failed = 0;

function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m\n      expected ${e}\n      got      ${a}`);
  }
}

const ok = (label: string, cond: boolean) => eq(label, cond, true);

// ── Body types, from body styles as they were typed ───────────────────────
console.log("\nBody types");
const body = (bodyStyle: string | null, model = "", trim: string | null = null) =>
  bodyTypeOf({ bodyStyle, model, trim });
eq("Sedan", body("Sedan"), "sedan");
eq("Suv", body("Suv"), "suv");
eq("4 - Door Sedan", body("4 - Door Sedan"), "sedan");
eq("a crossover described at length is an SUV, not a wagon", body("5 door crossover/ SUV (Wagon style crossover)"), "suv");
eq("Sport Utility", body("Sport Utility"), "suv");
eq("Pickup Truck", body("Pickup Truck"), "truck");
eq("Crew Cab", body("Crew Cab"), "truck");
eq("Minivan", body("Minivan"), "van");
eq("Passenger Van", body("Passenger Van"), "van");
eq("a Caravan is not read as a van from its name alone", body(null, "Grand Caravan"), null);
eq("Hatchback", body("Hatchback"), "hatchback");
eq("Hatchback Coupe is a hatchback", body("Hatchback Coupe"), "hatchback");
eq("Coupe", body("Coupe 2D"), "coupe");
eq("Station Wagon", body("Station Wagon"), "wagon");
eq("Convertible", body("Convertible"), "convertible");
eq("nothing on file, nothing in the name", body(null, "Camry"), null);
eq("a color typed in the body box says nothing", body("Biege", "Camry"), null);
eq("no body style: the trim says SUV", body(null, "Equinox", "LT Sport Utility 4D"), "suv");
eq("no body style: the model says sedan", body(null, "R/T Road Track Sedan 4D"), "sedan");
eq("the body style on file wins over the name", body("Sedan", "Soul", "+Wagon D4"), "sedan");

console.log("\nBody chips");
const lot = [
  { bodyStyle: "Sedan" },
  { bodyStyle: "4 - Door Sedan" },
  { bodyStyle: "Suv" },
  { bodyStyle: null, model: "Equinox", trim: "LT Sport Utility 4D" },
  { bodyStyle: "Biege", model: "Camry" },
];
eq("only types in stock, in chip order, with counts", bodyCounts(lot), [
  { key: "sedan", label: "Sedans", count: 2 },
  { key: "suv", label: "SUVs", count: 2 },
]);
eq("no cars, no chips", bodyCounts([]), []);
eq(
  "a chosen type stays, at zero, when the other filters leave it nothing",
  bodyCounts([{ bodyStyle: "Sedan" }], "truck"),
  [
    { key: "sedan", label: "Sedans", count: 1 },
    { key: "truck", label: "Trucks", count: 0 },
  ],
);

// ── Names ─────────────────────────────────────────────────────────────────
console.log("\nNames on a card");
const named = (year: number, make: string, model: string, trim: string | null = null) => {
  const n = splitName({ year, make, model, trim });
  return [n.kicker, n.name, n.detail];
};
eq("make, model, trim as they should be", named(2015, "Chevrolet", "Malibu", "LT Sedan 4D"), [
  "2015 · Chevrolet",
  "Malibu",
  "LT Sedan 4D",
]);
eq("the model typed into the make", named(2014, "Dodge Charger", "R/T Road Track Sedan 4D"), [
  "2014 · Dodge",
  "Charger",
  "R/T Road Track Sedan 4D",
]);
eq("make holding the model, with a trim", named(2016, "Nissan Altima", "Sedan 4D", "2.5 S"), [
  "2016 · Nissan",
  "Altima",
  "Sedan 4D 2.5 S",
]);
eq("a brand split across make and model", named(2012, "Mercedes", "Benz", "Glk"), [
  "2012 · Mercedes-Benz",
  "Glk",
  "",
]);
eq("a two-word brand in the make", named(2001, "Mercedes Benz", "S430"), ["2001 · Mercedes-Benz", "S430", ""]);
eq("a hyphenated brand", named(2019, "Mercedes-Benz", "C300"), ["2019 · Mercedes-Benz", "C300", ""]);
eq("Land Rover is one brand", named(2014, "Land Rover", "Range Rover", "Autobiography"), [
  "2014 · Land Rover",
  "Range Rover",
  "Autobiography",
]);
eq("a make we don't know stays whole", named(2016, "Elantra", "Sonata"), ["2016 · Elantra", "Sonata", ""]);
eq("no trim", named(2007, "Toyota", "Camry"), ["2007 · Toyota", "Camry", ""]);
eq("a brand that is only the start of a word is not that brand", named(2020, "Ramcharger", "Custom"), [
  "2020 · Ramcharger",
  "Custom",
  "",
]);
eq("extra spaces are tidied", named(2010, " Toyota  Venza ", "LE Sport utility 4D"), [
  "2010 · Toyota",
  "Venza",
  "LE Sport utility 4D",
]);
eq(
  "the whole name is kept as stored",
  splitName({ year: 2012, make: "Mercedes", model: "Benz", trim: "Glk" }).full,
  "2012 Mercedes Benz Glk",
);

console.log("\nThe make filter");
const makes = ["Toyota", "Toyota Venza", "Dodge Charger", "Dodge Dart", "Mercedes", "Mercedes Benz", "Elantra", "Kia"];
eq(
  "each brand once, in order",
  makeOptions(makes.map((make) => ({ make }))),
  ["Dodge", "Elantra", "Kia", "Mercedes-Benz", "Toyota"],
);
eq("brandOf: a make starting with a brand", brandOf("Toyota Venza"), "Toyota");
eq("brandOf: a make we don't know", brandOf("Elantra"), "Elantra");
ok("a brand finds its cars however the make was typed", makeMatches("Toyota Venza", "Toyota"));
ok("Mercedes-Benz finds a make of just Mercedes", makeMatches("Mercedes", "Mercedes-Benz"));
ok("Mercedes finds Mercedes Benz", makeMatches("Mercedes Benz", "Mercedes"));
ok("lower case from an old link", makeMatches("Toyota", "toyota"));
ok("a full make from an older link still matches exactly", makeMatches("Dodge Charger", "Dodge Charger"));
ok("and only exactly: not the other Dodge", !makeMatches("Dodge Dart", "Dodge Charger"));
ok("Dodge finds both", makeMatches("Dodge Dart", "Dodge") && makeMatches("Dodge Charger", "Dodge"));
ok("another brand does not match", !makeMatches("Toyota", "Kia"));
ok("an unknown make matches only itself", makeMatches("Elantra", "Elantra") && !makeMatches("Elantra GT", "Elantra"));

// ── Facts ─────────────────────────────────────────────────────────────────
console.log("\nFacts");
eq("CVT Automatic", shortTransmission("CVT Automatic"), "Automatic");
eq("6- speed Automatic", shortTransmission("6- speed Automatic"), "Automatic");
eq("5-speed manual", shortTransmission("5-speed manual"), "Manual");
eq("nothing on file", shortTransmission(null), null);
eq("FWD (Front Wheel Drive)", shortDrive("FWD (Front Wheel Drive)"), "FWD");
eq("All wheel drive", shortDrive("All wheel drive"), "AWD");
eq("4x4", shortDrive("4x4"), "4WD");
eq("Rear-wheel drive", shortDrive("Rear-wheel drive"), "RWD");
eq("Gasoline in the US", shortFuel("Gasoline", MARKETS.us), "Gas");
eq("Petrol in the US", shortFuel("Petrol", MARKETS.us), "Gas");
eq("Petrol in Nigeria", shortFuel("Petrol", MARKETS.ng), "Petrol");
eq("a hybrid is not gas", shortFuel("Gas/Electric Hybrid", MARKETS.us), "Hybrid");
eq("Diesel", shortFuel("Diesel", MARKETS.us), "Diesel");

console.log("\nJust in");
const now = new Date("2026-11-12T15:00:00Z");
ok("listed yesterday", isJustIn("2026-11-11T15:00:00Z", now));
ok("listed six days ago", isJustIn(new Date("2026-11-06T16:00:00Z"), now));
ok("listed eight days ago is not", !isJustIn("2026-11-04T15:00:00Z", now));
ok("never published is not", !isJustIn(null, now));
ok("a date in the future is not", !isJustIn("2026-11-20T15:00:00Z", now));
ok("nonsense is not", !isJustIn("soon", now));

// ── Cards ─────────────────────────────────────────────────────────────────
console.log("\nCards");
const altima: PublicCar = {
  slug: "2016-nissan-altima-sedan-4d-25-s",
  year: 2016,
  make: "Nissan Altima",
  model: "Sedan 4D",
  trim: "2.5 S",
  bodyStyle: "4 - Door Sedan",
  mileage: 157500,
  transmission: "CVT Automatic",
  fuelType: "Gasoline",
  drivetrain: "FWD (Front Wheel Drive)",
  seats: 5,
  image: null,
  pending: false,
  justIn: false,
  sale: { priceMinor: 590000 },
  rent: { dailyMinor: 12000, weeklyMinor: 70000, driver: true },
};
const sale = cardFor(altima, MARKETS.us, "sale");
eq("sale card: where it goes", sale.href, "/us/inventory/2016-nissan-altima-sedan-4d-25-s");
eq("sale card: facts", sale.facts, "157,500 mi · Automatic · FWD");
eq("sale card: price", [sale.price, sale.unit, sale.sub], ["$5,900", null, null]);
eq("sale card: no badge", sale.badge, null);
const rent = cardFor(altima, MARKETS.us, "rent");
eq("rental card: where it goes", rent.href, "/us/rentals/2016-nissan-altima-sedan-4d-25-s");
eq("rental card: facts", rent.facts, "Automatic · Gas · 5 seats");
eq("rental card: the week leads, the day follows", [rent.price, rent.unit, rent.sub], ["$700", "a week", "or $120 a day"]);
eq("rental card: badge", rent.badge, "Driver available");
const dayOnly = cardFor({ ...altima, rent: { dailyMinor: 8500, weeklyMinor: null, driver: false } }, MARKETS.us, "rent");
eq("no weekly rate: the day leads, alone", [dayOnly.price, dayOnly.unit, dayOnly.sub], ["$85", "a day", null]);
eq("a sale-only car on the rental list's saved view shows its sale price", cardFor({ ...altima, rent: null }, MARKETS.us, "rent").href, "/us/inventory/2016-nissan-altima-sedan-4d-25-s");
eq("a rental-only car on the sale list's saved view shows its rate", cardFor({ ...altima, sale: null }, MARKETS.us, "sale").unit, "a week");
eq("no price on file", cardFor({ ...altima, sale: { priceMinor: null } }, MARKETS.us, "sale").price, "Price on request");
eq("sale pending comes before just in", cardFor({ ...altima, pending: true, justIn: true }, MARKETS.us, "sale").badge, "Sale pending");
eq("just in", cardFor({ ...altima, justIn: true }, MARKETS.us, "sale").badge, "Just in");
eq("no mileage, no drive: what there is", cardFor({ ...altima, mileage: null, drivetrain: null }, MARKETS.us, "sale").facts, "Automatic · Gas");
eq("naira, kilometers", cardFor({ ...altima, sale: { priceMinor: 1_400_000_000 } }, MARKETS.ng, "sale").price.replace(/\s/g, ""), "₦14,000,000");

// ── Price bands on the rental list ────────────────────────────────────────
console.log("\nPrice bands");
eq("two leading digits", [roundFigure(17667), roundFigure(28834), roundFigure(4333333)], [18000, 29000, 4300000]);
eq("small figures stay whole", [roundFigure(7), roundFigure(85), roundFigure(0)], [7, 85, 0]);
// The US fleet's daily rates in November 2026, in cents.
eq(
  "the fleet's rates cut at round figures",
  priceCuts([6500, 8000, 8000, 8500, 10000, 10000, 10000, 12000, 15000, 35000, 40000]),
  [18000, 29000],
);
eq("one price, no bands", priceCuts([8500, 8500]), []);
eq("no cars, no bands", priceCuts([]), []);
eq("two close prices: a cut with nothing on one side is dropped", priceCuts([8500, 8600]), []);
eq("a band from the address", parseBand("18000-29000"), { lo: 18000, hi: 29000 });
eq("no upper end", parseBand("29000-"), { lo: 29000, hi: null });
eq("not a band", [parseBand("cheap"), parseBand("-5"), parseBand("1-2-3"), parseBand(null)], [null, null, null, null]);

// ── Similar cars ──────────────────────────────────────────────────────────
console.log("\nSimilar cars");
const c = (slug: string, bodyStyle: string | null, price: number | null) => ({ slug, bodyStyle, price });
const others = [
  c("suv-near", "Suv", 6000),
  c("sedan-far", "Sedan", 9000),
  c("sedan-near", "4 - Door Sedan", 5700),
  c("me", "Sedan", 5900),
  c("sedan-unpriced", "Sedan", null),
  c("suv-far", "Suv", 12500),
];
const like = (k: number) => similarCars(c("me", "Sedan", 5900), 5900, others, (car) => car.price, k).map((car) => car.slug);
eq("same body first, nearest price first, never itself", like(3), ["sedan-near", "sedan-far", "sedan-unpriced"]);
eq("then other bodies by price", like(5), ["sedan-near", "sedan-far", "sedan-unpriced", "suv-near", "suv-far"]);
eq(
  "a car with no body type: nearest price",
  similarCars(c("x", null, 6100), 6100, others, (car) => car.price, 2).map((car) => car.slug),
  ["suv-near", "me"],
);
eq("nothing else in stock", similarCars(c("me", "Sedan", 1), 1, [c("me", "Sedan", 1)], (car) => car.price), []);
eq("compare link", compareHref("us", "a-1", "b-2"), "/us/compare?cars=a-1,b-2");

// ── Slugs: what the cars route accepts and a browser keeps ────────────────
console.log("\nSlugs");
ok("a slug", isSlug("2011-acura-mdx-sport-utility-4d-base-wtechnology"));
ok("a slug with a doubled hyphen, as the admin can make", isSlug("2016-nissan-altima-4---door"));
ok("upper case is not", !isSlug("2016-Nissan"));
ok("a path is not", !isSlug("../admin"));
ok("a space is not", !isSlug("2016 nissan"));
ok("a query is not", !isSlug("a?b=c"));
ok("empty is not", !isSlug(""));
ok("121 characters is not", !isSlug("a".repeat(121)));
ok("a VIN is not: slugs are lower case", !isSlug("1HGCM82633A004352"));
eq("a list", parseSlugList("b-2,a-1"), ["b-2", "a-1"]);
eq("repeats are dropped", parseSlugList("a-1,a-1,b-2"), ["a-1", "b-2"]);
eq("one bad piece refuses the lot", parseSlugList("a-1,../etc"), null);
eq("an empty piece refuses the lot", parseSlugList("a-1,,b-2"), null);
eq("nothing", parseSlugList(""), null);
eq("missing", parseSlugList(null), null);
eq("twelve is the most", parseSlugList(Array.from({ length: 12 }, (_, i) => `car-${i}`).join(","))?.length, 12);
eq("thirteen is refused", parseSlugList(Array.from({ length: 13 }, (_, i) => `car-${i}`).join(",")), null);

console.log("\nSaved and recently viewed");
eq("stored list", slugsFrom('["a-1","b-2"]', MAX_SAVED), ["a-1", "b-2"]);
eq("anything that is not a slug is dropped", slugsFrom('["a-1",7,null,"B","<script>","a-1"]', MAX_SAVED), ["a-1"]);
eq("not a list", slugsFrom('{"a":1}', MAX_SAVED), []);
eq("not JSON", slugsFrom("a-1,b-2", MAX_SAVED), []);
eq("nothing stored", slugsFrom(null, MAX_SAVED), []);
eq("no more than the limit", slugsFrom(JSON.stringify(["a", "b", "c"]), 2), ["a", "b"]);
eq("save: newest first", toggleSlug(["a-1"], "b-2"), ["b-2", "a-1"]);
eq("save again: taken off", toggleSlug(["b-2", "a-1"], "b-2"), ["a-1"]);
eq("not a slug: unchanged", toggleSlug(["a-1"], "B 2"), ["a-1"]);
eq("the oldest goes when the list is full", toggleSlug(["b", "a"], "c", 2), ["c", "b"]);
eq("viewed: to the front", withRecent(["a-1", "b-2"], "b-2"), ["b-2", "a-1"]);
eq("viewed: no more than the limit", withRecent(["a", "b"], "c", 2), ["c", "a"]);
const many = Array.from({ length: 14 }, (_, i) => `car-${String(i).padStart(2, "0")}`).reverse();
const asked = slugRequests(many);
eq("fourteen saved cars are two requests", asked.map((r) => r.length), [SLUGS_PER_REQUEST, 2]);
ok("each request is sorted, so it caches", asked.every((r) => [...r].sort().join() === r.join()));
ok("every request is one the route accepts", asked.every((r) => parseSlugList(r.join(",")) !== null));

// ── "I'm interested" ──────────────────────────────────────────────────────
console.log("\nI'm interested");
eq("three choices", INTEREST_CHOICES.map((choice) => choice.sentence), [
  "Is it still available?",
  "Can I see it today?",
  "I want to buy it",
]);
eq("seeing it is a test drive; the others a general inquiry", INTEREST_CHOICES.map((choice) => choice.type), [
  "contact",
  "test_drive",
  "contact",
]);

console.log(
  `\n${passed} passed, ${failed} failed.` +
    (failed ? "  \x1b[31mCAR CHECKS FAILED\x1b[0m\n" : "  \x1b[32mCar lists and car pages verified.\x1b[0m\n"),
);
process.exit(failed ? 1 : 0);
