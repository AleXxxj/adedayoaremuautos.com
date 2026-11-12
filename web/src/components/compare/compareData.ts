/**
 * Compare's arithmetic: which cars a link names, what each row says, which
 * value is the better one, and the one-line difference for each car.
 *
 * Pure functions, no React and no database, shared by the server page and
 * its client components and checked by scripts/verify-guides.ts.
 *
 * "Better" is only ever a fact: a lower price, a newer year, fewer miles,
 * more seats, a lower rent or deposit. Nothing here has an opinion about
 * body style, engine, fuel or features.
 */
import { formatMoney, money, type CurrencyCode } from "@/lib/money";

/** A comparison is two cars, or three. */
export const MIN_COMPARE = 2;
export const MAX_COMPARE = 3;

/** A slug as the admin makes them: lowercase letters and digits, single hyphens. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isSlug = (s: string) => s.length > 0 && s.length <= 120 && SLUG.test(s);

/**
 * The slugs in `?cars=a,b,c`: well-formed ones only, each once, three at most.
 *
 * `rejected` counts what was thrown away, so the page can say a car was
 * dropped. The text itself is never shown or logged: a link can carry
 * anything, and a VIN pasted where a slug belongs must not be echoed.
 */
export function parseCarsParam(raw: string | string[] | undefined): {
  slugs: string[];
  rejected: number;
} {
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (!text) return { slugs: [], rejected: 0 };
  const slugs: string[] = [];
  let rejected = 0;
  for (const part of text.split(",")) {
    const slug = part.trim();
    if (!slug) continue;
    if (!isSlug(slug)) {
      rejected++;
      continue;
    }
    if (slugs.includes(slug)) continue;
    if (slugs.length >= MAX_COMPARE) {
      rejected++;
      continue;
    }
    slugs.push(slug);
  }
  return { slugs, rejected };
}

/** `/us/compare?cars=a,b`, or the bare page when no car is chosen. */
export function compareHref(market: string, slugs: string[]): string {
  const clean = slugs.filter(isSlug).slice(0, MAX_COMPARE);
  return clean.length ? `/${market}/compare?cars=${clean.join(",")}` : `/${market}/compare`;
}

/**
 * The chosen cars with `slug` put in column `slot`: it replaces the car
 * there, or is added when the slot is past the last car. A car already
 * chosen in another column swaps places, so nothing is dropped or doubled.
 */
export function withCarAt(slugs: string[], slot: number, slug: string): string[] {
  const next = [...slugs];
  const already = next.indexOf(slug);
  if (already === slot) return next;
  if (already !== -1) {
    if (slot < next.length) [next[already], next[slot]] = [next[slot], next[already]];
    return next;
  }
  if (slot < next.length) next[slot] = slug;
  else next.push(slug);
  return next.slice(0, MAX_COMPARE);
}

export const withoutCar = (slugs: string[], slug: string) => slugs.filter((s) => s !== slug);

export type BodyGroup =
  | "SUV"
  | "Truck"
  | "Van"
  | "Wagon"
  | "Hatchback"
  | "Coupe"
  | "Convertible"
  | "Sedan";

/** First match wins: "5 door crossover / SUV (wagon style)" is an SUV. */
const BODY_GROUPS: [BodyGroup, RegExp][] = [
  ["SUV", /\bsuv\b|sport utility|crossover/i],
  ["Truck", /\btruck\b|pick ?up\b|crew cab|extended cab/i],
  ["Van", /\bvan\b|minivan/i],
  ["Wagon", /wagon/i],
  ["Hatchback", /hatch/i],
  ["Convertible", /convertible|cabrio|roadster/i],
  ["Coupe", /coupe/i],
  ["Sedan", /sedan|saloon/i],
];

function groupOf(text: string | null | undefined): BodyGroup | null {
  if (!text) return null;
  for (const [group, pattern] of BODY_GROUPS) if (pattern.test(text)) return group;
  return null;
}

/**
 * The body type a listing means. Body styles are typed by hand ("Suv",
 * "4 - Door Sedan", once a color), so the stored value is read first and,
 * when it names no body type, the model and trim are ("LT Sport Utility 4D").
 */
export function bodyGroup(
  bodyStyle: string | null | undefined,
  ...hints: (string | null | undefined)[]
): BodyGroup | null {
  return groupOf(bodyStyle) ?? groupOf(hints.filter(Boolean).join(" "));
}

/** What compare knows about one car. Everything a row can show, nothing else. */
export interface CompareCar {
  slug: string;
  /** "2016 Nissan Altima Sedan 4D 2.5 S" */
  name: string;
  /** Without the trim, for headings and column heads. */
  short: string;
  year: number;
  image: string | null;
  /** Listed for sale. A car only for rent is not. */
  forSale: boolean;
  priceMinor: number | null;
  mileage: number | null;
  bodyStyle: string | null;
  bodyGroup: BodyGroup | null;
  engine: string | null;
  transmission: string | null;
  drivetrain: string | null;
  fuel: string | null;
  seats: number | null;
  features: string[];
  rental: {
    dailyMinor: number;
    weeklyMinor: number | null;
    depositMinor: number;
    /** The weekly rate, or seven days where the car has none. */
    weekCostMinor: number;
  } | null;
}

export interface CompareFormat {
  currency: CurrencyCode;
  locale: string;
  distanceUnit: "mi" | "km";
}

export interface CompareCell {
  text: string;
  /** Nothing on the listing for this row. */
  missing: boolean;
  /** "Lower", "Newest": set on the better value, null everywhere else. */
  better: string | null;
}

export interface CompareRow {
  key: string;
  label: string;
  icon: string;
  cells: CompareCell[];
}

const NOT_LISTED = "Not listed";

/**
 * Which cars hold the better value: every car has to have one, and they
 * can't all be the same. Ties for the better value are all marked.
 */
export function betterIndexes(values: (number | null)[], want: "low" | "high"): number[] {
  if (values.length < 2 || values.some((v) => v == null)) return [];
  const nums = values as number[];
  const target = want === "low" ? Math.min(...nums) : Math.max(...nums);
  if (nums.every((n) => n === target)) return [];
  return nums.flatMap((n, i) => (n === target ? [i] : []));
}

/** Rows for the table, in reading order. A row no car has anything for is left out. */
export function compareRows(cars: CompareCar[], f: CompareFormat): CompareRow[] {
  const fmt = (minor: number) => formatMoney(money(minor, f.currency), f.locale);
  const num = (n: number) => new Intl.NumberFormat(f.locale).format(n);
  const many = cars.length > 2;
  const rows: CompareRow[] = [];

  const numeric = (
    key: string,
    label: string,
    icon: string,
    values: (number | null)[],
    show: (n: number, i: number) => string,
    want: "low" | "high",
    words: [string, string],
    missing: string | ((i: number) => string) = NOT_LISTED,
  ) => {
    if (values.every((v) => v == null)) return;
    const better = betterIndexes(values, want);
    rows.push({
      key,
      label,
      icon,
      cells: values.map((v, i) => ({
        text: v != null ? show(v, i) : typeof missing === "string" ? missing : missing(i),
        missing: v == null,
        better: better.includes(i) ? words[many ? 1 : 0] : null,
      })),
    });
  };

  const text = (key: string, label: string, icon: string, values: (string | null)[]) => {
    if (values.every((v) => !v)) return;
    rows.push({
      key,
      label,
      icon,
      cells: values.map((v) => ({ text: v || NOT_LISTED, missing: !v, better: null })),
    });
  };

  // Price, when any of them is for sale.
  if (cars.some((c) => c.forSale)) {
    numeric(
      "price",
      "Price",
      "fa-tag",
      cars.map((c) => (c.forSale ? c.priceMinor : null)),
      (n) => fmt(n),
      "low",
      ["Lower", "Lowest"],
      (i) => (cars[i].forSale ? "Ask us" : "Rental only"),
    );
  }

  // Rental rows only when every car can be rented: the spec's "rentals too
  // if both are rentals". One rental beside a car that can't be rented would
  // be a column of blanks.
  if (cars.every((c) => c.rental)) {
    // What a week costs: the weekly rate, or seven days for a car that has
    // none, said as such. The same figure the difference lines use, so
    // "Rents for $95 more a week" can be read off this row.
    numeric(
      "weekly",
      "Rent a week",
      "fa-key",
      cars.map((c) => c.rental!.weekCostMinor),
      (n, i) => (cars[i].rental!.weeklyMinor != null ? fmt(n) : `${fmt(n)} for 7 days`),
      "low",
      ["Lower", "Lowest"],
    );
    numeric(
      "daily",
      "Rent a day",
      "fa-calendar-day",
      cars.map((c) => c.rental!.dailyMinor),
      (n) => fmt(n),
      "low",
      ["Lower", "Lowest"],
    );
    numeric(
      "deposit",
      "Deposit",
      "fa-shield-halved",
      cars.map((c) => c.rental!.depositMinor),
      (n) => (n > 0 ? fmt(n) : "None"),
      "low",
      ["Lower", "Lowest"],
    );
  }

  numeric("year", "Year", "fa-calendar", cars.map((c) => c.year), (n) => String(n), "high", ["Newer", "Newest"]);
  numeric(
    "miles",
    f.distanceUnit === "mi" ? "Miles" : "Kilometers",
    "fa-gauge-high",
    cars.map((c) => c.mileage),
    (n) => `${num(n)} ${f.distanceUnit}`,
    "low",
    ["Fewer", "Fewest"],
  );
  text("body", "Body", "fa-car-side", cars.map((c) => c.bodyGroup ?? c.bodyStyle));
  text("engine", "Engine", "fa-gears", cars.map((c) => c.engine));
  text("transmission", "Transmission", "fa-gear", cars.map((c) => c.transmission));
  text("drive", "Drive", "fa-road", cars.map((c) => c.drivetrain));
  text("fuel", "Fuel", "fa-gas-pump", cars.map((c) => c.fuel));
  numeric("seats", "Seats", "fa-user-group", cars.map((c) => c.seats), (n) => String(n), "high", ["More", "Most"]);

  return rows;
}

const plural = (n: number, one: string, more: string) => `${n} ${n === 1 ? one : more}`;

/**
 * One line of plain facts for each car, in the cars' order.
 *
 * Two cars are measured against each other: "Costs $2,400 less. 3 years
 * older. 21,000 more miles." Three are measured against the lowest price,
 * the newest year and the fewest miles among them. A fact a listing doesn't
 * carry is left out, never guessed.
 */
export function differenceLines(cars: CompareCar[], f: CompareFormat): string[][] {
  const fmt = (minor: number) => formatMoney(money(minor, f.currency), f.locale);
  const num = (n: number) => new Intl.NumberFormat(f.locale).format(n);
  const unit = f.distanceUnit === "mi" ? "miles" : "km";
  const out: string[][] = cars.map(() => []);
  if (cars.length < MIN_COMPARE) return out;

  const prices = cars.map((c) => (c.forSale ? c.priceMinor : null));
  const rents = cars.every((c) => c.rental) ? cars.map((c) => c.rental!.weekCostMinor) : cars.map(() => null);
  const years = cars.map((c) => c.year);
  const miles = cars.map((c) => c.mileage);
  const seats = cars.map((c) => c.seats);
  const all = (values: (number | null)[]): values is number[] => values.every((v) => v != null);

  if (cars.length === 2) {
    for (const i of [0, 1]) {
      const o = 1 - i;
      if (all(prices)) {
        const d = prices[i] - prices[o];
        out[i].push(d === 0 ? "Same price." : `Costs ${fmt(Math.abs(d))} ${d < 0 ? "less" : "more"}.`);
      }
      if (all(rents)) {
        const d = rents[i] - rents[o];
        out[i].push(
          d === 0 ? "Same rent a week." : `Rents for ${fmt(Math.abs(d))} ${d < 0 ? "less" : "more"} a week.`,
        );
      }
      {
        const d = years[i] - years[o];
        out[i].push(d === 0 ? "Same year." : `${plural(Math.abs(d), "year", "years")} ${d > 0 ? "newer" : "older"}.`);
      }
      if (all(miles)) {
        const d = miles[i] - miles[o];
        out[i].push(d === 0 ? `Same ${unit}.` : `${num(Math.abs(d))} ${d < 0 ? "fewer" : "more"} ${unit}.`);
      }
      if (all(seats) && seats[i] !== seats[o]) {
        const d = seats[i] - seats[o];
        out[i].push(`${plural(Math.abs(d), "seat", "seats")} ${d > 0 ? "more" : "fewer"}.`);
      }
    }
    return out;
  }

  // Three cars: each against the lowest, the newest, the fewest.
  const against = (
    values: (number | null)[],
    want: "low" | "high",
    atBest: string,
    behind: (gap: number) => string,
  ) => {
    if (!all(values)) return;
    const best = want === "low" ? Math.min(...values) : Math.max(...values);
    if (values.every((v) => v === best)) return;
    const tied = values.filter((v) => v === best).length > 1;
    values.forEach((v, i) => {
      out[i].push(v === best ? `${atBest}${tied ? ", tied" : ""}.` : behind(Math.abs(v - best)));
    });
  };
  against(prices, "low", "Lowest price", (gap) => `Costs ${fmt(gap)} more than the lowest.`);
  against(rents, "low", "Lowest rent", (gap) => `Rents for ${fmt(gap)} more a week than the lowest.`);
  against(years, "high", "Newest", (gap) => `${plural(gap, "year", "years")} older than the newest.`);
  against(miles, "low", `Fewest ${unit}`, (gap) => `${num(gap)} more ${unit} than the lowest.`);
  return out;
}

/** Letters and digits only, so "Power windows" and "power-windows" are one feature. */
const featureKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * The features each listing has that none of the others list, in the cars'
 * order, or null when no listing has any. Features are typed by hand per car,
 * so this compares what is written, and the page says so.
 */
export function featuresOnlyOn(cars: CompareCar[]): string[][] | null {
  const lists = cars.map((c) => {
    const seen = new Set<string>();
    return c.features
      .map((x) => x.trim())
      .filter((x) => {
        const key = featureKey(x);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  });
  if (lists.every((l) => l.length === 0)) return null;
  return lists.map((list, i) => {
    const others = new Set(lists.flatMap((l, j) => (j === i ? [] : l.map(featureKey))));
    return list.filter((x) => !others.has(featureKey(x)));
  });
}

/**
 * Pairs worth offering as one-tap comparisons: the same body type and the
 * nearest prices, closest first. A car appears in two pairs at most, so one
 * popular price doesn't fill the list. Where no two cars share a body type,
 * the nearest prices of any kind.
 *
 * Sale prices where cars are for sale; a week's rent where the stock is
 * rentals only.
 */
export function popularPairs(cars: CompareCar[], k = 6): [CompareCar, CompareCar][] {
  const forSale = cars.filter((c) => c.forSale && c.priceMinor != null);
  const useSale = forSale.length >= 2;
  const pool = useSale ? forSale : cars.filter((c) => c.rental);
  const cost = (c: CompareCar) => (useSale ? c.priceMinor! : c.rental!.weekCostMinor);

  const adjacent = (group: CompareCar[]) => {
    const sorted = [...group].sort((a, b) => cost(a) - cost(b) || a.slug.localeCompare(b.slug));
    const pairs: { a: CompareCar; b: CompareCar; gap: number }[] = [];
    for (let i = 0; i + 1 < sorted.length; i++) {
      pairs.push({ a: sorted[i], b: sorted[i + 1], gap: cost(sorted[i + 1]) - cost(sorted[i]) });
    }
    return pairs;
  };

  const groups = new Map<string, CompareCar[]>();
  for (const car of pool) {
    if (!car.bodyGroup) continue;
    groups.set(car.bodyGroup, [...(groups.get(car.bodyGroup) ?? []), car]);
  }
  let candidates = [...groups.values()].flatMap(adjacent);
  if (candidates.length === 0) candidates = adjacent(pool);
  candidates.sort((x, y) => x.gap - y.gap || cost(x.a) - cost(y.a) || x.a.slug.localeCompare(y.a.slug));

  const used = new Map<string, number>();
  const out: [CompareCar, CompareCar][] = [];
  for (const { a, b } of candidates) {
    if (out.length >= k) break;
    if ((used.get(a.slug) ?? 0) >= 2 || (used.get(b.slug) ?? 0) >= 2) continue;
    used.set(a.slug, (used.get(a.slug) ?? 0) + 1);
    used.set(b.slug, (used.get(b.slug) ?? 0) + 1);
    out.push([a, b]);
  }
  return out;
}
