#!/usr/bin/env node
/**
 * The guides and compare: their arithmetic, their words, and the promises
 * they make about other pages.
 *
 * Runs on every build. Everything a visitor acts on here is a number worked
 * out from stock (what a car costs for four weeks, which of three ways is
 * lowest, what a budget buys, which of two cars is the better value), so it
 * is checked as pure functions against fixed stock, with no database:
 *
 *   1. Weeks to cost, against quoteRental (the booking form's own pricing).
 *   2. Rent, buy or rent to own: the true minimum, and where rent passes a price.
 *   3. Budgets: who fits, the typical year and miles, thin and empty stock.
 *   4. Compare: the link's slugs, "better" marks, the difference sentences,
 *      features, popular pairs.
 *   5. Every guide's words: title and description lengths, the search phrase
 *      where it has to be, questions with answers, no hype, and no credit
 *      terms anywhere in the rent-vs-buy guide.
 *   6. What the guides restate from other pages is still what those pages
 *      say: the rental policy, and the rent-to-own disclosure, word for word.
 *   7. The checklist: its shape, its tally, and the text it shares.
 *   8. The games: the quiz's scoring and what each result shows, how a
 *      round of "guess the price" is dealt and scored, every way through
 *      the story reaching an ending, every recall card with its source, the
 *      trip's cost against quoteRental, and what a shared link may carry.
 *
 * Nothing here touches the live database or the network.
 *
 * Run: npm run test:guides
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { quoteRental, type RentalTariff } from "../src/lib/rental";
import { pathToOwnership, type OwnershipTier } from "../src/lib/rentToOwn";
import {
  BUDGETS_MAJOR,
  LENGTHS,
  THIN_STOCK,
  WEEK_CHOICES,
  breakEvenDays,
  budgetBucket,
  buyFigures,
  cheapestRental,
  checklistText,
  costForDays,
  costForWeeks,
  fleetForDays,
  guidePhotos,
  guideUpdated,
  lowestOwnTier,
  lowestWays,
  median,
  readMinutes,
  rentToOwnFor,
  spanLabel,
  tally,
} from "../src/components/guides/guideMath";
import { threeWay, verdict } from "../src/components/guides/threeWay";
import {
  PRICE_OPTIONS,
  PRICE_ROUNDS,
  PROFILE_ORDER,
  TRIP_DAYS,
  gotHash,
  lifeBudgetMinor,
  lifeMatch,
  lifeMode,
  lifeResult,
  lifeScores,
  parseGotHash,
  parseScoreHash,
  priceEligible,
  priceOptions,
  priceRounds,
  priceScore,
  rankFor,
  rng,
  roundTripMiles,
  scoreHash,
  shuffle,
  storyChances,
  storyDone,
  storyEnding,
  storyPaths,
  tripCost,
  trueFalseScore,
  type LifeAnswers,
  type ProfileId,
} from "../src/components/guides/gameMath";
import { STORY_ENDINGS, STORY_STEPS, STORY_VERDICT, TITLE_PRICES_MAJOR, storyCars, storyShareText } from "../src/content/guides/cheapCar";
import { LIFE_PROFILES, LIFE_QUESTIONS, lifeShareText } from "../src/content/guides/lifeQuiz";
import { PRICE_RANKS, priceShareText } from "../src/content/guides/priceGame";
import { NHTSA_RECALLS_URL, RECALL_FACTS, RECALL_RANKS, recallShareText } from "../src/content/guides/recallQuiz";
import { TRIP_MILEAGE_NOTE, TRIP_PLACES, TRIP_POLICY_RELIES_ON, tripShareText } from "../src/content/guides/roadTrip";
import { bodyGroup as bodyOf } from "../src/components/compare/compareData";
import {
  MAX_COMPARE,
  betterIndexes,
  bodyGroup,
  compareHref,
  compareRows,
  differenceLines,
  featuresOnlyOn,
  isSlug,
  parseCarsParam,
  popularPairs,
  withCarAt,
  withoutCar,
  type CompareCar,
} from "../src/components/compare/compareData";
import { GUIDES, GUIDE_GROUPS, HOME_GUIDE_SLUGS, getGuide, guideHref } from "../src/content/guides";
import { MARKS, plain } from "../src/content/guides/format";
import { ALL_CHECKS, CHECKLIST } from "../src/content/guides/checklist";
import { RTO_DISCLOSURE, owningTiers, rtoTierLine } from "../src/content/guides/rentBuyOwn";
import { POLICY_RELIES_ON } from "../src/content/guides/weeklyRental";
import { RENTAL_POLICY_US } from "../src/content/rentalPolicyUs";
import { MAX_OPEN_RESERVATIONS, RESERVATION_HOURS } from "../src/lib/reservation";
import type { GuideData, GuideRentCar, GuideSaleCar, GuideWords } from "../src/content/guides/types";

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

function ok(label: string, cond: boolean, detail: unknown = "") {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
}

// ── Fixed stock: the US fleet and sale list as they stood in November 2026 ──

const tariff = (
  daily: number,
  weekly: number | null,
  monthly: number | null,
  deposit: number,
  maxDays: number | null = null,
): RentalTariff => ({
  dailyMinor: daily * 100,
  weeklyMinor: weekly == null ? null : weekly * 100,
  monthlyMinor: monthly == null ? null : monthly * 100,
  depositMinor: deposit * 100,
  currency: "USD",
  minDays: 1,
  maxDays,
  withDriverAvailable: false,
  driverDailyMinor: null,
});

/** The body type each fixture car's listing means, and its seats where the listing has them. */
const BODY: Record<string, [GuideSaleCar["body"], number | null]> = {
  "2009-smart-fortwo": ["Coupe", 2],
  "2001-lexus-rx": ["SUV", 5],
  "2014-kia-soul": ["Hatchback", 5],
  "2001-mercedes-s430": ["Sedan", 5],
  "2016-elantra": ["Sedan", 5],
  "2007-toyota-camry": ["Sedan", 5],
  "2013-hyundai-sonata": ["Sedan", 5],
  "2016-nissan-altima": ["Sedan", 5],
  "2010-toyota-venza": ["Wagon", 5],
  "2012-mercedes-glk": ["SUV", 5],
  "2012-buick-enclave": ["SUV", 7],
  "2014-dodge-charger": ["Sedan", 5],
  "2015-chevrolet-malibu": ["Sedan", 5],
  "2013-chevrolet-equinox": ["SUV", 5],
  "2016-dodge-dart": [null, null],
  "2011-acura-mdx": ["SUV", 7],
};

const rentCar = (slug: string, name: string, t: RentalTariff): GuideRentCar => ({
  slug,
  name,
  image: `https://photos.test/${slug}.jpg`,
  tariff: t,
  body: BODY[slug][0],
  seats: BODY[slug][1],
});

const RENT: GuideRentCar[] = [
  rentCar("2009-smart-fortwo", "2009 Smart Fortwo", tariff(65, 350, 1200, 500)),
  rentCar("2001-lexus-rx", "2001 Lexus RX", tariff(80, 500, 1500, 250)),
  rentCar("2014-kia-soul", "2014 Kia Soul", tariff(100, 500, 1800, 500)),
  rentCar("2001-mercedes-s430", "2001 Mercedes Benz S430", tariff(100, 500, 2000, 250, 30)),
  rentCar("2016-elantra", "2016 Elantra Sonata", tariff(100, 500, 1500, 250)),
  rentCar("2007-toyota-camry", "2007 Toyota Camry", tariff(80, 550, 1500, 250)),
  rentCar("2013-hyundai-sonata", "2013 Hyundai Sonata", tariff(85, null, null, 250)),
  rentCar("2016-nissan-altima", "2016 Nissan Altima", tariff(120, 700, 2000, 500)),
  rentCar("2010-toyota-venza", "2010 Toyota Venza", tariff(150, 1000, 3000, 500)),
  rentCar("2012-mercedes-glk", "2012 Mercedes Benz Glk", tariff(350, 1500, 4000, 1000)),
  rentCar("2012-buick-enclave", "2012 Buick Enclave", tariff(400, 2000, 4500, 1000)),
];

const saleCar = (slug: string, name: string, year: number, dollars: number, mileage: number | null): GuideSaleCar => ({
  slug,
  name,
  year,
  mileage,
  priceMinor: dollars * 100,
  image: `https://photos.test/${slug}.jpg`,
  transmission: "Automatic",
  pending: false,
  body: BODY[slug][0],
  seats: BODY[slug][1],
});

const SALE: GuideSaleCar[] = [
  saleCar("2009-smart-fortwo", "2009 Smart Fortwo", 2009, 4500, null),
  saleCar("2001-lexus-rx", "2001 Lexus RX", 2001, 4500, null),
  saleCar("2001-mercedes-s430", "2001 Mercedes Benz S430", 2001, 5000, 145371),
  saleCar("2013-hyundai-sonata", "2013 Hyundai Sonata", 2013, 5700, null),
  saleCar("2014-kia-soul", "2014 Kia Soul", 2014, 5800, null),
  saleCar("2016-nissan-altima", "2016 Nissan Altima", 2016, 5900, 157500),
  saleCar("2007-toyota-camry", "2007 Toyota Camry", 2007, 5900, 190500),
  saleCar("2010-toyota-venza", "2010 Toyota Venza", 2010, 6000, 291295),
  saleCar("2014-dodge-charger", "2014 Dodge Charger", 2014, 6000, null),
  saleCar("2015-chevrolet-malibu", "2015 Chevrolet Malibu", 2015, 6700, null),
  saleCar("2013-chevrolet-equinox", "2013 Chevrolet Equinox", 2013, 7300, null),
  saleCar("2016-dodge-dart", "2016 Dodge Dart", 2016, 7500, null),
  saleCar("2011-acura-mdx", "2011 Acura MDX", 2011, 8200, null),
  saleCar("2012-buick-enclave", "2012 Buick Enclave", 2012, 8500, null),
  saleCar("2016-elantra", "2016 Elantra Sonata", 2016, 8500, 92000),
  saleCar("2012-mercedes-glk", "2012 Mercedes Benz Glk", 2012, 12500, null),
];

const tier = (slug: string, name: string, daily: number, weekly: number, monthly: number, total: number): OwnershipTier => ({
  slug,
  name,
  tagline: null,
  dailyMinor: daily * 100,
  weeklyMinor: weekly * 100,
  monthlyMinor: monthly * 100,
  ownershipThresholdMinor: total * 100,
  depositMinor: 0,
  currency: "USD",
});

const TIERS: OwnershipTier[] = [
  tier("luxury", "Luxury", 250, 1000, 3500, 20000),
  tier("comfort", "Comfort", 100, 600, 2200, 7500),
  tier("economy", "Economy", 80, 500, 1800, 6000),
];

const DATA: GuideData = {
  currency: "USD",
  locale: "en-US",
  distanceUnit: "mi",
  rent: RENT,
  sale: SALE,
  saleTotal: SALE.length,
  tiers: TIERS,
  payOnline: false,
  holdDays: RESERVATION_HOURS / 24,
  maxHolds: MAX_OPEN_RESERVATIONS,
  phone: "+13365550100",
  phoneLabel: "(336) 555-0100",
  stockUpdated: "2026-10-25T14:25:26.264Z",
};

/** A day with nothing listed: the guides must still read, and never throw. */
const EMPTY: GuideData = { ...DATA, rent: [], sale: [], saleTotal: 0, tiers: [], phone: null, phoneLabel: null, stockUpdated: null };

// ── 1. Weeks to cost ──────────────────────────────────────────────────────
console.log("\nWeekly rental: weeks to cost");
for (const car of RENT) {
  for (const weeks of WEEK_CHOICES) {
    const days = weeks * 7;
    const cost = costForWeeks(car.tariff, weeks);
    if (car.tariff.maxDays && days > car.tariff.maxDays) {
      eq(`${car.name}, ${weeks} wk: not rented that long`, cost, null);
      continue;
    }
    const q = quoteRental(car.tariff, days);
    eq(`${car.name}, ${weeks} wk is the booking engine's price`, [cost?.rentMinor, cost?.depositMinor], [
      q.hireMinor,
      q.depositMinor,
    ]);
  }
}
eq("1 week of the Smart is its weekly rate", costForWeeks(RENT[0].tariff, 1)?.rentMinor, 35000);
eq("2 weeks is two weekly rates", costForWeeks(RENT[0].tariff, 2)?.rentMinor, 70000);
// 28 days: four weekly rates are $1,400, the monthly rate is $1,200 and covers 30.
eq("4 weeks takes the monthly rate when it is lower", costForWeeks(RENT[0].tariff, 4)?.rentMinor, 120000);
eq("and says so in its mix", costForWeeks(RENT[0].tariff, 4)?.lines.map((l) => [l.tier, l.quantity]), [["monthly", 1]]);
eq("a car with no weekly rate is seven days", costForWeeks(RENT[6].tariff, 1)?.rentMinor, 7 * 8500);
eq("the deposit is never added to the rent", costForWeeks(RENT[0].tariff, 1)?.rentMinor, 35000);
eq("the deposit is carried beside it", costForWeeks(RENT[0].tariff, 1)?.depositMinor, 50000);
eq("zero days is no rental", costForDays(RENT[0].tariff, 0), null);
{
  const rows = fleetForDays(RENT, 56);
  const priced = rows.filter((r) => r.cost);
  ok("8 weeks: every car is listed", rows.length === RENT.length);
  ok("lowest first", priced.every((r, i) => i === 0 || priced[i - 1].cost!.rentMinor <= r.cost!.rentMinor));
  eq("the car with a 30-day limit comes last, unpriced", [rows[rows.length - 1].car.slug, rows[rows.length - 1].cost], [
    "2001-mercedes-s430",
    null,
  ]);
  eq("the lowest-cost car for 8 weeks", cheapestRental(RENT, 56)?.car.slug, "2009-smart-fortwo");
  eq("no cars, no lowest", cheapestRental([], 7), null);
}

// ── 2. Rent, buy or rent to own ───────────────────────────────────────────
console.log("\nRent, buy or rent to own");
eq("lowest of three", lowestWays({ rent: 360000, buy: 450000, own: 540000 }), ["rent"]);
eq("buy when it is lowest", lowestWays({ rent: 720000, buy: 450000, own: 600000 }), ["buy"]);
eq("own when it is lowest", lowestWays({ rent: 720000, buy: 650000, own: 600000 }), ["own"]);
eq("a tie names both", lowestWays({ rent: 450000, buy: 450000, own: 600000 }), ["rent", "buy"]);
eq("a way with no figure is left out, not zero", lowestWays({ rent: null, buy: 450000, own: 600000 }), ["buy"]);
eq("nothing to compare", lowestWays({ rent: null, buy: null, own: null }), []);
eq("median of an odd count", median([3, 1, 2]), 2);
eq("median of an even count", median([4500, 5000, 5700, 5800]), 5350);
eq("median of nothing", median([]), null);

const buy = buyFigures(SALE.map((c) => c.priceMinor))!;
eq("sale prices: lowest, middle, highest", [buy.lowestMinor, buy.middleMinor, buy.highestMinor, buy.count], [
  450000, 600000, 1250000, 16,
]);
eq("nothing for sale", buyFigures([]), null);
const economy = lowestOwnTier(TIERS)!;
eq("the category with the lowest total", economy.slug, "economy");
eq("no categories", lowestOwnTier([]), null);
eq("categories, lowest total first", owningTiers(TIERS).map((t) => t.slug), ["economy", "comfort", "luxury"]);

for (const length of LENGTHS) {
  const f = threeWay({ rent: RENT, buyLowestMinor: buy.lowestMinor, tier: economy }, length.days);
  // The minimum, worked out the long way.
  const rents = RENT.flatMap((c) => {
    try {
      return [quoteRental(c.tariff, length.days).hireMinor];
    } catch {
      return [];
    }
  });
  const rent = Math.min(...rents);
  const paid = Math.min(
    quoteRental({ ...RENT[0].tariff, dailyMinor: 8000, weeklyMinor: 50000, monthlyMinor: 180000, maxDays: null }, length.days)
      .hireMinor,
    600000,
  );
  const figures = { rent, buy: buy.lowestMinor, own: paid };
  const min = Math.min(rent, buy.lowestMinor, paid);
  eq(`${length.label}: the three figures`, [f.rent?.cost.rentMinor, f.buyMinor, f.own?.paidMinor], [
    rent,
    buy.lowestMinor,
    paid,
  ]);
  eq(
    `${length.label}: the lowest is the true minimum`,
    f.lowest,
    (Object.keys(figures) as (keyof typeof figures)[]).filter((k) => figures[k] === min),
  );
  const said = verdict(f, length.phrase, DATA);
  ok(`${length.label}: the sentence names the length`, said.startsWith(`For ${length.phrase},`), said);
}
{
  const month = threeWay({ rent: RENT, buyLowestMinor: buy.lowestMinor, tier: economy }, 30);
  eq("1 month: renting is lowest", month.lowest, ["rent"]);
  eq("1 month of rent to own is a month's rent, not yet the total", [month.own?.paidMinor, month.own?.owned], [180000, false]);
  const year = threeWay({ rent: RENT, buyLowestMinor: buy.lowestMinor, tier: economy }, 365);
  eq("1 year: buying is lowest", year.lowest, ["buy"]);
  eq("after a year the rent-to-own car is owned, at its total and no more", [year.own?.paidMinor, year.own?.owned], [600000, true]);
  eq("days to own match the rent-to-own page's arithmetic", year.own?.ownDays, pathToOwnership(economy)!.days);
  ok(
    "the sentence for buying gives both figures",
    verdict(year, "1 year", DATA).includes("$4,500") && verdict(year, "1 year", DATA).includes("$14,"),
    verdict(year, "1 year", DATA),
  );
  eq("with nothing in stock, nothing is claimed", verdict(threeWay({ rent: [], buyLowestMinor: null, tier: null }, 30), "1 month", DATA), "There is nothing to compare today.");
  eq("a tier with no total leads nowhere", rentToOwnFor({ ...economy, ownershipThresholdMinor: null }, 30), null);
}
{
  const even = breakEvenDays(RENT, buy.lowestMinor)!;
  ok("rent has passed the lowest price on that day", cheapestRental(RENT, even)!.cost.rentMinor > buy.lowestMinor);
  ok("and had not the day before", cheapestRental(RENT, even - 1)!.cost.rentMinor <= buy.lowestMinor);
  eq("no cars, no such day", breakEvenDays([], buy.lowestMinor), null);
  eq("a price no rent reaches in three years", breakEvenDays(RENT, 10_000_000_00), null);
  eq("16 weeks", spanLabel(112), "16 weeks");
  eq("1 week", spanLabel(7), "1 week");
  eq("past half a year, months", spanLabel(200), "7 months");
}

// ── 3. Budgets ────────────────────────────────────────────────────────────
console.log("\nBudgets");
eq("the budgets the title names", BUDGETS_MAJOR, [5000, 10000, 15000]);
{
  const five = budgetBucket(SALE, 500000);
  eq("$5,000: a car priced exactly at the budget fits", five.count, 3);
  eq("the most car for the money first", five.cars.map((c) => c.priceMinor), [500000, 450000, 450000]);
  eq("typical year is the middle one", five.typicalYear, 2001);
  eq("miles come from the listings that show them", [five.typicalMiles, five.milesListed], [145371, 1]);
  eq("three cars is not thin", five.thin, false);
  const ten = budgetBucket(SALE, 1000000);
  eq("$10,000", [ten.count, ten.lowestMinor, ten.highestMinor], [15, 450000, 850000]);
  eq("typical miles of five listings", [ten.typicalMiles, ten.milesListed], [157500, 5]);
  eq("$15,000 is everything", budgetBucket(SALE, 1500000).count, SALE.length);
  const none = budgetBucket(SALE, 100000);
  eq("a budget that buys nothing", [none.count, none.thin, none.typicalYear, none.lowestMinor], [0, false, null, null]);
  const thin = budgetBucket(SALE.slice(0, THIN_STOCK), 500000);
  eq(`${THIN_STOCK} cars or fewer is thin`, [thin.count, thin.thin], [THIN_STOCK, true]);
}

// ── 4. Compare ────────────────────────────────────────────────────────────
console.log("\nCompare: the link");
eq("two slugs", parseCarsParam("2013-hyundai-sonata,2014-kia-soul"), {
  slugs: ["2013-hyundai-sonata", "2014-kia-soul"],
  rejected: 0,
});
eq("spaces and empty parts are ignored", parseCarsParam(" a-1 , ,b-2,"), { slugs: ["a-1", "b-2"], rejected: 0 });
eq("a car named twice is one car", parseCarsParam("a-1,a-1,b-2"), { slugs: ["a-1", "b-2"], rejected: 0 });
eq(`${MAX_COMPARE} at most`, parseCarsParam("a,b,c,d"), { slugs: ["a", "b", "c"], rejected: 1 });
eq("nothing chosen", parseCarsParam(undefined), { slugs: [], rejected: 0 });
eq("a repeated parameter uses the first", parseCarsParam(["a,b", "c"]), { slugs: ["a", "b"], rejected: 0 });
eq("markup is not a slug", parseCarsParam("<script>,a"), { slugs: ["a"], rejected: 1 });
eq("a path is not a slug", parseCarsParam("../admin,a"), { slugs: ["a"], rejected: 1 });
// A VIN as printed is upper case, which no slug is. It is counted and never echoed.
eq("a VIN as printed is not a slug", parseCarsParam("1HGCM82633A004352,a"), { slugs: ["a"], rejected: 1 });
ok("slugs are lowercase words and hyphens", isSlug("2016-nissan-altima-sedan-4d-25-s"));
ok("no doubled hyphen", !isSlug("a--b"));
ok("no leading hyphen", !isSlug("-a"));
ok("not endless", !isSlug("a".repeat(121)));
eq("the link for a choice", compareHref("us", ["a", "b"]), "/us/compare?cars=a,b");
eq("no choice is the bare page", compareHref("us", []), "/us/compare");
eq("a malformed slug never reaches a link", compareHref("us", ["a", "B c"]), "/us/compare?cars=a");
eq("pick into an empty column", withCarAt(["a"], 1, "b"), ["a", "b"]);
eq("change a column", withCarAt(["a", "b"], 0, "c"), ["c", "b"]);
eq("add a third", withCarAt(["a", "b"], 2, "c"), ["a", "b", "c"]);
eq("picking a car already chosen swaps, never doubles", withCarAt(["a", "b"], 0, "b"), ["b", "a"]);
eq("remove one", withoutCar(["a", "b", "c"], "b"), ["a", "c"]);

console.log("\nCompare: body types");
eq("as stored", bodyGroup("Sedan"), "Sedan");
eq("any case", bodyGroup("Suv"), "SUV");
eq("a crossover is an SUV, whatever else it says", bodyGroup("5 door crossover/ SUV (Wagon style crossover)"), "SUV");
eq("spelled out", bodyGroup("4 - Door Sedan"), "Sedan");
eq("from the trim when the body style is blank", bodyGroup(null, "Equinox", "LT Sport Utility 4D"), "SUV");
eq("a color in the body field names no body type", bodyGroup("Biege", "Camry", null), null);
eq("the stored body style wins over the model's words", bodyGroup("Sedan", "Hatchback", "Coupe 2D"), "Sedan");

const car = (o: Partial<CompareCar> & { slug: string; year: number }): CompareCar => ({
  name: o.slug,
  short: o.slug,
  image: null,
  forSale: true,
  priceMinor: null,
  mileage: null,
  bodyStyle: null,
  bodyGroup: null,
  engine: null,
  transmission: null,
  drivetrain: null,
  fuel: null,
  seats: null,
  features: [],
  rental: null,
  ...o,
});
const US = { currency: "USD" as const, locale: "en-US", distanceUnit: "mi" as const };
const A = car({ slug: "a", year: 2013, priceMinor: 570000, mileage: 136000, seats: 5, bodyGroup: "Sedan", transmission: "Automatic", features: ["Power windows", "Sunroof"] });
const B = car({ slug: "b", year: 2016, priceMinor: 810000, mileage: 157000, seats: 7, bodyGroup: "SUV", transmission: "Automatic", features: ["power-windows", "Reverse camera"] });
const C = car({ slug: "c", year: 2010, priceMinor: 570000, mileage: null, seats: 5, bodyGroup: "Sedan" });

console.log("\nCompare: better marks");
eq("the lower of two", betterIndexes([570000, 810000], "low"), [0]);
eq("the higher of two", betterIndexes([2013, 2016], "high"), [1]);
eq("equal values mark nobody", betterIndexes([5, 5], "high"), []);
eq("a missing value marks nobody", betterIndexes([136000, null], "low"), []);
eq("a tie for the better value marks both", betterIndexes([570000, 810000, 570000], "low"), [0, 2]);
{
  const rows = compareRows([A, B], US);
  const row = (key: string) => rows.find((r) => r.key === key);
  eq("price: the lower is marked", row("price")?.cells.map((c) => [c.text, c.better]), [
    ["$5,700", "Lower"],
    ["$8,100", null],
  ]);
  eq("year: the newer is marked", row("year")?.cells.map((c) => c.better), [null, "Newer"]);
  eq("miles: the fewer is marked", row("miles")?.cells.map((c) => [c.text, c.better]), [
    ["136,000 mi", "Fewer"],
    ["157,000 mi", null],
  ]);
  eq("seats: the more is marked", row("seats")?.cells.map((c) => c.better), [null, "More"]);
  eq("body is never marked: taste is not a fact", row("body")?.cells.map((c) => c.better), [null, null]);
  eq("the same transmission is shown, unmarked", row("transmission")?.cells.map((c) => [c.text, c.better]), [
    ["Automatic", null],
    ["Automatic", null],
  ]);
  eq("a row no listing has anything for is left out", row("engine"), undefined);
  eq("no rental rows unless every car is a rental", row("weekly"), undefined);
  eq("rows in reading order", rows.map((r) => r.key), ["price", "year", "miles", "body", "transmission", "seats"]);

  const three = compareRows([A, B, C], US);
  eq("three cars: the wording is a superlative, and a tie marks both", three.find((r) => r.key === "price")?.cells.map((c) => c.better), ["Lowest", null, "Lowest"]);
  eq("three cars: one without miles means no car is marked", three.find((r) => r.key === "miles")?.cells.map((c) => [c.better, c.missing]), [
    [null, false],
    [null, false],
    [null, true],
  ]);
  eq("the missing value says so", three.find((r) => r.key === "miles")?.cells[2].text, "Not listed");
}
{
  const rental = (weekly: number | null, daily: number, deposit: number) => ({
    dailyMinor: daily * 100,
    weeklyMinor: weekly == null ? null : weekly * 100,
    depositMinor: deposit * 100,
    weekCostMinor: (weekly ?? daily * 7) * 100,
  });
  const R1 = { ...A, rental: rental(350, 65, 500) };
  const R2 = { ...B, rental: rental(500, 80, 250) };
  const rows = compareRows([R1, R2], US);
  eq("both rentals: a week, a day and the deposit are rows", rows.filter((r) => ["weekly", "daily", "deposit"].includes(r.key)).map((r) => r.cells.map((c) => [c.text, c.better])), [
    [["$350", "Lower"], ["$500", null]],
    [["$65", "Lower"], ["$80", null]],
    [["$500", null], ["$250", "Lower"]],
  ]);
  const only = { ...car({ slug: "r", year: 2015 }), forSale: false, rental: rental(null, 85, 0) };
  const mixed = compareRows([R1, only], US);
  eq("a rental-only car has no sale price, and nothing is marked", mixed.find((r) => r.key === "price")?.cells.map((c) => [c.text, c.better]), [
    ["$5,700", null],
    ["Rental only", null],
  ]);
  eq("a car with no weekly rate shows seven days, and is compared on it", mixed.find((r) => r.key === "weekly")?.cells.map((c) => [c.text, c.better]), [
    ["$350", "Lower"],
    ["$595 for 7 days", null],
  ]);
  eq("no deposit reads None", mixed.find((r) => r.key === "deposit")?.cells[1].text, "None");
  eq("the difference in rent uses what a week costs", differenceLines([R1, R2], US)[0][1], "Rents for $150 less a week.");
}

console.log("\nCompare: one line for each car");
eq("the spec's own example", differenceLines([car({ slug: "x", year: 2013, priceMinor: 570000, mileage: 157000 }), car({ slug: "y", year: 2016, priceMinor: 810000, mileage: 136000 })], US), [
  ["Costs $2,400 less.", "3 years older.", "21,000 more miles."],
  ["Costs $2,400 more.", "3 years newer.", "21,000 fewer miles."],
]);
eq("seats, when both listings have them", differenceLines([A, B], US)[1].slice(-1), ["2 seats more."]);
eq("one year is singular", differenceLines([car({ slug: "x", year: 2013 }), car({ slug: "y", year: 2014 })], US), [["1 year older."], ["1 year newer."]]);
eq("the same price says so; unknown miles say nothing", differenceLines([A, C], US), [
  ["Same price.", "3 years newer."],
  ["Same price.", "3 years older."],
]);
eq("three cars: each against the lowest, the newest, the fewest", differenceLines([A, B, car({ slug: "z", year: 2010, priceMinor: 500000, mileage: 180000 })], US), [
  ["Costs $700 more than the lowest.", "3 years older than the newest.", "Fewest miles."],
  ["Costs $3,100 more than the lowest.", "Newest.", "21,000 more miles than the lowest."],
  ["Lowest price.", "6 years older than the newest.", "44,000 more miles than the lowest."],
]);
eq("three cars: a shared lowest price is a tie", differenceLines([A, B, C], US).map((l) => l[0]), [
  "Lowest price, tied.",
  "Costs $2,400 more than the lowest.",
  "Lowest price, tied.",
]);
eq("one car is not a comparison", differenceLines([A], US), [[]]);
ok(
  "no line has an opinion",
  [...differenceLines([A, B], US), ...differenceLines([A, B, C], US)].flat().every((s) => !/\b(best|better|worse|recommend|should)\b/i.test(s)),
);

console.log("\nCompare: features and popular pairs");
eq("what each listing has that the other doesn't, however it is typed", featuresOnlyOn([A, B]), [["Sunroof"], ["Reverse camera"]]);
eq("no features anywhere: no row", featuresOnlyOn([C, car({ slug: "d", year: 2011 })]), null);
eq("a listing with none has nothing more", featuresOnlyOn([A, C]), [["Power windows", "Sunroof"], []]);
{
  const stock = [
    car({ slug: "s1", year: 2013, priceMinor: 570000, bodyGroup: "Sedan" }),
    car({ slug: "s2", year: 2014, priceMinor: 580000, bodyGroup: "Sedan" }),
    car({ slug: "s3", year: 2016, priceMinor: 590000, bodyGroup: "Sedan" }),
    car({ slug: "s4", year: 2016, priceMinor: 850000, bodyGroup: "Sedan" }),
    car({ slug: "u1", year: 2011, priceMinor: 820000, bodyGroup: "SUV" }),
    car({ slug: "u2", year: 2012, priceMinor: 850000, bodyGroup: "SUV" }),
    car({ slug: "x1", year: 2007, priceMinor: 590000, bodyGroup: null }),
  ];
  const pairs = popularPairs(stock, 6).map(([a, b]) => `${a.slug}+${b.slug}`);
  eq("same body type, nearest prices first", pairs, ["s1+s2", "s2+s3", "u1+u2", "s3+s4"]);
  ok("never across body types", popularPairs(stock, 6).every(([a, b]) => a.bodyGroup === b.bodyGroup));
  const counts = new Map<string, number>();
  for (const [a, b] of popularPairs(stock, 6)) for (const c of [a, b]) counts.set(c.slug, (counts.get(c.slug) ?? 0) + 1);
  ok("a car is in two pairs at most", [...counts.values()].every((n) => n <= 2));
  eq("as many as asked for, no more", popularPairs(stock, 2).length, 2);
  eq("one car is no pair", popularPairs(stock.slice(0, 1)), []);
  eq("no shared body type: the nearest prices of any kind", popularPairs([stock[0], stock[4]]).map(([a, b]) => `${a.slug}+${b.slug}`), ["s1+u1"]);
}

// ── 5. Every guide's words ────────────────────────────────────────────────
console.log("\nGuides: the list");
eq("nine guides", GUIDES.length, 9);
ok("the games lead", GUIDES.slice(0, 5).every((g) => g.meta.game) && GUIDES.slice(5).every((g) => !g.meta.game), GUIDES.map((g) => g.meta.slug));
ok("every guide is in one of the index's groups", GUIDES.every((g) => GUIDE_GROUPS.some((x) => x.id === g.meta.group)));
eq("the index's groups, games first", GUIDE_GROUPS.map((x) => [x.id, GUIDES.filter((g) => g.meta.group === x.id).length]), [["play", 3], ["plan", 4], ["check", 2]]);
ok("every tool is used once", new Set(GUIDES.map((g) => g.meta.tool)).size === GUIDES.length);
ok("every slug is a slug, once", GUIDES.every((g) => isSlug(g.meta.slug)) && new Set(GUIDES.map((g) => g.meta.slug)).size === GUIDES.length);
ok("newest first", GUIDES.every((g, i) => i === 0 || GUIDES[i - 1].meta.published >= g.meta.published));
ok("the home page's three exist", HOME_GUIDE_SLUGS.length === 3 && HOME_GUIDE_SLUGS.every((s) => getGuide(s)));
eq("an unknown slug is no guide", getGuide("nope"), null);
eq("where a guide lives", guideHref("x"), "/us/guides/x");

/** The search phrase each guide answers: in its H1, its address and its first sentence. */
const QUERY: Record<string, { words: string[]; inSlug: string[] }> = {
  "weekly-car-rental-greensboro-nc": { words: ["weekly car rental", "greensboro, nc"], inSlug: ["weekly-car-rental", "greensboro"] },
  "rent-vs-buy-vs-rent-to-own": { words: ["rent", "buy", "rent to own", "greensboro"], inSlug: ["rent", "buy", "rent-to-own"] },
  "used-cars-by-budget-greensboro-nc": { words: ["used cars under", "greensboro, nc"], inSlug: ["used-cars", "budget", "greensboro"] },
  "used-car-checklist-free-vin-check": { words: ["check a used car", "before you buy"], inSlug: ["used-car-checklist", "vin-check"] },
  "which-car-fits-your-life-quiz": { words: ["what car fits your life", "quiz"], inSlug: ["car-fits-your-life", "quiz"] },
  "guess-the-price-game": { words: ["guess the price", "used car prices"], inSlug: ["guess-the-price"] },
  "true-cost-of-a-cheap-car": { words: ["car", "which really costs more"], inSlug: ["true-cost", "cheap-car"] },
  "recall-or-not-quiz": { words: ["recall or not", "car safety recalls"], inSlug: ["recall", "quiz"] },
  "road-trip-from-greensboro": { words: ["day trips from greensboro", "rental car"], inSlug: ["road-trip", "greensboro"] },
};

/** Every word a guide puts on the page. */
const everyWord = (meta: { title: string; metaTitle: string; promise: string; card: { line: string } }, w: GuideWords) => [
  meta.title,
  meta.metaTitle,
  meta.promise,
  meta.card.line,
  w.description,
  w.stat,
  ...w.short,
  w.toolHeading,
  w.toolNote,
  ...w.sections.flatMap((s) => [s.heading, ...s.body, ...(s.list ?? []).map((l) => l.text), ...(s.steps ?? []), s.cars?.title ?? "", s.cars?.all.label ?? "", s.link?.label ?? ""]),
  ...w.faqs.flatMap((f) => [f.q, f.a]),
  ...w.links.map((l) => l.label),
  w.cta.title,
  w.cta.text,
  w.cta.primary.label,
  w.cta.secondary?.label ?? "",
];

/** Pages a guide may link to. */
const ROUTES = /^\/us(\/(rentals|inventory|rent-to-own|financing|check|sell|compare|contact|rental-policy|guides(\/[a-z0-9-]+)?))?(\?[a-z]+=[a-z0-9_-]+)?$/;
/** Words the site doesn't use about itself. */
const HYPE = /\b(best|amazing|unbeatable|guarantee[ds]?|lowest prices in|number one|#1)\b|!/i;

console.log("\nGuides: titles and descriptions (with November 2026 stock)");
for (const g of GUIDES) {
  const w = g.words(DATA);
  const q = QUERY[g.meta.slug];
  console.log(`  ${g.meta.slug}\n      title ${g.meta.metaTitle.length} characters · description ${w.description.length} characters`);
  ok(`${g.meta.slug}: the title is under 60 characters`, g.meta.metaTitle.length < 60, g.meta.metaTitle.length);
  ok(`${g.meta.slug}: the description is 140 to 160 characters`, w.description.length >= 140 && w.description.length <= 160, w.description.length);
  ok(`${g.meta.slug}: the description names Greensboro, NC`, w.description.includes("Greensboro, NC"));
  ok(`${g.meta.slug}: the search phrase is in the H1`, q.words.every((p) => g.meta.title.toLowerCase().includes(p)), g.meta.title);
  ok(`${g.meta.slug}: and in the address`, q.inSlug.every((p) => g.meta.slug.includes(p)));
  ok(`${g.meta.slug}: and in the first sentence`, q.words.every((p) => g.meta.promise.toLowerCase().includes(p)), g.meta.promise);
  ok(`${g.meta.slug}: the short version is 3 or 4 bullets`, w.short.length >= 3 && w.short.length <= 4, w.short.length);
  ok(`${g.meta.slug}: 4 to 6 questions`, w.faqs.length >= 4 && w.faqs.length <= 6, w.faqs.length);
  ok(`${g.meta.slug}: every question is one, with an answer`, w.faqs.every((f) => f.q.endsWith("?") && f.a.trim().length > 20));
  ok(`${g.meta.slug}: questions carry no marks (they are the structured data too)`, w.faqs.every((f) => plain(f.q) === f.q && plain(f.a) === f.a));
  ok(`${g.meta.slug}: no question twice`, new Set(w.faqs.map((f) => f.q)).size === w.faqs.length);
  ok(`${g.meta.slug}: section ids are slugs, once each`, w.sections.every((s) => isSlug(s.id)) && new Set(w.sections.map((s) => s.id)).size === w.sections.length);
  ok(`${g.meta.slug}: every section says something`, w.sections.every((s) => s.body.length + (s.list?.length ?? 0) + (s.steps?.length ?? 0) > 0));
  const hrefs = [
    ...w.links.map((l) => l.href),
    w.cta.primary.href,
    ...w.sections.flatMap((s) => [s.link?.href, s.cars?.all.href]),
    ...everyWord(g.meta, w).flatMap((t) => [...t.matchAll(MARKS)].map((m) => m[3])),
  ].filter((h): h is string => Boolean(h));
  ok(`${g.meta.slug}: every link is a page of this site`, hrefs.every((h) => ROUTES.test(h)), hrefs.filter((h) => !ROUTES.test(h)));
  ok(`${g.meta.slug}: a link to another guide is a real guide`, hrefs.filter((h) => h.startsWith("/us/guides/")).every((h) => getGuide(h.split("/")[3])));
  ok(`${g.meta.slug}: the cars it shows are in stock`, w.sections.every((s) => !s.cars || s.cars.slugs.every((slug) => (s.cars!.kind === "rent" ? RENT : SALE).some((c) => c.slug === slug))));
  ok(`${g.meta.slug}: no hype`, everyWord(g.meta, w).every((t) => !HYPE.test(t)), everyWord(g.meta, w).filter((t) => HYPE.test(t)));
  ok(`${g.meta.slug}: a read time`, readMinutes(w) >= 1);
  ok(`${g.meta.slug}: the photo is a car in stock`, w.photoSlug != null && [...RENT, ...SALE].some((c) => c.slug === w.photoSlug));

  // A day with nothing listed.
  let empty: GuideWords | null = null;
  try {
    empty = g.words(EMPTY);
  } catch (e) {
    ok(`${g.meta.slug}: reads with nothing in stock`, false, String(e));
  }
  if (empty) {
    ok(`${g.meta.slug}: with nothing in stock, the description still fits`, empty.description.length >= 140 && empty.description.length <= 160, empty.description.length);
    // A budget in a question ("What does $15,000 buy?") is the tool's own
    // constant, not a price anyone is quoting.
    // The same goes for the two round prices in the cheap-car story's title.
    const budgets = new RegExp([...BUDGETS_MAJOR, ...TITLE_PRICES_MAJOR].map((b) => `\\$${b.toLocaleString("en-US")}`).join("|"), "g");
    const priced = everyWord(g.meta, empty).filter((t) => /\$\d/.test(plain(t).replace(budgets, "")));
    ok(`${g.meta.slug}: and it claims no price`, priced.length === 0, priced);
    ok(`${g.meta.slug}: and it shows no cars`, empty.sections.every((s) => !s.cars || s.cars.slugs.length === 0));
  }
}

console.log("\nGuides: numbers come from stock");
{
  const weekly = getGuide("weekly-car-rental-greensboro-nc")!.words(DATA);
  ok("the lowest weekly rate is the fleet's", weekly.short[0].includes("$350 a week") && weekly.short[0].includes("$65 a day") && weekly.short[0].includes("11 cars"), weekly.short[0]);
  ok("the deposit range is the fleet's", weekly.short[1].includes("$250 to $1,000"), weekly.short[1]);
  ok("the hold is the reservation rule's", weekly.short[2].includes(`${RESERVATION_HOURS / 24} days`), weekly.short[2]);
  // One cent on the lowest rate, and the words follow.
  const dearer = getGuide("weekly-car-rental-greensboro-nc")!.words({ ...DATA, rent: RENT.map((c, i) => (i === 0 ? { ...c, tariff: { ...c.tariff, weeklyMinor: 36000 } } : c)) });
  ok("change a rate and the words change", dearer.short[0].includes("$360 a week") && dearer.description.includes("$360 a week"), dearer.short[0]);
  ok("with no way to pay online, it doesn't say there is one", !everyWord(GUIDES[0].meta, weekly).some((t) => /pay (by card )?online/i.test(t)));
  const online = getGuide("weekly-car-rental-greensboro-nc")!.words({ ...DATA, payOnline: true });
  ok("with one, it does", everyWord(GUIDES[0].meta, online).some((t) => /by card online/i.test(t)));
  ok("it never says no card is needed (the policy doesn't)", !everyWord(GUIDES[0].meta, weekly).some((t) => /no (credit )?card/i.test(t)));
  ok("it says nothing about insurance (the business doesn't sell it)", !everyWord(GUIDES[0].meta, weekly).some((t) => /insur/i.test(t)));

  const budget = getGuide("used-cars-by-budget-greensboro-nc")!.words(DATA);
  ok("the budget counts are the buckets'", budget.short[1] === "**3** at $5,000 or less. **15** at $10,000 or less. **16** at $15,000 or less.", budget.short[1]);
  ok("it says whose stock it is", budget.sections.slice(0, 3).every((s) => s.body.join(" ").includes("in our stock today")));
  const thin = getGuide("used-cars-by-budget-greensboro-nc")!.words({ ...DATA, sale: SALE.slice(0, 2), saleTotal: 2 });
  ok("thin stock is called thin", thin.sections[0].body[0].startsWith("Stock is thin at this budget"), thin.sections[0].body[0]);
  const dear = getGuide("used-cars-by-budget-greensboro-nc")!.words({ ...DATA, sale: SALE.slice(3), saleTotal: 13 });
  ok("a budget that buys nothing says so, with the lowest price", dear.sections[0].body[0] === "No car in our stock today costs $5,000 or less. The lowest price is **$5,700**.", dear.sections[0].body[0]);

  const check = getGuide("used-car-checklist-free-vin-check")!.words(DATA);
  ok("the checklist's counts are counted", check.short[0].includes(`${ALL_CHECKS.length} checks`) && check.short[0].includes(`${CHECKLIST.length} parts`), check.short[0]);
}

// ── No credit terms in the rent-vs-buy guide ──────────────────────────────
console.log("\nRent vs buy: nothing that advertises credit");
{
  /** Triggering terms and their neighbors. "Financing" as the name of a page is allowed. */
  const CREDIT = /\bapr\b|\binterest\b|\bloans?\b|\blend(er|ers|ing)?\b|\bcredit\b|approv|qualif|down payment|money down|monthly payment|\bper month\b|\ba month\b|\/mo\b|%|\bfinanced?\b|\bfinance charge|\bterms? of \d|\bfor \d+ months at\b/i;
  const g = getGuide("rent-vs-buy-vs-rent-to-own")!;
  for (const [label, data] of [["today's stock", DATA], ["nothing in stock", EMPTY], ["online payment on", { ...DATA, payOnline: true }]] as const) {
    const words = everyWord(g.meta, g.words(data));
    ok(`its words, ${label}`, words.every((t) => !CREDIT.test(t)), words.filter((t) => CREDIT.test(t)));
  }
  const said = LENGTHS.map((l) => verdict(threeWay({ rent: RENT, buyLowestMinor: buy.lowestMinor, tier: economy }, l.days), l.phrase, DATA));
  ok("the sentence under the tool, at every length", said.every((t) => !CREDIT.test(t)), said.filter((t) => CREDIT.test(t)));
  ok("the rent-to-own disclosure and category lines", [...RTO_DISCLOSURE, ...TIERS.map((t) => rtoTierLine(DATA, t))].every((t) => !CREDIT.test(t)));
  // The tool's own words are in its source: read it without its comments.
  for (const file of ["src/components/guides/tools/ThreeWayTool.tsx", "src/components/guides/threeWay.ts"]) {
    const code = readFileSync(join(__dirname, "..", file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const hit = code.split("\n").filter((line) => CREDIT.test(line));
    ok(`${file}`, hit.length === 0, hit);
  }
  ok("financing is a link, and only a link", g.words(DATA).links.some((l) => l.href === "/us/financing") && g.words(DATA).sections.some((s) => s.link?.href === "/us/financing"));
  ok("every rent-to-own figure has the refund rule beside it", g.words(DATA).short.filter((t) => /rent to own/i.test(t)).every((t) => /isn't refunded/.test(t)));
}

// ── 6. What the guides restate is still what those pages say ──────────────
console.log("\nRestated from the rental policy");
{
  const policy = RENTAL_POLICY_US.body
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
  for (const phrase of POLICY_RELIES_ON) {
    ok(`the policy still says: ${phrase.slice(0, 64)}${phrase.length > 64 ? "…" : ""}`, policy.includes(phrase));
  }
  eq("the hold the policy states is the reservation rule's", `up to ${RESERVATION_HOURS / 24} days`, "up to 2 days");
  eq("the holds the policy states are the rule's", MAX_OPEN_RESERVATIONS, 2);
}

console.log("\nThe rent-to-own disclosure, word for word");
{
  const page = readFileSync(join(__dirname, "../src/app/[market]/rent-to-own/page.tsx"), "utf8").replace(/\s+/g, " ");
  for (const sentence of RTO_DISCLOSURE) {
    ok(`/us/rent-to-own still says: ${sentence.slice(0, 60)}…`, page.includes(sentence));
  }
  // The category line is built there from these pieces, in this order.
  ok("and builds each category's line the same way", ["per day", "per week", "Total of all payments to acquire ownership:"].every((piece) => page.includes(piece)));
  eq("a category's line", rtoTierLine(DATA, economy), "Economy: $80 per day or $500 per week. Total of all payments to acquire ownership: $6,000.");
}

// ── 7. The checklist ──────────────────────────────────────────────────────
console.log("\nChecklist");
eq("five parts, in walking order", CHECKLIST.map((g) => g.id), ["outside", "inside", "hood", "paperwork", "drive"]);
ok("4 to 6 checks in each", CHECKLIST.every((g) => g.checks.length >= 4 && g.checks.length <= 6), CHECKLIST.map((g) => g.checks.length));
ok("every check has its own id", new Set(ALL_CHECKS.map((c) => c.id)).size === ALL_CHECKS.length);
ok("every check says what to look for and how", ALL_CHECKS.every((c) => c.label.length > 8 && c.hint.length > 20));
ok("a fact from NHTSA or the FTC names it", ALL_CHECKS.every((c) => !c.source || c.hint.includes(c.source)) && ALL_CHECKS.filter((c) => /NHTSA|FTC/.test(c.hint)).every((c) => c.source));
ok("it links to the free car check", ALL_CHECKS.some((c) => c.link?.href === "/us/check"));
{
  const text = ALL_CHECKS.map((c) => `${c.label} ${c.hint}`).join(" ");
  ok("nothing about North Carolina law or inspections", !/north carolina|\bnc\b|dmv|state inspection|inspection sticker|notar|lien|salvage|by law|legally|illegal/i.test(text));
  const titles = ALL_CHECKS.filter((c) => /\btitle\b/i.test(`${c.label} ${c.hint}`));
  eq("the title is mentioned once, and only to match its VIN", titles.map((c) => c.hint), ["Ask to see the title and match the VIN on it to the car."]);
  ok("no hype", !HYPE.test(text));
}
{
  const ids = ALL_CHECKS.map((c) => c.id);
  eq("nothing tapped", tally(ids, {}), { total: ids.length, good: 0, problems: 0, left: ids.length, done: false });
  const some = { [ids[0]]: "good", [ids[1]]: "problem", [ids[2]]: "good", "not-a-check": "problem" } as const;
  eq("the tally counts taps, and ignores checks that don't exist", tally(ids, some), { total: ids.length, good: 2, problems: 1, left: ids.length - 3, done: false });
  const all = Object.fromEntries(ids.map((id) => [id, "good" as const]));
  eq("all good", tally(ids, all), { total: ids.length, good: ids.length, problems: 0, left: 0, done: true });
  const text = checklistText(CHECKLIST, some, "https://example.test/us/guides/x");
  eq("the shared result", text.split("\n"), [
    "Used car checklist",
    `2 good · 1 to ask about · ${ids.length - 3} not checked`,
    "",
    "Ask about:",
    `- ${CHECKLIST[0].title}: ${CHECKLIST[0].checks[1].label}`,
    "",
    "Checklist: https://example.test/us/guides/x",
  ]);
  eq("with no problems, no list", checklistText(CHECKLIST, all, "u").split("\n"), ["Used car checklist", `${ids.length} good · 0 to ask about`, "", "Checklist: u"]);
}

// ── 8. The games ──────────────────────────────────────────────────────────
console.log("\nGames: chance, ranks and shared links");
{
  const a = rng(7);
  const b = rng(7);
  ok("the same seed deals the same run", [a(), a(), a()].join() === [b(), b(), b()].join());
  ok("a run stays between 0 and 1", Array.from({ length: 200 }, rng(3)).every((n) => n >= 0 && n < 1));
  const deck = shuffle([1, 2, 3, 4, 5, 6], rng(11));
  eq("a shuffle keeps every card", [...deck].sort(), [1, 2, 3, 4, 5, 6]);
  ok("and moves them", deck.join() !== "1,2,3,4,5,6", deck);

  for (const [name, ranks] of [["price", PRICE_RANKS], ["recall", RECALL_RANKS]] as const) {
    ok(`${name} ranks: one starts at zero, ids once each`, ranks.some((r) => r.from === 0) && new Set(ranks.map((r) => r.id)).size === ranks.length);
    ok(`${name} ranks: every score from 0 to 8 has one`, Array.from({ length: 9 }, (_, n) => rankFor(ranks, n, 8)).every((r) => r.title.length > 3));
    eq(`${name} ranks: a full score is the top rank`, rankFor(ranks, 5, 5).id, [...ranks].sort((x, y) => y.from - x.from)[0].id);
    eq(`${name} ranks: nothing right is the bottom rank`, rankFor(ranks, 0, 5).from, 0);
    ok(`${name} ranks: no hype`, ranks.every((r) => !HYPE.test(`${r.title} ${r.line}`)));
  }
  eq("4 of 5 at guess the price", rankFor(PRICE_RANKS, 4, 5).id, "sharp");
  eq("3 of 5", rankFor(PRICE_RANKS, 3, 5).id, "haggler");
  eq("2 of 3, with fewer rounds", rankFor(PRICE_RANKS, 2, 3).id, "haggler");
  eq("6 of 8 at recall or not", rankFor(RECALL_RANKS, 6, 8).id, "minded");
  eq("no rounds at all", rankFor(PRICE_RANKS, 0, 0).from, 0);

  eq("a score in a link", scoreHash(4, 5), "#score=4-5");
  eq("read back", parseScoreHash("#score=4-5"), { score: 4, of: 5 });
  eq("a score above its total is no score", parseScoreHash("#score=6-5"), null);
  eq("a link with anything else in it is no score", [parseScoreHash("#score=4-5&x=1"), parseScoreHash("#score=a-b"), parseScoreHash(""), parseScoreHash("#score=4-0"), parseScoreHash("#score=4-99")], [null, null, null, null, null]);
  eq("a result in a link", gotHash("roadtrip"), "#got=roadtrip");
  eq("read back when it is a known result", parseGotHash("#got=roadtrip", PROFILE_ORDER), "roadtrip");
  eq("an unknown result is none", [parseGotHash("#got=limo", PROFILE_ORDER), parseGotHash("#got=<b>", PROFILE_ORDER), parseGotHash("", PROFILE_ORDER)], [null, null, null]);
}

console.log("\nQuiz: what car fits your life");
{
  const Q = LIFE_QUESTIONS;
  eq("six questions", Q.map((q) => q.id), ["riders", "cargo", "miles", "parking", "budget", "mode"]);
  ok("3 or 4 answers each, ids once", Q.every((q) => q.options.length >= 3 && q.options.length <= 4 && new Set(q.options.map((o) => o.id)).size === q.options.length));
  ok("every answer has a label and an icon", Q.every((q) => q.options.every((o) => o.label.length > 3 && o.icon.startsWith("fa-"))));
  eq("five results, one for each id", Object.keys(LIFE_PROFILES).sort(), [...PROFILE_ORDER].sort());
  ok("every result names body types and says something", PROFILE_ORDER.every((id) => LIFE_PROFILES[id].id === id && LIFE_PROFILES[id].bodies.length > 0 && LIFE_PROFILES[id].lines.length >= 2));
  ok("no hype in a result", PROFILE_ORDER.every((id) => !HYPE.test(`${LIFE_PROFILES[id].title} ${LIFE_PROFILES[id].lines.join(" ")}`)));
  ok("only the first four questions score", Q.slice(0, 4).every((q) => q.options.every((o) => o.points)) && Q.slice(4).every((q) => q.options.every((o) => !o.points)));
  ok("points only go to real results", Q.every((q) => q.options.every((o) => Object.keys(o.points ?? {}).every((id) => PROFILE_ORDER.includes(id as ProfileId)))));

  const answer = (riders: string, cargo: string, miles: string, parking: string, budget = "open", mode = "unsure"): LifeAnswers => ({ riders, cargo, miles, parking, budget, mode });
  eq("no answers: no result", lifeResult(Q, {}), null);
  eq("five of six: still none", lifeResult(Q, { ...answer("solo", "light", "few", "tight"), mode: undefined }), null);
  eq("an answer that isn't one doesn't count", lifeResult(Q, { ...answer("solo", "light", "few", "tight"), mode: "fly" }), null);
  eq("alone, light, few miles, tight parking", lifeResult(Q, answer("solo", "light", "few", "tight")), "runabout");
  eq("two people, light, many miles", lifeResult(Q, answer("pair", "light", "many", "driveway")), "commuter");
  eq("a crew with gear and many miles", lifeResult(Q, answer("crew", "gear", "many", "room")), "roadtrip");
  eq("a full house", lifeResult(Q, answer("full", "gear", "some", "driveway")), "family");
  eq("tools and lumber", lifeResult(Q, answer("solo", "big", "some", "room")), "workhorse");
  eq("the points behind a result", lifeScores(Q, answer("crew", "gear", "many", "room")), { roadtrip: 6, family: 4, workhorse: 1, commuter: 2, runabout: 0 });

  // Every way through the four scoring questions.
  const reached = new Set<string>();
  let all = true;
  for (const r of Q[0].options) for (const c of Q[1].options) for (const m of Q[2].options) for (const p of Q[3].options) {
    const got = lifeResult(Q, answer(r.id, c.id, m.id, p.id));
    if (!got) all = false;
    else reached.add(got);
  }
  ok("every set of answers has a result", all);
  eq("and every result can be reached", [...reached].sort(), [...PROFILE_ORDER].sort());
  ok("budget and rent-or-own never change the type", Q[4].options.every((b) => Q[5].options.every((m) => lifeResult(Q, answer("crew", "gear", "many", "room", b.id, m.id)) === "roadtrip")));

  eq("the budgets are the budget guide's", [lifeBudgetMinor(Q, answer("solo", "light", "few", "tight", "low")), lifeBudgetMinor(Q, answer("solo", "light", "few", "tight", "mid"))], [BUDGETS_MAJOR[0] * 100, BUDGETS_MAJOR[1] * 100]);
  eq("over the top budget, or not sure: no limit", [lifeBudgetMinor(Q, answer("solo", "light", "few", "tight", "high")), lifeBudgetMinor(Q, answer("solo", "light", "few", "tight", "open"))], [null, null]);
  eq("rent or own", ["rent", "own", "rto", "unsure"].map((m) => lifeMode(Q, answer("solo", "light", "few", "tight", "open", m))), ["rent", "own", "rto", "unsure"]);

  const suv = lifeMatch(LIFE_PROFILES.roadtrip.bodies, SALE, RENT, null);
  eq("an SUV result shows the SUVs and wagons for sale, dearest first", suv.sale.map((c) => c.slug), ["2012-mercedes-glk", "2012-buick-enclave", "2011-acura-mdx", "2013-chevrolet-equinox", "2010-toyota-venza", "2001-lexus-rx"]);
  eq("and the ones to rent", suv.rent.map((c) => c.slug), ["2001-lexus-rx", "2010-toyota-venza", "2012-mercedes-glk", "2012-buick-enclave"]);
  eq("within a budget", lifeMatch(LIFE_PROFILES.roadtrip.bodies, SALE, RENT, 800000).sale.map((c) => c.slug), ["2013-chevrolet-equinox", "2010-toyota-venza", "2001-lexus-rx"]);
  const over = lifeMatch(LIFE_PROFILES.roadtrip.bodies, SALE, RENT, 400000);
  ok("nothing at the budget: the closest, marked as over it", over.overBudget && over.sale[0].slug === "2001-lexus-rx" && over.sale.every((c) => c.priceMinor > 400000), over);
  ok("a match within budget is never marked over it", !suv.overBudget && !lifeMatch(LIFE_PROFILES.roadtrip.bodies, SALE, RENT, 800000).overBudget);
  const truck = lifeMatch(["Truck"], SALE, RENT, null);
  eq("no car of the type: nothing, and not called over budget", [truck.sale.length, truck.rent.length, truck.overBudget], [0, 0, false]);
  ok("a listing with no body type is never guessed into a match", PROFILE_ORDER.every((id) => !lifeMatch(LIFE_PROFILES[id].bodies, SALE, RENT, null).sale.some((c) => c.slug === "2016-dodge-dart")));
  eq("body types are read the way compare reads them", [bodyOf("Suv"), bodyOf("4 - Door Sedan"), bodyOf(null, "Equinox", "LT Sport Utility 4D")], ["SUV", "Sedan", "SUV"]);
  eq("the shared line carries the result", lifeShareText(LIFE_PROFILES.roadtrip), "I got: The Road-Trip SUV. What car fits your life?");
}

console.log("\nGuess the price");
{
  const pending = { ...SALE[0], slug: "pending", pending: true };
  const noPhoto = { ...SALE[1], slug: "no-photo", image: null };
  const stock = [...SALE, pending, noPhoto];
  eq("only priced, photographed cars still for sale are played", priceEligible(stock).length, SALE.length);

  const game = priceRounds(stock, 1);
  eq("five rounds", game.length, PRICE_ROUNDS);
  ok("five different cars", new Set(game.map((r) => r.slug)).size === PRICE_ROUNDS);
  ok("never a pending car or one without a photo", game.every((r) => r.slug !== "pending" && r.slug !== "no-photo"));
  eq("the same seed deals the same game", priceRounds(stock, 1), game);
  ok("another seed deals another", JSON.stringify(priceRounds(stock, 2)) !== JSON.stringify(game));
  eq("three cars: three rounds", priceRounds(SALE.slice(0, 3), 1).length, 3);
  eq("no cars: no rounds", priceRounds([], 1), []);

  // Many games: every round's four prices hold up.
  let sound = true;
  const places = new Set<number>();
  for (let seed = 1; seed <= 200; seed++) {
    for (const r of priceRounds(stock, seed)) {
      const real = stock.find((c) => c.slug === r.slug)!.priceMinor;
      const o = r.optionsMinor;
      places.add(o.indexOf(real));
      if (o.length !== PRICE_OPTIONS || new Set(o).size !== PRICE_OPTIONS || !o.includes(real) || o.some((n) => n <= 0) || o.some((n, i) => i > 0 && n <= o[i - 1])) sound = false;
      // No wrong price within $100 of the right one, and none more than double it.
      if (o.some((n) => n !== real && (Math.abs(n - real) < 10000 || n > real * 2))) sound = false;
    }
  }
  ok("four different prices, lowest first, the real one among them", sound);
  eq("the real price turns up in every position", [...places].sort(), [0, 1, 2, 3]);
  const odd = priceOptions(599500, rng(5));
  ok("wrong prices keep the real one's last digits, so it isn't the odd one out", odd.every((n) => n % 10000 === 9500), odd);
  const tiny = priceOptions(20000, rng(5));
  ok("a very low price still gets four prices above zero", tiny.length === PRICE_OPTIONS && new Set(tiny).size === PRICE_OPTIONS && tiny.every((n) => n > 0) && tiny.includes(20000), tiny);

  const answers = [450000, 570000, 590000, 600000, 850000];
  eq("nothing guessed", priceScore(answers, []), 0);
  eq("three right, one wrong, one to go", priceScore(answers, [450000, 570000, 100, 600000]), 3);
  eq("all right", priceScore(answers, answers), 5);
  eq("the shared line carries the score and the rank", priceShareText(4, 5, rankFor(PRICE_RANKS, 4, 5)), "I scored 4 of 5 on Guess the Price (Sharp Eye). Can you beat it?");

  const g = getGuide("guess-the-price-game")!;
  ok("the guide counts its rounds from stock", g.words(DATA).short[0].includes("5 rounds") && g.words({ ...DATA, sale: SALE.slice(0, 3), saleTotal: 3 }).short[0].includes("3 rounds"));
  ok("and gives our own price range, nobody else's", g.words(DATA).short[2] === "Prices on our lot today run from **$4,500** to **$12,500**.", g.words(DATA).short[2]);
}

console.log("\nThe cheap car story");
{
  eq("seven moments in a year", STORY_STEPS.map((s) => s.id), ["recall", "tires", "title", "drive", "light", "service", "recheck"]);
  ok("two choices each: one checks, one leaves it to chance", STORY_STEPS.every((s) => s.choices.length === 2 && s.choices.filter((c) => c.chance).length === 1 && s.choices[0].id !== s.choices[1].id));
  ok("every choice has a consequence", STORY_STEPS.every((s) => s.choices.every((c) => c.label.length > 2 && c.result.length > 20)));
  const text = [...STORY_STEPS.flatMap((s) => [s.ask, ...s.choices.flatMap((c) => [c.label, c.result])]), ...STORY_ENDINGS.flatMap((e) => [e.title, e.line]), STORY_VERDICT].join(" ");
  ok("no repair bills, odds or statistics: no figure with a $ or a %", !/[$%]|\bpercent\b|\b\d+ (in|out of) \d+\b|\bon average\b|\bstudies\b/i.test(text));
  ok("nothing about North Carolina law", !/north carolina|\bnc\b|dmv|state inspection|notar|lien|salvage|by law|legally|illegal/i.test(text));
  ok("no hype", !HYPE.test(text));
  ok("a consequence that names NHTSA has its source", STORY_STEPS.every((s) => !s.choices.some((c) => /NHTSA|free/i.test(c.result)) || s.source?.url === NHTSA_RECALLS_URL));

  const paths = storyPaths(STORY_STEPS);
  eq("every way through: 2 to the 7th", paths.length, 128);
  ok("every way through is a whole story", paths.every((p) => storyDone(STORY_STEPS, p)));
  ok("and reaches an ending", paths.every((p) => storyEnding(STORY_ENDINGS, storyChances(STORY_STEPS, p)) != null));
  eq("every ending can be reached", [...new Set(paths.map((p) => storyEnding(STORY_ENDINGS, storyChances(STORY_STEPS, p))!.id))].sort(), STORY_ENDINGS.map((e) => e.id).sort());
  const picksOf = (skip: number) => Object.fromEntries(STORY_STEPS.map((s, i) => [s.id, i < skip ? "skip" : "check"]));
  eq("check everything", storyEnding(STORY_ENDINGS, storyChances(STORY_STEPS, picksOf(0)))!.id, "careful");
  eq("skip two", storyEnding(STORY_ENDINGS, storyChances(STORY_STEPS, picksOf(2)))!.id, "mostly");
  eq("skip three", storyEnding(STORY_ENDINGS, storyChances(STORY_STEPS, picksOf(3)))!.id, "gambler");
  eq("skip everything", storyEnding(STORY_ENDINGS, storyChances(STORY_STEPS, picksOf(7)))!.id, "sticker");
  eq("a half-told story isn't done", storyDone(STORY_STEPS, { recall: "check" }), false);
  eq("a choice that doesn't exist counts for nothing", storyChances(STORY_STEPS, { recall: "maybe" }), 0);
  eq("more chances than there are steps: no ending", storyEnding(STORY_ENDINGS, 99), null);

  const pair = storyCars(SALE)!;
  eq("the two cars: the lowest price, and the one nearest the title's higher price", [pair.cheap.slug, pair.pricier.slug, pair.gapMinor], ["2009-smart-fortwo", "2011-acura-mdx", 370000]);
  eq("one car, or one price: no pair", [storyCars(SALE.slice(0, 1)), storyCars(SALE.slice(0, 2))], [null, null]);
  eq("a pending car is left out", storyCars([{ ...SALE[0], pending: true }, SALE[2], SALE[12]])!.cheap.slug, "2001-mercedes-s430");
  const g = getGuide("true-cost-of-a-cheap-car")!;
  ok("the guide's prices are the pair's", g.words(DATA).short[0] === "Two real cars from our lot: **$4,500** and **$8,200**. Pick one." && g.words(DATA).sections[1].body[1].includes("**$3,700**"), g.words(DATA).short[0]);
  ok("the title's two round prices are the only typed ones", g.meta.title === "The $3,000 Car vs the $8,000 Car: Which Really Costs More?");
  eq("the shared line carries the ending", storyShareText(STORY_ENDINGS[0]), 'I got "The Careful Buyer" in the cheap car vs pricier car story. What would you do?');
}

console.log("\nRecall or not");
{
  eq("eight cards", RECALL_FACTS.length, 8);
  ok("ids once each", new Set(RECALL_FACTS.map((f) => f.id)).size === RECALL_FACTS.length);
  eq("as many true as false", RECALL_FACTS.filter((f) => f.answer).length, 4);
  ok("every card has a source on nhtsa.gov", RECALL_FACTS.every((f) => /^https:\/\/www\.nhtsa\.gov\//.test(f.url)));
  ok("and NHTSA's own words beside it", RECALL_FACTS.every((f) => f.quote.length > 30));
  ok("every card says why in one line", RECALL_FACTS.every((f) => f.why.length > 20 && f.why.length <= 140 && f.claim.length <= 80), RECALL_FACTS.filter((f) => f.why.length > 140 || f.claim.length > 80).map((f) => f.id));
  const text = RECALL_FACTS.map((f) => `${f.claim} ${f.why}`).join(" ");
  ok("nothing about North Carolina law", !/north carolina|\bnc\b|dmv|by law|legally|illegal/i.test(text));
  ok("no hype", !HYPE.test(text));
  const right = Object.fromEntries(RECALL_FACTS.map((f) => [f.id, f.answer]));
  const wrong = Object.fromEntries(RECALL_FACTS.map((f) => [f.id, !f.answer]));
  eq("all right", trueFalseScore(RECALL_FACTS, right), 8);
  eq("all wrong", trueFalseScore(RECALL_FACTS, wrong), 0);
  eq("nothing answered", trueFalseScore(RECALL_FACTS, {}), 0);
  eq("always tapping True gets half", trueFalseScore(RECALL_FACTS, Object.fromEntries(RECALL_FACTS.map((f) => [f.id, true]))), 4);
  eq("an answer for a card that doesn't exist counts for nothing", trueFalseScore(RECALL_FACTS, { nope: true }), 0);
  eq("the shared line carries the score and the rank", recallShareText(8, 8, rankFor(RECALL_RANKS, 8, 8)), "I got 8 of 8 on Recall or Not (Recall Pro). How much do you know about car recalls?");
  const w = getGuide("recall-or-not-quiz")!.words(DATA);
  ok("the guide counts its cards", w.short[0].includes("8 cards") && w.description.includes("8 true-or-false cards"));
  ok("and sends the reader to the free car check", w.cta.primary.href === "/us/check" && w.links[0].href === "/us/check");
}

console.log("\nRoad trips");
{
  eq("eight places", TRIP_PLACES.length, 8);
  ok("ids are slugs, once each", TRIP_PLACES.every((p) => isSlug(p.id)) && new Set(TRIP_PLACES.map((p) => p.id)).size === TRIP_PLACES.length);
  ok("nearest first", TRIP_PLACES.every((p, i) => i === 0 || TRIP_PLACES[i - 1].miles <= p.miles));
  ok("every distance has two sources", TRIP_PLACES.every((p) => /^https:\/\//.test(p.routed.source) && /^https:\/\//.test(p.check.source)));
  ok("each is the routed figure to the nearest 5", TRIP_PLACES.every((p) => p.miles === Math.round(p.routed.miles / 5) * 5), TRIP_PLACES.filter((p) => p.miles !== Math.round(p.routed.miles / 5) * 5).map((p) => p.id));
  ok("and within 10% of the second figure", TRIP_PLACES.every((p) => Math.abs(p.miles - p.check.miles) / p.check.miles <= 0.1), TRIP_PLACES.filter((p) => Math.abs(p.miles - p.check.miles) / p.check.miles > 0.1).map((p) => p.id));
  ok("all within a day's drive", TRIP_PLACES.every((p) => p.miles >= 20 && p.miles <= 350));
  eq("there and back", roundTripMiles(170), 340);

  for (const days of TRIP_DAYS) {
    const t = tripCost(RENT, days);
    ok(`${days} ${days === 1 ? "day" : "days"}: every car's rent is the booking form's`, t.rows.every((r) => r.cost == null || (r.cost.rentMinor === quoteRental(r.car.tariff, days).hireMinor && r.cost.depositMinor === r.car.tariff.depositMinor)));
    ok(`${days} ${days === 1 ? "day" : "days"}: lowest first, and "from" is the lowest`, t.fromMinor === Math.min(...RENT.map((c) => quoteRental(c.tariff, days).hireMinor)) && t.rows.every((r, i) => i === 0 || r.cost!.rentMinor >= t.rows[i - 1].cost!.rentMinor));
  }
  eq("1 day starts at the lowest daily rate", tripCost(RENT, 1).fromMinor, 6500);
  eq("7 days is a week's rate, not 7 days'", tripCost(RENT, 7).fromMinor, 35000);
  const weekOnly = [{ ...RENT[0], tariff: { ...RENT[0].tariff, minDays: 7 } }];
  eq("a car rented by the week only has no 1-day price", [tripCost(weekOnly, 1).fromMinor, tripCost(weekOnly, 1).rows[0].cost], [null, null]);
  eq("no fleet: no price", tripCost([], 2).fromMinor, null);

  const g = getGuide("road-trip-from-greensboro")!;
  const w = g.words(DATA);
  ok("the guide's prices are the trip's", w.short[1].includes("**$65** for 1 day") && w.short[1].includes("**$130** for 2"), w.short[1]);
  // "about 45 to 310 miles", "about 400 and 420 miles", "about **115 miles**": the word comes first, a few words back at most.
  const bare = everyWord(g.meta, w).map(plain).filter((t) => [...t.matchAll(/(\d[\d,]*) miles/g)].some((m) => Number(m[1].replace(/,/g, "")) >= 20 && !/about [^.]{0,24}$/i.test(t.slice(0, m.index))));
  ok("every distance in the words is called about", bare.length === 0, bare);
  ok("no fuel cost, mpg or drive time", !everyWord(g.meta, w).some((t) => /\bmpg\b|miles per gallon|gallons?\b|\bhours?\b.*drive|drive.*\bhours?\b|\bminutes\b/i.test(t)));
  ok("it never says unlimited miles are included", !everyWord(g.meta, w).some((t) => /unlimited/i.test(t) && !/does not say unlimited/i.test(t) && !t.endsWith("?")));
  ok("it says nothing about insurance", !everyWord(g.meta, w).some((t) => /insur/i.test(t)));
  eq("the shared line carries the trip", tripShareText(TRIP_PLACES[4], 2, "$130"), "Asheville and back, 2 days, from $130 in a rental car. Where would you go?");
  eq("with no price, it carries none", tripShareText(TRIP_PLACES[4], 1, null), "Asheville and back, 1 day. Where would you go?");

  const policy = RENTAL_POLICY_US.body.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  for (const phrase of TRIP_POLICY_RELIES_ON) {
    ok(`the policy still says: ${phrase}`, policy.includes(phrase));
  }
  ok("the mileage line is the policy's own sentence", TRIP_MILEAGE_NOTE.includes(TRIP_POLICY_RELIES_ON[0]));
  ok("the policy still names no number of miles (if it does, say it here)", !/\b\d[\d,]* ?(miles|mi)\b/i.test(policy));
}

// ── The page around a tool ────────────────────────────────────────────────
console.log("\nUpdated dates and photos");
eq("stock edited after the words: the stock's date", guideUpdated({ updated: "2026-11-12", live: true }, { stockUpdated: "2026-12-01T09:00:00.000Z" }), "2026-12-01");
eq("words edited after the stock: the words' date", guideUpdated({ updated: "2026-11-12", live: true }, { stockUpdated: "2026-10-25T14:25:26.264Z" }), "2026-11-12");
eq("a guide with no live numbers keeps its own date", guideUpdated({ updated: "2026-11-12", live: false }, { stockUpdated: "2026-12-01T09:00:00.000Z" }), "2026-11-12");
eq("no stock", guideUpdated({ updated: "2026-11-12", live: true }, { stockUpdated: null }), "2026-11-12");
{
  const picks = GUIDES.map((g) => ({ slug: g.meta.slug, photoSlug: g.words(DATA).photoSlug }));
  const photos = guidePhotos(picks, DATA);
  ok("every guide has a photo from stock", GUIDES.every((g) => photos[g.meta.slug]?.startsWith("https://photos.test/")));
  ok("no car twice", new Set(Object.values(photos)).size === GUIDES.length, photos);
  eq("two guides wanting one car: the second takes another", Object.values(guidePhotos([{ slug: "a", photoSlug: "2009-smart-fortwo" }, { slug: "b", photoSlug: "2009-smart-fortwo" }], DATA)), [
    "https://photos.test/2009-smart-fortwo.jpg",
    "https://photos.test/2001-lexus-rx.jpg",
  ]);
  eq("no photos in stock: none", guidePhotos(picks, EMPTY)[GUIDES[0].meta.slug], null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
