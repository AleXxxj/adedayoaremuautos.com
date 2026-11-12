/**
 * The home page's arithmetic: which chips to offer and where a search goes.
 *
 * Pure functions, no React and no database, shared by the server page and
 * its client components and checked by scripts/verify-home.ts. Every chip is
 * computed from the cars actually listed, so none of them leads nowhere.
 */

/** "1 car", "11 cars". */
export const carsLabel = (n: number) => `${n} ${n === 1 ? "car" : "cars"}`;

/** Round budgets, as multiples of a power of ten. */
const STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5];

/** Every round budget from 100 to 10 billion, in whole currency units. */
const LADDER: number[] = [];
for (let power = 100; power <= 1e10; power *= 10) {
  for (const step of STEPS) LADDER.push(step * power);
}

export interface Ceiling {
  /** Whole currency units: dollars, naira. */
  major: number;
  /** Cars priced at or under it. */
  count: number;
}

/**
 * Round price ceilings that each have at least one car under them, and each
 * more than the one before, from the cheapest car up to the dearest.
 *
 * @param pricesMajor every listed price, in whole units (no nulls)
 * @param includeAll  keep the first ceiling that covers every car: right for
 *                    the budget finder ("16 cars for $15,000 or less"), not
 *                    for a search chip that would lead to the full list
 */
export function priceCeilings(pricesMajor: number[], includeAll: boolean): Ceiling[] {
  const prices = [...pricesMajor].sort((a, b) => a - b);
  if (prices.length === 0) return [];
  const out: Ceiling[] = [];
  for (const major of LADDER) {
    let count = 0;
    while (count < prices.length && prices[count] <= major) count++;
    if (count === 0) continue;
    if (out.length && out[out.length - 1].count === count) continue;
    if (count === prices.length) {
      if (includeAll) out.push({ major, count });
      break;
    }
    out.push({ major, count });
  }
  return out;
}

/**
 * Weekly budgets for the finder: the fleet's own weekly rates, lowest first,
 * each covering more cars than the one before, and fewer than the whole fleet
 * unless that is all there is. Any unit, as long as both lists share it.
 *
 * @param rates     the weekly rates on file
 * @param weekCosts what a week of each car costs (a car with no weekly rate
 *                  costs seven days), compared with each budget
 */
export function weeklyBudgets(rates: number[], weekCosts: number[], k: number): number[] {
  const steps: { rate: number; count: number }[] = [];
  for (const rate of [...new Set(rates)].sort((a, b) => a - b)) {
    const count = weekCosts.filter((c) => c <= rate).length;
    if (count === 0 || (steps.length && steps[steps.length - 1].count === count)) continue;
    steps.push({ rate, count });
  }
  const partial = steps.filter((s) => s.count < weekCosts.length);
  return (partial.length ? partial : steps).slice(0, k).map((s) => s.rate);
}

/** Up to `k` items spread evenly from the first to the last. */
export function spread<T>(items: T[], k: number): T[] {
  if (items.length <= k) return items;
  if (k <= 1) return items.slice(0, k);
  const picked = new Set<number>();
  for (let i = 0; i < k; i++) picked.add(Math.round((i * (items.length - 1)) / (k - 1)));
  return [...picked].sort((a, b) => a - b).map((i) => items[i]);
}

/** A car for sale, as much of it as the sale list's filters read. */
export interface StockCar {
  make: string;
  model: string;
  trim: string | null;
  year: number;
  priceMinor: number | null;
}

/**
 * Whether the sale list (/{market}/inventory) shows this car for these
 * parameters: the same tests as listInventory. `make` is an exact match; `q`
 * is found anywhere in the make, model or trim, ignoring case; `year` is
 * exact; `price` is "lo-hi" in whole units (both currencies have cents).
 */
export function listShows(params: URLSearchParams, car: StockCar): boolean {
  const make = params.get("make");
  if (make && car.make !== make) return false;
  const q = params.get("q")?.toLowerCase();
  if (q && ![car.make, car.model, car.trim ?? ""].some((f) => f.toLowerCase().includes(q))) {
    return false;
  }
  const year = params.get("year");
  if (year && car.year !== Number(year)) return false;
  const price = params.get("price");
  if (price) {
    const [lo, hi] = price.split("-").map(Number);
    if (car.priceMinor == null) return false;
    if (Number.isFinite(lo) && car.priceMinor < lo * 100) return false;
    if (Number.isFinite(hi) && car.priceMinor > hi * 100) return false;
  }
  return true;
}

/**
 * The brands with the most cars, most first, ties in alphabetical order.
 *
 * A brand is the first word of the make, because makes are typed by hand and
 * not always alike: "Dodge Charger" and "Dodge Dart" are both Dodge. Each
 * chip searches for its brand (`q`), and is counted by the list's own test,
 * so the number on the chip is the number of cars the list shows.
 */
export function topBrands(stock: StockCar[], k: number): { brand: string; count: number }[] {
  const brands = new Map<string, string>();
  for (const car of stock) {
    const brand = car.make.trim().split(/\s+/)[0];
    if (brand && !brands.has(brand.toLowerCase())) brands.set(brand.toLowerCase(), brand);
  }
  return [...brands.values()]
    .map((brand) => ({
      brand,
      count: stock.filter((car) => listShows(new URLSearchParams({ q: brand }), car)).length,
    }))
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand))
    .slice(0, k);
}

/**
 * A budget typed as words or figures, in whole units, or null when the text
 * is not one: "10000", "$10k", "10,000", "under 7.5k", "₦5m", "5 million".
 */
export function parseBudget(text: string): number | null {
  const m = text
    .trim()
    .toLowerCase()
    .match(
      /^(?:(?:under|below|up to|less than|max(?:imum)?|budget(?: of)?|about|around)\s*)?(?:\$|₦|usd|ngn|n(?=\s*\d))?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(k|thousand|m|mil|million)?\s*(?:dollars?|naira|usd|ngn)?$/,
    );
  if (!m) return null;
  const whole = Number(m[1].replace(/,/g, ""));
  const value = Number(`${whole}.${m[2] ?? "0"}`);
  const scale = !m[3] ? 1 : m[3] === "k" || m[3] === "thousand" ? 1_000 : 1_000_000;
  const major = Math.round(value * scale);
  return major > 0 ? major : null;
}

/** A model year: four digits, 1950 to next year. */
function asYear(word: string, nextYear: number): number | null {
  if (!/^\d{4}$/.test(word)) return null;
  const year = Number(word);
  return year >= 1950 && year <= nextYear ? year : null;
}

/**
 * Where a typed search goes on the sale list (/{market}/inventory), as the
 * query string the list reads. A budget becomes `price=0-{amount}` and a
 * year `year`; words go to `q`, as typed.
 *
 * The list finds `q` only as one piece of a single field, so "toyota camry"
 * finds nothing on its own (the make is "Toyota", the model "Camry"). When
 * the plain search would come back empty, this tries the ways the list can
 * find the words, against the cars listed now, and uses the first that
 * finds a car: a make typed at the start (as stored) and the rest, then each
 * word on its own, last first. If none finds one, it is the plain search,
 * and the list says nothing matches.
 *
 * "10k" → price=0-10000 · "2016" → year=2016 · "toyota camry" → make=Toyota&q=camry
 */
export function searchParamsFor(
  text: string,
  { stock, nextYear }: { stock: StockCar[]; nextYear: number },
): URLSearchParams {
  const base = new URLSearchParams();
  let rest = text.trim().replace(/\s+/g, " ");
  if (!rest) return base;

  // A year typed on its own is a year, not a $2,016 budget.
  const year = asYear(rest, nextYear);
  if (year) {
    base.set("year", String(year));
    return base;
  }

  const budget = parseBudget(rest);
  if (budget) {
    base.set("price", `0-${budget}`);
    return base;
  }

  // "2015 camry" or "camry 2015": the year, then the words.
  const words = rest.split(" ");
  const leading = asYear(words[0], nextYear);
  const trailing = words.length > 1 ? asYear(words[words.length - 1], nextYear) : null;
  if (leading) {
    base.set("year", String(leading));
    rest = words.slice(1).join(" ");
  } else if (trailing) {
    base.set("year", String(trailing));
    rest = words.slice(0, -1).join(" ");
  }
  if (!rest) return base;

  const withWords = (extra: Record<string, string>) => {
    const p = new URLSearchParams(base);
    for (const [key, value] of Object.entries(extra)) if (value) p.set(key, value);
    return p;
  };
  const plain = withWords({ q: rest });
  const finds = (p: URLSearchParams) => stock.some((car) => listShows(p, car));
  if (finds(plain)) return plain;

  const lower = rest.toLowerCase();
  const make = [...new Set(stock.map((car) => car.make))]
    .sort((a, b) => b.length - a.length)
    .find((mk) => lower === mk.toLowerCase() || lower.startsWith(`${mk.toLowerCase()} `));
  const candidates = [
    ...(make ? [withWords({ make, q: rest.slice(make.length).trim() })] : []),
    ...rest
      .split(" ")
      .reverse()
      .map((word) => withWords({ q: word })),
  ];
  return candidates.find(finds) ?? plain;
}
