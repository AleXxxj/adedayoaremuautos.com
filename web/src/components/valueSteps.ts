/**
 * "What's my car worth?": the rules and the words, shared by the page
 * (ValueCheck.tsx), the server action (lib/actions/value.ts) and the build
 * test (scripts/verify-value.mts).
 *
 * Pure, with no server imports. The page checks miles and ZIP with these
 * before sending, and the server checks again with the same functions, so
 * the two can't disagree.
 *
 * The wording of the estimate is the legal part. An estimate has to look
 * like one: the note says "estimate", names the source, the miles, the ZIP
 * and the date, and sits right under the number, never behind a link. There
 * are no "great deal" labels: MarketCheck gives one number, not a range.
 */

/* ── Miles ─────────────────────────────────────────────────────────────── */

/** Tap one, or type the exact number. Each is a real number, so the note under the estimate is true. */
export const MILE_CHIPS: readonly number[] = [25_000, 50_000, 75_000, 100_000, 125_000, 150_000, 175_000, 200_000];

/** Past this, the number is far more likely a typo than an odometer. */
export const MAX_MILES = 500_000;

/** "98,000", "98000" and "98k" are all 98,000; anything else is null. */
export function readMiles(raw: string): number | null {
  const s = raw.trim().replace(/[,\s]/g, "");
  const k = /^(\d{1,3})k$/i.exec(s);
  if (k) return Number(k[1]) * 1_000;
  return /^\d{1,7}$/.test(s) ? Number(s) : null;
}

/** What to fix about the miles, or null when they will do. */
export function milesProblem(raw: string): string | null {
  if (!raw.trim()) return "Tap a number, or type the miles.";
  const n = readMiles(raw);
  if (n === null || n < 1) return "Type the miles as a number, like 85000.";
  if (n > MAX_MILES) return `That's over ${wholeNumber(MAX_MILES)} miles. Check the number.`;
  return null;
}

/** "100k" for a chip. */
export const chipLabel = (miles: number) => `${miles / 1_000}k`;

/* ── ZIP ───────────────────────────────────────────────────────────────── */

/** A 5-digit ZIP, from "27401" or "27401-1234"; null otherwise. */
export function readZip(raw: string | null | undefined): string | null {
  const m = /^(\d{5})(?:-\d{4})?$/.exec((raw ?? "").trim());
  return m ? m[1] : null;
}

export function zipProblem(raw: string): string | null {
  return readZip(raw) ? null : "Type a 5-digit ZIP code, like 27401.";
}

/* ── Numbers and dates as the page writes them ─────────────────────────── */

export const wholeNumber = (n: number) => new Intl.NumberFormat("en-US").format(n);

/** "$14,800": whole dollars, as MarketCheck gave them. */
export const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/** "Nov 13, 2026", by Greensboro's calendar. */
export function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

/** The first day of the month after `now`, as "Dec 1": when a monthly limit starts over. */
export function nextMonthLabel(now: Date): string {
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(first);
}

/* ── The estimate's own words ──────────────────────────────────────────── */

/**
 * What the number is, said right under it.
 *
 * "Estimate only. Typical price at independent dealers for a car like this
 * with 98,000 miles near ZIP 27401, from MarketCheck, as of Nov 13, 2026.
 * Not an offer, an appraisal, or a guaranteed price."
 */
export function estimateNote(e: { miles: number; zip: string; asOf: string }): string {
  return (
    `Estimate only. Typical price at independent dealers for a car like this with ` +
    `${wholeNumber(e.miles)} ${e.miles === 1 ? "mile" : "miles"} near ZIP ${e.zip}, from MarketCheck, ` +
    `as of ${dateLabel(e.asOf)}. Not an offer, an appraisal, or a guaranteed price.`
  );
}

/** Said with every estimate: an asking price is not what a dealer pays. */
export const ASKING_NOTE =
  "This is what dealers ask when they sell a car like yours. A dealer buying it pays less.";

/** The credit MarketCheck's terms name (Developer Platform Terms, 8.1). */
export const SOURCE_CREDIT = "Data powered by MarketCheck";

/* ── Local demand ──────────────────────────────────────────────────────── */

export type DemandBand = "High" | "Normal" | "Low";

/** The fewest similar cars for sale before days' supply means anything. */
export const MIN_LISTED_FOR_DEMAND = 5;

/**
 * Days' supply as a word. The bands are ours, not MarketCheck's: under 30
 * days the cars for sale would be gone within a month at the recent pace;
 * over 60 they sit.
 */
export function demandBand(days: number): DemandBand {
  if (days < 30) return "High";
  return days <= 60 ? "Normal" : "Low";
}

export interface DemandLine {
  band: DemandBand;
  /** "High demand near ZIP 27401" */
  headline: string;
  /** The sentence that says what the band is made of. */
  detail: string;
}

/**
 * The one line about local demand, or null when there is too little to go
 * on: no figure, or fewer than 5 similar cars for sale.
 */
export function demandLine(
  d: { days: number; listed: number } | null | undefined,
  at: { zip: string; asOf: string; radiusMiles: number },
): DemandLine | null {
  if (!d || !Number.isFinite(d.days) || d.days <= 0 || d.listed < MIN_LISTED_FOR_DEMAND) return null;
  const band = demandBand(d.days);
  const days = Math.max(1, Math.round(d.days));
  return {
    band,
    headline: `${band} demand near ZIP ${at.zip}`,
    detail:
      `At the recent pace, similar cars for sale within ${at.radiusMiles} miles would sell out in about ` +
      `${wholeNumber(days)} ${days === 1 ? "day" : "days"} (MarketCheck, ${dateLabel(at.asOf)}).`,
  };
}

/* ── When there is no estimate ─────────────────────────────────────────── */

/**
 * Why an estimate didn't come back.
 *
 *   off    the estimate is switched off, or not for this visitor yet
 *   input  the VIN, miles or ZIP needs fixing (`field` says which)
 *   limit  this visitor has used today's lookups
 *   cap    the month's estimates are used up, by our cap or MarketCheck's quota
 *   none   MarketCheck has no price for this car
 *   down   MarketCheck (or NHTSA, for the VIN) didn't answer
 */
export type ValueFailure = "off" | "input" | "limit" | "cap" | "none" | "down";

/** One estimate, as the server hands it to the page. Held in the page's memory and nowhere else. */
export interface ValueEstimate {
  /** MarketCheck's price for an independent dealer, in dollars. */
  price: number;
  /** The price when new, when MarketCheck has it. */
  msrp: number | null;
  /** The miles and ZIP the estimate is for: what was sent, not what was typed. */
  miles: number;
  zip: string;
  /** When MarketCheck was asked, as an ISO time. */
  asOf: string;
  /** Days' supply and the cars for sale behind it, or null with nothing clear to say. */
  demand: { days: number; listed: number } | null;
  /** How far around the ZIP the demand figure looks. */
  radiusMiles: number;
}

export interface ValueResult {
  ok: boolean;
  failure?: ValueFailure;
  /** For "input": the box to fix. */
  field?: "vin" | "miles" | "zip";
  /** Words for this failure, when the standard ones don't fit. */
  error?: string;
  /** For "cap": the day the month's estimates start again, as "Dec 1". */
  resets?: string;
  estimate?: ValueEstimate;
}

export interface FailureCopy {
  icon: string;
  title: string;
  body: string;
  /** Whether asking again could help. */
  retry: boolean;
}

/** Each failure in plain words. `car` is the car's name; `resets` is "Dec 1". */
export function failureCopy(
  failure: Exclude<ValueFailure, "off" | "input">,
  o: { car: string; resets: string },
): FailureCopy {
  switch (failure) {
    case "none":
      return {
        icon: "fa-circle-question",
        title: "No estimate for this car",
        body: `MarketCheck has no price for this ${o.car}. We can still make you an offer: tell us about the car and we'll call you.`,
        retry: false,
      };
    case "cap":
      return {
        icon: "fa-calendar-xmark",
        title: "Estimates are used up for this month",
        body: `We get a set number each month. They start again on ${o.resets}. We can still make you an offer on your car today.`,
        retry: false,
      };
    case "limit":
      return {
        icon: "fa-hourglass-half",
        title: "That's all the lookups for today",
        body: "You've looked up a lot of cars today. Come back tomorrow, or tell us about your car and we'll call you.",
        retry: false,
      };
    case "down":
      return {
        icon: "fa-plug-circle-xmark",
        title: "The estimate service didn't answer",
        body: "MarketCheck isn't answering right now. Try again in a few minutes.",
        retry: true,
      };
  }
}
