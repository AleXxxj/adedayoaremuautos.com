/**
 * The rules of the guides' games.
 *
 * Pure functions, no React and no database, shared by the games' words
 * (src/content/guides), their tools (components/guides/tools) and checked by
 * scripts/verify-guides.ts: which car type six answers add up to, how a
 * round of "guess the price" is dealt and scored, how a story ends, and what
 * a trip costs in each rental car (quoteRental, by way of guideMath).
 *
 * A game's chance comes from a seed, so the same seed deals the same game:
 * the page is drawn on the server with a fixed seed, the browser deals a new
 * one on "Play again", and the build can check both.
 */
import type { RentalTariff } from "@/lib/rental";
import type { BodyGroup } from "@/components/compare/compareData";
import { fleetForDays, type RentCost } from "./guideMath";

/* ── Chance ────────────────────────────────────────────────────────────── */

/** A small seeded generator (mulberry32): the same seed gives the same run. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A shuffled copy (Fisher-Yates). */
export function shuffle<T>(items: readonly T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ── Ranks: a title for a score ────────────────────────────────────────── */

export interface Rank {
  id: string;
  /** The least share of right answers that earns it, 0 to 1. */
  from: number;
  title: string;
  line: string;
}

/** The highest rank the score reaches. `ranks` may be in any order; one must start at 0. */
export function rankFor<R extends Rank>(ranks: readonly R[], score: number, of: number): R {
  const share = of > 0 ? score / of : 0;
  const sorted = [...ranks].sort((a, b) => b.from - a.from);
  return sorted.find((r) => share >= r.from) ?? sorted[sorted.length - 1];
}

/* ── What a shared link carries: a score or a result's id, nothing else ── */

/** "#score=4-5" */
export const scoreHash = (score: number, of: number) => `#score=${score}-${of}`;

/** The score in a shared link, or null when the hash is anything else. */
export function parseScoreHash(hash: string): { score: number; of: number } | null {
  const m = /^#score=(\d{1,2})-(\d{1,2})$/.exec(hash);
  if (!m) return null;
  const score = Number(m[1]);
  const of = Number(m[2]);
  return of >= 1 && of <= 20 && score <= of ? { score, of } : null;
}

/** "#got=roadtrip" */
export const gotHash = (id: string) => `#got=${id}`;

/** The result id in a shared link when it is one of `ids`, else null. */
export function parseGotHash<T extends string>(hash: string, ids: readonly T[]): T | null {
  const m = /^#got=([a-z0-9-]{1,40})$/.exec(hash);
  return m && (ids as readonly string[]).includes(m[1]) ? (m[1] as T) : null;
}

/* ── Quiz: what car fits your life ─────────────────────────────────────── */

export type ProfileId = "roadtrip" | "family" | "workhorse" | "commuter" | "runabout";

/** Ties go to the earlier one. */
export const PROFILE_ORDER: readonly ProfileId[] = ["roadtrip", "family", "workhorse", "commuter", "runabout"];

export type QuizMode = "rent" | "own" | "rto" | "unsure";

export interface LifeOption {
  id: string;
  label: string;
  icon: string;
  /** What the answer says about the car type. */
  points?: Partial<Record<ProfileId, number>>;
  /** The budget question: the most to spend in whole dollars, or null for no limit. */
  budgetMajor?: number | null;
  /** The rent-or-own question. */
  mode?: QuizMode;
}

export interface LifeQuestion {
  id: string;
  ask: string;
  options: LifeOption[];
}

/** question id to option id */
export type LifeAnswers = Record<string, string | undefined>;

const chosen = (questions: LifeQuestion[], answers: LifeAnswers) =>
  questions.flatMap((q) => {
    const o = q.options.find((x) => x.id === answers[q.id]);
    return o ? [o] : [];
  });

/** How many questions have a known answer. */
export const lifeAnswered = (questions: LifeQuestion[], answers: LifeAnswers) => chosen(questions, answers).length;

/** Every profile's points from the answers so far. */
export function lifeScores(questions: LifeQuestion[], answers: LifeAnswers): Record<ProfileId, number> {
  const scores: Record<ProfileId, number> = { roadtrip: 0, family: 0, workhorse: 0, commuter: 0, runabout: 0 };
  for (const o of chosen(questions, answers)) {
    for (const [id, n] of Object.entries(o.points ?? {})) scores[id as ProfileId] += n ?? 0;
  }
  return scores;
}

/** The car type the answers add up to, or null until every question is answered. */
export function lifeResult(questions: LifeQuestion[], answers: LifeAnswers): ProfileId | null {
  if (lifeAnswered(questions, answers) < questions.length) return null;
  const scores = lifeScores(questions, answers);
  return PROFILE_ORDER.reduce((top, id) => (scores[id] > scores[top] ? id : top), PROFILE_ORDER[0]);
}

/** The budget answered, in minor units: null for "no limit" or "not sure". */
export function lifeBudgetMinor(questions: LifeQuestion[], answers: LifeAnswers): number | null {
  const o = chosen(questions, answers).find((x) => x.budgetMajor !== undefined);
  return o?.budgetMajor != null ? o.budgetMajor * 100 : null;
}

export function lifeMode(questions: LifeQuestion[], answers: LifeAnswers): QuizMode {
  return chosen(questions, answers).find((x) => x.mode)?.mode ?? "unsure";
}

export interface LifeMatch<S, R> {
  /** Cars for sale of the right body type, within the budget when there is one. */
  sale: S[];
  /**
   * True when nothing of that body type fits the budget, and `sale` holds the
   * lowest-priced ones of that type instead: shown as "the closest", never as a match.
   */
  overBudget: boolean;
  rent: R[];
}

/**
 * The cars in stock that fit a result. Only a car whose listing names one of
 * the profile's body types counts: a car with no body type is never guessed
 * into a match.
 */
export function lifeMatch<
  S extends { body: BodyGroup | null; priceMinor: number; year: number },
  R extends { body: BodyGroup | null },
>(bodies: readonly BodyGroup[], sale: S[], rent: R[], budgetMinor: number | null): LifeMatch<S, R> {
  const fits = (c: { body: BodyGroup | null }) => c.body != null && bodies.includes(c.body);
  const ofType = sale.filter(fits);
  const within = budgetMinor == null ? ofType : ofType.filter((c) => c.priceMinor <= budgetMinor);
  const overBudget = within.length === 0 && ofType.length > 0;
  return {
    // Within a budget, the most car for the money first; over it, the nearest price first.
    sale: overBudget
      ? [...ofType].sort((a, b) => a.priceMinor - b.priceMinor)
      : [...within].sort((a, b) => b.priceMinor - a.priceMinor || b.year - a.year),
    overBudget,
    rent: rent.filter(fits),
  };
}

/* ── Guess the price ───────────────────────────────────────────────────── */

/** Rounds in a game, when stock allows. */
export const PRICE_ROUNDS = 5;

/** Prices offered each round: the real one and three that are not. */
export const PRICE_OPTIONS = 4;

/** The cars a round can show: priced, photographed, and still for sale. */
export function priceEligible<T extends { priceMinor: number; image: string | null; pending: boolean }>(cars: T[]): T[] {
  return cars.filter((c) => c.priceMinor > 0 && c.image != null && !c.pending);
}

const LOWER = [0.55, 0.7, 0.85];
const HIGHER = [1.2, 1.4, 1.7];
/** Wrong prices are whole hundreds away from the right one, in minor units. */
const STEP_MINOR = 100_00;

/**
 * Four prices, lowest first: the real one and three worked out from it. The
 * wrong ones keep the real price's last digits ("$5,995" is offered beside
 * "$4,195", never beside a round "$4,200"), so the odd one out isn't a tell.
 * Where the real price lands among the four is chance.
 */
export function priceOptions(priceMinor: number, next: () => number): number[] {
  const below = Math.floor(next() * PRICE_OPTIONS);
  const factors = [...LOWER.slice(LOWER.length - below), ...HIGHER.slice(0, PRICE_OPTIONS - 1 - below)];
  const tail = priceMinor % STEP_MINOR;
  const options = new Set<number>([priceMinor]);
  for (const f of factors) {
    const guess = Math.round((priceMinor * f - tail) / STEP_MINOR) * STEP_MINOR + tail;
    if (guess > 0) options.add(guess);
  }
  // A very low price can round two of them together: fill in above it.
  for (let n = 1; options.size < PRICE_OPTIONS; n++) options.add(priceMinor + n * STEP_MINOR);
  return [...options].sort((a, b) => a - b);
}

export interface PriceRound {
  slug: string;
  optionsMinor: number[];
}

/** A game: up to five cars in a chance order, each with its four prices. */
export function priceRounds<T extends { slug: string; priceMinor: number; image: string | null; pending: boolean }>(
  cars: T[],
  seed: number,
): PriceRound[] {
  const next = rng(seed);
  return shuffle(priceEligible(cars), next)
    .slice(0, PRICE_ROUNDS)
    .map((c) => ({ slug: c.slug, optionsMinor: priceOptions(c.priceMinor, next) }));
}

/** Right guesses so far. `guesses[i]` is the price tapped in round i. */
export function priceScore(answersMinor: number[], guesses: (number | undefined)[]): number {
  return answersMinor.filter((a, i) => guesses[i] === a).length;
}

/* ── True or false ─────────────────────────────────────────────────────── */

/** Right answers. `answers[id]` is what was tapped for that statement. */
export function trueFalseScore(
  facts: readonly { id: string; answer: boolean }[],
  answers: Record<string, boolean | undefined>,
): number {
  return facts.filter((f) => answers[f.id] === f.answer).length;
}

/* ── A story with choices ──────────────────────────────────────────────── */

export interface StoryChoice {
  id: string;
  label: string;
  /** What follows, in a line or two. General and true: no bills, no odds. */
  result: string;
  /** True when the choice leaves something unchecked. */
  chance: boolean;
}

export interface StoryStep {
  id: string;
  /** "Before you pay", "Month 3" */
  when: string;
  icon: string;
  ask: string;
  choices: [StoryChoice, StoryChoice];
  /** Where the fact in a result comes from. */
  source?: { label: string; url: string };
}

export interface StoryEnding {
  id: string;
  /** The most things left to chance that still end here. */
  upTo: number;
  title: string;
  line: string;
}

/** step id to choice id */
export type StoryPicks = Record<string, string | undefined>;

/** How many of the steps were left to chance. */
export function storyChances(steps: readonly StoryStep[], picks: StoryPicks): number {
  return steps.filter((s) => s.choices.find((c) => c.id === picks[s.id])?.chance).length;
}

/** Whether every step has a known choice. */
export const storyDone = (steps: readonly StoryStep[], picks: StoryPicks) =>
  steps.every((s) => s.choices.some((c) => c.id === picks[s.id]));

/** The ending for that many things left to chance, or null when no ending covers it. */
export function storyEnding<E extends StoryEnding>(endings: readonly E[], chances: number): E | null {
  return [...endings].sort((a, b) => a.upTo - b.upTo).find((e) => chances <= e.upTo) ?? null;
}

/** Every way through the story: each a full set of picks. */
export function storyPaths(steps: readonly StoryStep[]): StoryPicks[] {
  return steps.reduce<StoryPicks[]>(
    (paths, s) => paths.flatMap((p) => s.choices.map((c) => ({ ...p, [s.id]: c.id }))),
    [{}],
  );
}

/* ── A road trip in a rental car ───────────────────────────────────────── */

/** The lengths the trip tool offers, in days. */
export const TRIP_DAYS = [1, 2, 3, 7] as const;

export interface TripCost<T> {
  days: number;
  /** Every car with its rent for that long: lowest first, then the ones not rented that long. */
  rows: { car: T; cost: RentCost | null }[];
  /** The lowest rent among them, or null when no car can be rented that long. */
  fromMinor: number | null;
}

/** What each rental car costs for a trip of this many days, priced as the booking form prices it. */
export function tripCost<T extends { tariff: RentalTariff }>(cars: T[], days: number): TripCost<T> {
  const rows = fleetForDays(cars, days);
  return { days, rows, fromMinor: rows[0]?.cost?.rentMinor ?? null };
}

/** There and back. */
export const roundTripMiles = (oneWayMiles: number) => oneWayMiles * 2;

/* ── Moments: a streak, the halfway mark, the last one ─────────────────── */

/** How many right answers in a row the latest answer makes (0 after a miss). */
export function streak(results: readonly boolean[]): number {
  let n = 0;
  for (let i = results.length - 1; i >= 0 && results[i]; i--) n++;
  return n;
}

/** A streak worth a word starts at three. */
export const STREAK_FROM = 3;

/**
 * The small moment a step earns, or null for most of them: a streak of right
 * answers first, then halfway through, then one to go. A game of fewer than
 * four steps has no halfway.
 *
 * @param done steps finished, counting the one just answered
 * @param run  right answers in a row (0 where a game has no right answer)
 */
export function momentFor(done: number, of: number, run = 0): string | null {
  if (done <= 0 || done > of) return null;
  if (run >= STREAK_FROM) return run === of ? "All of them" : `${run} in a row`;
  if (done === of) return null;
  if (of >= 4 && done === Math.ceil(of / 2)) return "Halfway";
  if (of >= 3 && done === of - 1) return "One to go";
  return null;
}

/** "under 1 min left", "about 2 min left": what is left at so many seconds a step. */
export function timeLeft(left: number, secondsEach: number): string {
  const seconds = Math.max(0, left) * secondsEach;
  if (seconds <= 0) return "";
  return seconds < 60 ? "under 1 min left" : `about ${Math.round(seconds / 60)} min left`;
}
