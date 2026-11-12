/**
 * The arithmetic behind the guides' tools.
 *
 * Pure functions, no React and no database, shared by the guides' words
 * (src/content/guides), their tools (components/guides/tools) and checked by
 * scripts/verify-guides.ts. Rental figures come from quoteRental, the same
 * function the booking form and the rental agreement charge with, so a guide
 * can't quote a price the booking would not.
 */
import { RentalError, quoteRental, type RentalQuoteLine, type RentalTariff } from "@/lib/rental";
import { pathToOwnership, tariffFor, type OwnershipTier } from "@/lib/rentToOwn";
import { plain } from "@/content/guides/format";
import type { GuideData, GuideWords } from "@/content/guides/types";

/* ── Weekly rental: what each car costs for a length of time ───────────── */

/** The lengths the weekly-rental tool offers. */
export const WEEK_CHOICES = [1, 2, 4, 8] as const;

export interface RentCost {
  days: number;
  /** Rent only. The deposit is the renter's own money and is shown apart. */
  rentMinor: number;
  depositMinor: number;
  /** The mix of monthly, weekly and daily rates the price is made of. */
  lines: RentalQuoteLine[];
}

/**
 * What this many days of a car cost, or null where the car isn't rented for
 * that long (its shortest or longest rental rules it out).
 */
export function costForDays(tariff: RentalTariff, days: number): RentCost | null {
  try {
    const q = quoteRental(tariff, days);
    return { days, rentMinor: q.hireMinor, depositMinor: q.depositMinor, lines: q.lines };
  } catch (e) {
    if (e instanceof RentalError) return null;
    throw e;
  }
}

export const costForWeeks = (tariff: RentalTariff, weeks: number) => costForDays(tariff, weeks * 7);

/** Every car with its cost for that long: lowest first, then the ones that can't be rented that long. */
export function fleetForDays<T extends { tariff: RentalTariff }>(
  cars: T[],
  days: number,
): { car: T; cost: RentCost | null }[] {
  const rows = cars.map((car) => ({ car, cost: costForDays(car.tariff, days) }));
  return [
    ...rows.filter((r) => r.cost).sort((a, b) => a.cost!.rentMinor - b.cost!.rentMinor),
    ...rows.filter((r) => !r.cost),
  ];
}

/** The lowest-cost car for that long, or null when none can be rented that long. */
export function cheapestRental<T extends { tariff: RentalTariff }>(
  cars: T[],
  days: number,
): { car: T; cost: RentCost } | null {
  const first = fleetForDays(cars, days)[0];
  return first?.cost ? { car: first.car, cost: first.cost } : null;
}

/* ── Rent, buy or rent to own ──────────────────────────────────────────── */

/** The lengths the three-way tool offers. A month is 30 days, as the rental policy counts it. */
export const LENGTHS = [
  { key: "1m", label: "1 month", phrase: "1 month", days: 30 },
  { key: "3m", label: "3 months", phrase: "3 months", days: 90 },
  { key: "6m", label: "6 months", phrase: "6 months", days: 180 },
  { key: "1y", label: "1 year", phrase: "1 year", days: 365 },
  { key: "2y", label: "2+ years", phrase: "2 years", days: 730 },
] as const;

export type LengthKey = (typeof LENGTHS)[number]["key"];

/** The middle value; the mean of the two middle values, rounded, for an even count. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export interface BuyFigures {
  count: number;
  lowestMinor: number;
  middleMinor: number;
  highestMinor: number;
}

/** The lowest, middle and highest sale prices in stock, or null with nothing priced. */
export function buyFigures(pricesMinor: number[]): BuyFigures | null {
  if (pricesMinor.length === 0) return null;
  return {
    count: pricesMinor.length,
    lowestMinor: Math.min(...pricesMinor),
    middleMinor: median(pricesMinor)!,
    highestMinor: Math.max(...pricesMinor),
  };
}

/** The rent-to-own category with the lowest total to own, or null where none leads to owning. */
export function lowestOwnTier(tiers: OwnershipTier[]): OwnershipTier | null {
  const owning = tiers.filter((t) => t.ownershipThresholdMinor != null && t.ownershipThresholdMinor > 0);
  if (owning.length === 0) return null;
  return owning.reduce((a, b) =>
    a.ownershipThresholdMinor! < b.ownershipThresholdMinor! ||
    (a.ownershipThresholdMinor === b.ownershipThresholdMinor && a.dailyMinor <= b.dailyMinor)
      ? a
      : b,
  );
}

export interface OwnFigure {
  /** Rent paid by then. Never more than the total: at the total the car is the renter's. */
  paidMinor: number;
  /** "Total of all payments to acquire ownership", as the rent-to-own page states it. */
  totalMinor: number;
  owned: boolean;
  /** Days of continuous rental until the total is reached. */
  ownDays: number;
}

/**
 * Where a rent-to-own renter stands after this many days of continuous
 * rental, priced as the booking engine prices the category.
 */
export function rentToOwnFor(tier: OwnershipTier, days: number): OwnFigure | null {
  const path = pathToOwnership(tier);
  if (!path) return null;
  const totalMinor = tier.ownershipThresholdMinor!;
  const rent = quoteRental(tariffFor(tier), days).hireMinor;
  return {
    paidMinor: Math.min(rent, totalMinor),
    totalMinor,
    owned: rent >= totalMinor,
    ownDays: path.days,
  };
}

export type Way = "rent" | "buy" | "own";

/**
 * Which of the three figures is lowest. More than one when they tie, none
 * when there is nothing to compare. A way with no figure (no car can be
 * rented that long, nothing for sale) is left out, not treated as zero.
 */
export function lowestWays(figures: Record<Way, number | null>): Way[] {
  const known = (Object.entries(figures) as [Way, number | null][]).filter(
    (e): e is [Way, number] => e[1] != null,
  );
  if (known.length === 0) return [];
  const min = Math.min(...known.map(([, n]) => n));
  return known.filter(([, n]) => n === min).map(([way]) => way);
}

/** Three years: past this, "renting never passes the price" is the honest answer. */
const BREAK_EVEN_LIMIT = 1095;

/**
 * The first day on which renting the lowest-cost car has cost more than
 * `priceMinor`, or null when it never does within three years.
 *
 * The cost of renting never falls as days are added, so this bisects.
 */
export function breakEvenDays<T extends { tariff: RentalTariff }>(
  cars: T[],
  priceMinor: number,
): number | null {
  if (cars.length === 0) return null;
  // "Past" the price, or past the longest any car is rented for: both stay
  // true as days are added, which is what lets this bisect.
  const past = (days: number) => {
    const r = cheapestRental(cars, days);
    return r == null || r.cost.rentMinor > priceMinor;
  };
  const start = Math.min(...cars.map((c) => c.tariff.minDays));
  if (!cheapestRental(cars, start)) return null;
  let hi = start;
  while (!past(hi)) {
    if (hi >= BREAK_EVEN_LIMIT) return null;
    hi = Math.min(hi * 2, BREAK_EVEN_LIMIT);
  }
  let lo = start;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (past(mid)) hi = mid;
    else lo = mid + 1;
  }
  // Stopped because nobody rents that long, not because the rent passed the price.
  return cheapestRental(cars, lo) ? lo : null;
}

/** "16 weeks" up to half a year, then "7 months". Whole weeks or months, rounded up. */
export function spanLabel(days: number): string {
  const weeks = Math.ceil(days / 7);
  if (weeks <= 26) return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  const months = Math.ceil(days / 30);
  return `${months} months`;
}

/* ── Budgets ───────────────────────────────────────────────────────────── */

/** The budgets the tool offers and the guide's title names, in whole dollars. */
export const BUDGETS_MAJOR = [5000, 10000, 15000] as const;

/** This many cars or fewer at a budget is "thin", and the guide says so. */
export const THIN_STOCK = 2;

export interface BudgetBucket<T> {
  budgetMinor: number;
  /** Cars at or under the budget, the most car for the money first. */
  cars: T[];
  count: number;
  thin: boolean;
  /** The middle model year, or null with no cars. */
  typicalYear: number | null;
  /** The middle mileage among the cars that list one. */
  typicalMiles: number | null;
  /** How many of them list their miles. */
  milesListed: number;
  lowestMinor: number | null;
  highestMinor: number | null;
}

/** What a budget buys from these cars: a car priced exactly at the budget fits. */
export function budgetBucket<T extends { priceMinor: number; year: number; mileage: number | null }>(
  cars: T[],
  budgetMinor: number,
): BudgetBucket<T> {
  const fit = cars
    .filter((c) => c.priceMinor <= budgetMinor)
    .sort((a, b) => b.priceMinor - a.priceMinor || b.year - a.year);
  const miles = fit.flatMap((c) => (c.mileage != null ? [c.mileage] : []));
  return {
    budgetMinor,
    cars: fit,
    count: fit.length,
    thin: fit.length > 0 && fit.length <= THIN_STOCK,
    typicalYear: median(fit.map((c) => c.year)),
    typicalMiles: median(miles),
    milesListed: miles.length,
    lowestMinor: fit.length ? Math.min(...fit.map((c) => c.priceMinor)) : null,
    highestMinor: fit.length ? Math.max(...fit.map((c) => c.priceMinor)) : null,
  };
}

/* ── Checklist ─────────────────────────────────────────────────────────── */

export type Answer = "good" | "problem";

export interface Tally {
  total: number;
  good: number;
  problems: number;
  /** Not answered yet. */
  left: number;
  done: boolean;
}

/** The score so far. Answers for checks that no longer exist are ignored. */
export function tally(ids: string[], answers: Record<string, Answer | undefined>): Tally {
  let good = 0;
  let problems = 0;
  for (const id of ids) {
    if (answers[id] === "good") good++;
    else if (answers[id] === "problem") problems++;
  }
  const left = ids.length - good - problems;
  return { total: ids.length, good, problems, left, done: left === 0 };
}

/**
 * The result as plain text, to share or paste: the score, then every check
 * marked as a problem under its part of the car. No car, no VIN, no name:
 * only what the visitor tapped.
 */
export function checklistText(
  groups: { title: string; checks: { id: string; label: string }[] }[],
  answers: Record<string, Answer | undefined>,
  url: string,
): string {
  const t = tally(
    groups.flatMap((g) => g.checks.map((c) => c.id)),
    answers,
  );
  const lines = [
    "Used car checklist",
    `${t.good} good · ${t.problems} to ask about${t.left ? ` · ${t.left} not checked` : ""}`,
  ];
  if (t.problems > 0) {
    lines.push("", "Ask about:");
    for (const g of groups) {
      for (const c of g.checks) {
        if (answers[c.id] === "problem") lines.push(`- ${g.title}: ${c.label}`);
      }
    }
  }
  lines.push("", `Checklist: ${url}`);
  return lines.join("\n");
}

/* ── The page around a tool ────────────────────────────────────────────── */

/**
 * The date a guide shows as "Updated": when its words last changed, or when
 * the stock its numbers come from last changed, whichever is later. A guide
 * with no live numbers keeps its own date.
 */
export function guideUpdated(
  meta: { updated: string; live: boolean },
  data: Pick<GuideData, "stockUpdated">,
): string {
  const words = meta.updated;
  const stock = meta.live && data.stockUpdated ? data.stockUpdated.slice(0, 10) : null;
  return stock && stock > words ? stock : words;
}

/**
 * One photo for each guide, from stock, no car twice: each guide's own pick
 * first, then any other car with a photo. Used by the cards and Open Graph.
 */
export function guidePhotos(
  picks: { slug: string; photoSlug: string | null }[],
  data: Pick<GuideData, "rent" | "sale">,
): Record<string, string | null> {
  const photos = new Map<string, string>();
  for (const c of [...data.sale, ...data.rent]) if (c.image && !photos.has(c.slug)) photos.set(c.slug, c.image);
  const used = new Set<string>();
  const out: Record<string, string | null> = {};
  for (const { slug, photoSlug } of picks) {
    const order = [...(photoSlug ? [photoSlug] : []), ...photos.keys()];
    const car = order.find((s) => photos.has(s) && !used.has(s)) ?? null;
    if (car) used.add(car);
    out[slug] = car ? photos.get(car)! : null;
  }
  return out;
}

/** Words a minute, for "3 min read": an ordinary reading pace. */
const READING_PACE = 200;

/** Minutes to read a guide's words (not to use its tool), counted from the words themselves. */
export function readMinutes(words: GuideWords): number {
  const text = [
    ...words.short,
    words.toolHeading,
    words.toolNote,
    ...words.sections.flatMap((s) => [
      s.heading,
      ...s.body,
      ...(s.list ?? []).map((l) => l.text),
      ...(s.steps ?? []),
    ]),
    ...words.faqs.flatMap((f) => [f.q, f.a]),
  ]
    .map(plain)
    .join(" ");
  const count = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(count / READING_PACE));
}
