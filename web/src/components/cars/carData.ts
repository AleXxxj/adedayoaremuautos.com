/**
 * What the car lists and the car pages work out from a car's record: its
 * body type, the short name on a card, the facts line, which cars are alike,
 * and what a saved list may hold.
 *
 * Pure functions, no React and no database, shared by the server pages, the
 * client components and the cars route, and checked by scripts/verify-cars.ts.
 *
 * Records are typed by hand in the admin, so the same thing is spelled many
 * ways: a body style of "Suv", "4 - Door Sedan" or "5 door crossover/ SUV
 * (Wagon style crossover)"; a make of "Dodge Charger" with the model "R/T
 * Road Track Sedan 4D". Everything here reads those as a person would and
 * never changes what is stored. The full text still shows in the car's
 * specifications.
 */

import { formatDistance, type MarketConfig } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";

/* ── Body types ────────────────────────────────────────────────────────── */

/**
 * The body types a list can be narrowed to, in the order their chips show.
 * `test` is tried in this order, so "crossover/ SUV (Wagon style)" is an SUV
 * and "Hatchback Coupe" a hatchback.
 */
export const BODY_TYPES = [
  { key: "sedan", one: "Sedan", many: "Sedans" },
  { key: "suv", one: "SUV", many: "SUVs" },
  { key: "truck", one: "Truck", many: "Trucks" },
  { key: "van", one: "Van", many: "Vans" },
  { key: "hatchback", one: "Hatchback", many: "Hatchbacks" },
  { key: "coupe", one: "Coupe", many: "Coupes" },
  { key: "wagon", one: "Wagon", many: "Wagons" },
  { key: "convertible", one: "Convertible", many: "Convertibles" },
] as const;

export type BodyKey = (typeof BODY_TYPES)[number]["key"];

const BODY_TESTS: [BodyKey, RegExp][] = [
  ["suv", /\bsuv\b|sport[\s-]*utility|crossover|\b4x4\b/],
  ["truck", /truck|pick[\s-]?up|\b(crew|extended|regular|double) cab\b/],
  ["van", /\bvan\b|minivan|\bbus\b/],
  ["convertible", /convertible|cabriolet|roadster/],
  ["hatchback", /hatch/],
  ["wagon", /wagon|\bestate\b/],
  ["coupe", /coup[eé]/],
  ["sedan", /sedan|saloon/],
];

export const isBodyKey = (v: unknown): v is BodyKey =>
  typeof v === "string" && BODY_TYPES.some((t) => t.key === v);

export const bodyLabel = (key: BodyKey): string => BODY_TYPES.find((t) => t.key === key)!.one;

function bodyIn(text: string | null | undefined): BodyKey | null {
  const t = text?.toLowerCase().trim();
  if (!t) return null;
  return BODY_TESTS.find(([, re]) => re.test(t))?.[0] ?? null;
}

/**
 * A car's body type. The body style on file decides; where that says nothing
 * usable (empty, or a color typed in the wrong box), the model and trim are
 * read instead: "Equinox LT Sport Utility 4D" is an SUV.
 */
export function bodyTypeOf(car: {
  bodyStyle: string | null;
  model?: string | null;
  trim?: string | null;
}): BodyKey | null {
  return bodyIn(car.bodyStyle) ?? bodyIn([car.model, car.trim].filter(Boolean).join(" "));
}

export interface BodyCount {
  key: BodyKey;
  label: string;
  count: number;
}

/**
 * The body types these cars have, with how many of each. None at zero,
 * except the one that is `chosen`: a chip that is switched on stays on the
 * screen when the other filters leave it nothing, so it can be switched off.
 */
export function bodyCounts(
  cars: { bodyStyle: string | null; model?: string | null; trim?: string | null }[],
  chosen: BodyKey | null = null,
): BodyCount[] {
  const tally = new Map<BodyKey, number>();
  for (const car of cars) {
    const key = bodyTypeOf(car);
    if (key) tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return BODY_TYPES.filter((t) => tally.has(t.key) || t.key === chosen).map((t) => ({
    key: t.key,
    label: t.many,
    count: tally.get(t.key) ?? 0,
  }));
}

/* ── Names ─────────────────────────────────────────────────────────────── */

/**
 * Brands as they are written, with the other ways people type them. Only
 * used to find where the brand ends and the model begins.
 */
const BRANDS: [label: string, ...aliases: string[]][] = [
  ["Acura"],
  ["Alfa Romeo"],
  ["Aston Martin"],
  ["Audi"],
  ["Bentley"],
  ["BMW"],
  ["Buick"],
  ["Cadillac"],
  ["Chevrolet", "chevy"],
  ["Chrysler"],
  ["Dodge"],
  ["Ferrari"],
  ["Fiat"],
  ["Ford"],
  ["Genesis"],
  ["GMC"],
  ["Honda"],
  ["Hummer"],
  ["Hyundai"],
  ["Infiniti"],
  ["Isuzu"],
  ["Jaguar"],
  ["Jeep"],
  ["Kia"],
  ["Lamborghini"],
  ["Land Rover"],
  ["Lexus"],
  ["Lincoln"],
  ["Maserati"],
  ["Mazda"],
  ["Mercedes-Benz", "mercedes"],
  ["Mercury"],
  ["Mini"],
  ["Mitsubishi"],
  ["Nissan"],
  ["Oldsmobile"],
  ["Peugeot"],
  ["Pontiac"],
  ["Porsche"],
  ["Ram"],
  ["Rolls-Royce"],
  ["Saab"],
  ["Saturn"],
  ["Scion"],
  ["Smart"],
  ["Subaru"],
  ["Suzuki"],
  ["Tesla"],
  ["Toyota"],
  ["Volkswagen", "vw"],
  ["Volvo"],
];

/** Lower case, with hyphens and runs of spaces as one space. */
const plain = (s: string) => s.toLowerCase().replace(/[-\s]+/g, " ").trim();

/** Every spelling, longest first, so "mercedes benz" is tried before "mercedes". */
const SPELLINGS: { words: string; label: string }[] = BRANDS.flatMap(([label, ...aliases]) =>
  [label, ...aliases].map((a) => ({ words: plain(a), label })),
).sort((a, b) => b.words.length - a.words.length);

const startsWithWords = (text: string, words: string) =>
  text === words || text.startsWith(`${words} `);

/** The brand a make names when it is a brand and nothing else, or null. */
function pureBrand(make: string): string | null {
  const t = plain(make);
  return SPELLINGS.find((s) => s.words === t)?.label ?? null;
}

/** The brand a make begins with, or null: "Dodge Charger" → "Dodge". */
function leadingBrand(text: string): { label: string; words: string } | null {
  const t = plain(text);
  return SPELLINGS.find((s) => startsWithWords(t, s.words)) ?? null;
}

/**
 * The make to offer in a list's make filter: the brand when the make starts
 * with one we know ("Toyota Venza" → "Toyota"), otherwise the make as typed.
 */
export function brandOf(make: string): string {
  return leadingBrand(make)?.label ?? make.trim();
}

/**
 * Whether a car's make matches a `make` filter. A brand finds every car of
 * that brand, however the make was typed ("Mercedes" finds "Mercedes Benz");
 * anything else has to be the make exactly, as it always did.
 */
export function makeMatches(carMake: string, wanted: string): boolean {
  if (carMake === wanted) return true;
  const brand = pureBrand(wanted);
  return brand != null && leadingBrand(carMake)?.label === brand;
}

/** The makes to offer for these cars: each brand once, in alphabetical order. */
export function makeOptions(cars: { make: string }[]): string[] {
  return [...new Set(cars.map((c) => brandOf(c.make)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export interface NameParts {
  /** "2017 · Hyundai": the small line over the name. */
  kicker: string;
  /** "Sonata": the name shown big. */
  name: string;
  /** "LT Sedan 4D": what follows the name, shown smaller. May be empty. */
  detail: string;
  /** "2015 Chevrolet Malibu LT Sedan 4D": the whole name, as stored. */
  full: string;
}

/**
 * A car's name in three parts. The brand is found at the start of the make,
 * the model and the trim read together, so "Dodge Charger" + "R/T Road Track
 * Sedan 4D" is Dodge · Charger · R/T Road Track Sedan 4D, and "Mercedes" +
 * "Benz" + "Glk" is Mercedes-Benz · Glk. A make we don't know stays whole.
 */
export function splitName(car: {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
}): NameParts {
  const fields = [car.make, car.model, car.trim ?? ""].map((f) => f.trim().replace(/\s+/g, " "));
  const full = [car.year, ...fields].filter(Boolean).join(" ");

  const brand = leadingBrand(fields.filter(Boolean).join(" "));
  // What is left of each field once the brand's words are taken off the front.
  const left = brand ? takeWords(fields, brand.words) : null;
  const label = left ? brand!.label : fields[0];
  const rest = left ?? ["", fields[1], fields[2]];

  const parts = rest.filter(Boolean);
  const name = parts[0] ?? label;
  return {
    kicker: [car.year, parts.length ? label : ""].filter(Boolean).join(" · "),
    name,
    detail: parts.slice(1).join(" "),
    full,
  };
}

/**
 * Removes `words` from the front of the fields, a whole typed word at a time,
 * or null when the brand ends in the middle of one.
 */
function takeWords(fields: string[], words: string): string[] | null {
  let taken = "";
  const rest = fields.map((f) => (f ? f.split(" ") : []));
  for (const tokens of rest) {
    while (tokens.length && taken !== words) {
      const next = `${taken} ${plain(tokens[0])}`.trim();
      if (!startsWithWords(words, next)) return null;
      taken = next;
      tokens.shift();
    }
    if (taken === words) break;
  }
  return taken === words ? rest.map((tokens) => tokens.join(" ")) : null;
}

/* ── Facts ─────────────────────────────────────────────────────────────── */

/** "6- speed Automatic" and "CVT Automatic" are both "Automatic" on a chip. */
export function shortTransmission(value: string | null | undefined): string | null {
  const t = value?.trim();
  if (!t) return null;
  if (/manual|stick/i.test(t)) return "Manual";
  if (/auto|cvt|dct|tiptronic/i.test(t)) return "Automatic";
  return t;
}

/** "FWD (Front Wheel Drive)" → "FWD". Anything unrecognized stays as typed. */
export function shortDrive(value: string | null | undefined): string | null {
  const t = value?.trim();
  if (!t) return null;
  if (/\bawd\b|all[\s-]*wheel/i.test(t)) return "AWD";
  if (/\b4wd\b|4x4|four[\s-]*wheel/i.test(t)) return "4WD";
  if (/\bfwd\b|front[\s-]*wheel/i.test(t)) return "FWD";
  if (/\brwd\b|rear[\s-]*wheel/i.test(t)) return "RWD";
  return t;
}

/** "Gasoline" and "Petrol" are "Gas" in the United States, "Petrol" in Nigeria. */
export function shortFuel(
  value: string | null | undefined,
  market: Pick<MarketConfig, "code">,
): string | null {
  const t = value?.trim();
  if (!t) return null;
  if (/hybrid/i.test(t)) return "Hybrid";
  if (/electric|\bev\b/i.test(t)) return "Electric";
  if (/diesel/i.test(t)) return "Diesel";
  if (/gas|petrol/i.test(t)) return market.code === "us" ? "Gas" : "Petrol";
  return t;
}

/** Published in the last seven days, by the clock it is given. */
export function isJustIn(publishedAt: Date | string | null | undefined, now: Date): boolean {
  if (!publishedAt) return false;
  const at = new Date(publishedAt).getTime();
  if (!Number.isFinite(at)) return false;
  const age = now.getTime() - at;
  return age >= 0 && age < 7 * 24 * 60 * 60 * 1000;
}

/* ── A car as a card shows it ──────────────────────────────────────────── */

/**
 * The public facts of one listed car: what a card needs and nothing else.
 * This is also what the cars route sends, so it holds no identifier beyond
 * the slug: no VIN, no stock number, no internal id.
 */
export interface PublicCar {
  slug: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  bodyStyle: string | null;
  mileage: number | null;
  transmission: string | null;
  fuelType: string | null;
  drivetrain: string | null;
  seats: number | null;
  /** The first photo's address, or null. */
  image: string | null;
  /** A sale is being arranged. */
  pending: boolean;
  /** Listed in the last week. */
  justIn: boolean;
  /** Set when the car is for sale; the price may still be on request. */
  sale: { priceMinor: number | null } | null;
  /** Set when the car can be rented. */
  rent: { dailyMinor: number; weeklyMinor: number | null; driver: boolean } | null;
}

export type ListKind = "sale" | "rent";

export interface CardView {
  slug: string;
  href: string;
  image: string | null;
  kicker: string;
  name: string;
  detail: string;
  /** "82,000 mi · Automatic · FWD" */
  facts: string;
  /** "$8,500", "$350", "Price on request" */
  price: string;
  /** "a week"; nothing for a sale price. */
  unit: string | null;
  /** "or $65 a day" */
  sub: string | null;
  badge: string | null;
  /** The whole name, for the Save button's label. */
  full: string;
}

/**
 * One car as a card: where it goes, its name in parts, one line of facts and
 * its price. On the sale list a car shows its sale price and opens its sale
 * page; on the rental list its weekly rate and its rental page. A saved car
 * that the list in front of you doesn't offer shows the other.
 */
export function cardFor(car: PublicCar, market: MarketConfig, prefer: ListKind): CardView {
  const kind: ListKind = prefer === "rent" ? (car.rent ? "rent" : "sale") : car.sale ? "sale" : "rent";
  const fmt = (minor: number) => formatMoney(money(minor, market.currency), market.locale);
  const { kicker, name, detail, full } = splitName(car);
  const base = { slug: car.slug, image: car.image, kicker, name, detail, full };

  if (kind === "rent" && car.rent) {
    const { dailyMinor, weeklyMinor, driver } = car.rent;
    return {
      ...base,
      href: `/${market.code}/rentals/${car.slug}`,
      facts: [
        shortTransmission(car.transmission),
        shortFuel(car.fuelType, market),
        car.seats != null && `${car.seats} seats`,
      ]
        .filter(Boolean)
        .join(" · "),
      price: fmt(weeklyMinor ?? dailyMinor),
      unit: weeklyMinor != null ? "a week" : "a day",
      sub: weeklyMinor != null ? `or ${fmt(dailyMinor)} a day` : null,
      badge: driver ? "Driver available" : null,
    };
  }

  return {
    ...base,
    href: `/${market.code}/inventory/${car.slug}`,
    facts: [
      car.mileage != null && formatDistance(car.mileage, market),
      shortTransmission(car.transmission),
      shortDrive(car.drivetrain) ?? shortFuel(car.fuelType, market),
    ]
      .filter(Boolean)
      .join(" · "),
    price: car.sale?.priceMinor != null ? fmt(car.sale.priceMinor) : "Price on request",
    unit: null,
    sub: null,
    badge: car.pending ? "Sale pending" : car.justIn ? "Just in" : null,
  };
}

/** A figure rounded to its two leading digits: 17,667 → 18,000. */
export function roundFigure(n: number): number {
  if (!(n > 0)) return 0;
  const unit = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / unit) * unit;
}

/**
 * Where to cut a list of prices into up to three bands: round figures a
 * third and two thirds of the way from the lowest to the highest, each with
 * prices on both sides of it. No cuts when every price is the same.
 */
export function priceCuts(prices: number[]): number[] {
  if (prices.length === 0) return [];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return [];
  const step = (max - min) / 3;
  return [...new Set([roundFigure(min + step), roundFigure(min + step * 2)])].filter(
    (cut) => cut > min && cut < max,
  );
}

/**
 * A "lo-hi" price filter as its two ends, or null when it is not one. The
 * high end may be left off ("29000-"): no upper limit.
 */
export function parseBand(value: string | null | undefined): { lo: number; hi: number | null } | null {
  const m = /^(\d{1,12})-(\d{1,12})?$/.exec(value ?? "");
  if (!m) return null;
  return { lo: Number(m[1]), hi: m[2] != null ? Number(m[2]) : null };
}

/** What a week in a rental costs: its weekly rate, or seven days without one. */
export const weekCostOf = (rent: { dailyMinor: number; weeklyMinor: number | null }) =>
  rent.weeklyMinor ?? rent.dailyMinor * 7;

/** As much of a car as "which cars are like this one" reads. */
export interface CarLike {
  slug: string;
  bodyStyle: string | null;
  model?: string | null;
  trim?: string | null;
}

/**
 * The cars most like this one: the same body type first, then the nearest
 * price. `mine` and `price` are whatever the list is priced in (a sale price,
 * or what a week costs); a car with none goes last. Never the car itself.
 */
export function similarCars<T extends CarLike>(
  current: CarLike,
  mine: number | null,
  others: T[],
  price: (car: T) => number | null,
  k = 3,
): T[] {
  const body = bodyTypeOf(current);
  const gap = (car: T) => {
    const p = price(car);
    return mine == null || p == null ? Number.POSITIVE_INFINITY : Math.abs(p - mine);
  };
  return others
    .filter((car) => car.slug !== current.slug)
    .map((car, i) => ({ car, i, alike: body != null && bodyTypeOf(car) === body ? 0 : 1, gap: gap(car) }))
    .sort((a, b) => a.alike - b.alike || a.gap - b.gap || a.i - b.i)
    .slice(0, k)
    .map((r) => r.car);
}

/** Where two cars are compared side by side. */
export const compareHref = (market: string, a: string, b: string) => `/${market}/compare?cars=${a},${b}`;

/* ── Saved and recently viewed ─────────────────────────────────────────── */

/**
 * What a slug can be. The admin makes them from a car's name: lower-case
 * letters, digits, hyphens and the odd underscore, 90 characters and a
 * "-2" at most. Anything else is not a slug and is never sent anywhere.
 */
export const SLUG_PATTERN = /^[a-z0-9_][a-z0-9_-]{0,119}$/;

export const isSlug = (v: unknown): v is string => typeof v === "string" && SLUG_PATTERN.test(v);

/** How many cars one request to the cars route may ask for. */
export const SLUGS_PER_REQUEST = 12;
/** How many cars a browser keeps saved. The oldest go first. */
export const MAX_SAVED = 24;
/** How many viewed cars a browser remembers. */
export const MAX_RECENT = 8;
/** How many of them a car page shows. */
export const RECENT_SHOWN = 4;

/**
 * The slugs in a `slugs=a,b,c` parameter, or null when it is not exactly
 * that: empty, more than twelve, or any piece that is not a slug. Repeats
 * are dropped.
 */
export function parseSlugList(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  const parts = raw.split(",");
  if (parts.length > SLUGS_PER_REQUEST || !parts.every(isSlug)) return null;
  return [...new Set(parts)];
}

/** Whatever was in storage, reduced to a list of slugs. Never throws. */
export function slugsFrom(stored: string | null | undefined, max: number): string[] {
  if (!stored) return [];
  try {
    const value: unknown = JSON.parse(stored);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter(isSlug))].slice(0, max);
  } catch {
    return [];
  }
}

/** Saves a car, or takes it off the list. Newest first. */
export function toggleSlug(list: string[], slug: string, max = MAX_SAVED): string[] {
  if (!isSlug(slug)) return list;
  return list.includes(slug) ? list.filter((s) => s !== slug) : [slug, ...list].slice(0, max);
}

/** Puts a car at the front of the recently viewed list. */
export function withRecent(list: string[], slug: string, max = MAX_RECENT): string[] {
  if (!isSlug(slug)) return list;
  return [slug, ...list.filter((s) => s !== slug)].slice(0, max);
}

/** A list of slugs as requests of twelve, each sorted so it caches well. */
export function slugRequests(slugs: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < slugs.length; i += SLUGS_PER_REQUEST) {
    out.push(slugs.slice(i, i + SLUGS_PER_REQUEST).sort());
  }
  return out;
}

/* ── "I'm interested" ──────────────────────────────────────────────────── */

/**
 * The three things a buyer can say with one tap. The sentence is sent as the
 * message; "Can I see it today?" is filed as a test drive, the others as a
 * general inquiry.
 */
export const INTEREST_CHOICES = [
  { id: "available", sentence: "Is it still available?", type: "contact", icon: "fa-circle-question" },
  { id: "see", sentence: "Can I see it today?", type: "test_drive", icon: "fa-calendar-day" },
  { id: "buy", sentence: "I want to buy it", type: "contact", icon: "fa-handshake" },
] as const;

export type InterestId = (typeof INTEREST_CHOICES)[number]["id"];
