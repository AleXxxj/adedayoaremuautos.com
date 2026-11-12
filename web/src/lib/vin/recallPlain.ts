import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { unstable_cache } from "next/cache";
import { freeFix, recallPart, sentenceCase, sentences } from "./plain";
import type { ModelRecall } from "./nhtsa";

/**
 * Recalls in words anyone can follow.
 *
 * NHTSA's notices are written for lawyers ("Gulf States Toyota, Inc. (GST)
 * is recalling certain 2017 Toyota Highlander … The fasteners for the roof
 * rails may not be torqued properly."). Each one becomes a headline of what
 * can go wrong, what's wrong, what could happen and the fix.
 *
 * With an Anthropic key, Claude rewrites the notice. What it is given is
 * NHTSA's public text and the make, nothing about the car or the visitor; its
 * answer is checked (lengths, sentences, no "free" the notice doesn't say)
 * and kept for 30 days per campaign. Without a key, or when the answer is
 * late, refused or out of bounds, the page gets NHTSA's own sentences,
 * trimmed of the opening "X is recalling…" sentence, phone numbers, dates
 * and letters to owners. Each recall says which it is, and the badges ("Don't
 * drive it", "Park it outside", "Free fix") always come from NHTSA's flags
 * and words, never from AI.
 */

const DAY = 86_400;
/** The newest recalls summarized per check; older ones get NHTSA's own words. */
export const MAX_SUMMARIZED = 12;

export interface RecallWords {
  /** What can go wrong, in 8 words or fewer: "Fuel pump can stop working". */
  headline: string;
  problem: string | null;
  risk: string | null;
  fix: string | null;
}

export interface RecallText extends RecallWords {
  /** "ai" when Claude wrote it from NHTSA's notice; "nhtsa" when it is NHTSA's own words. */
  source: "ai" | "nhtsa";
}

/* ── Without AI ─────────────────────────────────────────────────────────── */

const tidy = (s: string | null) => {
  const t = sentenceCase((s ?? "").replace(/\s+/g, " ").trim());
  return t || null;
};

/**
 * What's wrong: the summary without its opening "X is recalling certain …
 * vehicles." sentence, keeping which vehicles it means when it says ("It
 * affects vehicles equipped with accessory roof rail cross bars.").
 */
function whatsWrong(summary: string | null): string | null {
  const s = sentences(tidy(summary));
  if (s.length === 0) return null;
  if (s.length === 1 || !/\brecall(ing|s|ed)?\b/i.test(s[0])) return s.join(" ");
  const which = /\bvehicles?\b,?\s+((?:equipped|fitted|built) with\b.*?)\.?$/i.exec(s[0])?.[1]?.trim();
  const rest = s.slice(1).join(" ");
  return which ? `It affects vehicles ${which}. ${rest}` : rest;
}

/** Sentences of a remedy that are about letters, dates, phone numbers or reference numbers. */
const NOT_THE_FIX =
  /recall (began|begins|will begin|is expected to begin)|expected to begin|owners may contact|customer service|number for this recall|^note\b|\b1-\d{3}-\d{3}-\d{4}\b|\(\d{3}\)\s?\d{3}-\d{4}|will notify owners|will be notified|were notified|interim (notification|letters?)|notification letters?|letters? (are|were|is|was) (expected|mailed)|mailed|remedy parts|parts (should|will) be available|available (starting|beginning)|reimburse/i;

/** What the fix is: the remedy's sentences about what dealers do, nothing else. */
function theFix(remedy: string | null): string | null {
  const said = sentences(tidy(remedy))
    .map((s) =>
      s
        .replace(/^.*?\bwill notify owners,?\s+and\s+/i, "")
        .replace(/^.*?\b(?:has|have) notified owners,?\s+and\s+/i, ""),
    )
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .filter((s) => s.length > 0 && !NOT_THE_FIX.test(s));
  const doing = said.filter((s) =>
    /\b(dealers?|service (centers?|facilities)|retailers?|technicians?|free of charge|replace|repair|inspect|update|reprogram)\b/i.test(s),
  );
  const fix = (doing.length > 0 ? doing : said).slice(0, 2).join(" ");
  return fix || null;
}

/** A recall in NHTSA's own words, trimmed: what the page shows without AI. */
export function fallbackText(r: Pick<ModelRecall, "component" | "summary" | "consequence" | "remedy">): RecallWords {
  return {
    headline: recallPart(r.component),
    problem: whatsWrong(r.summary),
    risk: tidy(r.consequence),
    fix: theFix(r.remedy),
  };
}

/* ── With AI ────────────────────────────────────────────────────────────── */

/** The answer's shape, enforced by the API (structured outputs) and checked again below. */
export const PlainRecall = z.object({
  headline: z.string().describe('What can go wrong, at most 8 words and 60 characters, no period. Example: "Fuel pump can stop working".'),
  problem: z.string().describe("What's wrong, in 1 or 2 short sentences."),
  risk: z.string().describe("What could happen because of it, in 1 sentence."),
  fix: z.string().describe("What dealers will do about it, in 1 sentence."),
});

export const SYSTEM = `You rewrite one US vehicle safety recall notice for a car buyer who has no technical knowledge.

Write in plain American English at about a 6th-grade reading level. Use short, everyday words.
Use only facts that are in the notice. Add no advice, causes, numbers or reassurance that the notice doesn't give.
Replace technical words with everyday ones: "torqued" becomes "tightened", "ECM" becomes "engine computer".
Don't name the company that filed the recall. If the faulty part came from another company, say so without naming it, for example "a replacement windshield made by another company".
Say the fix is free only if the notice says it is free.
Don't use exclamation marks.

Fill in:
- headline: what can go wrong, in at most 8 words and 60 characters, with no period. For example: "Roof rack bars can come loose", "Spare tire air pressure set wrong", "Fuel pump can stop working".
- problem: what's wrong, in 1 or 2 short sentences.
- risk: what could happen because of it, in 1 sentence.
- fix: what dealers will do, in 1 sentence.`;

/** NHTSA's public text for one recall, and the make: all Claude is told. */
export function noticeFor(r: Pick<ModelRecall, "component" | "summary" | "consequence" | "remedy">, make: string): string {
  return [
    `Make: ${make}`,
    `Part: ${r.component ?? "not given"}`,
    `Summary: ${r.summary ?? "not given"}`,
    `Consequence: ${r.consequence ?? "not given"}`,
    `Remedy: ${r.remedy ?? "not given"}`,
  ].join("\n");
}

/**
 * Claude's answer, kept only within the limits the page is built for:
 * a headline of 8 words and 60 characters at most, a problem of 1 or 2
 * sentences, a risk and a fix of 1 each, no exclamation marks, and no
 * "free" unless NHTSA's remedy says the fix is free. A string says what was
 * wrong with it.
 */
export function checkPlain(
  out: { headline: string; problem: string; risk: string; fix: string },
  remedy: string | null,
): RecallWords | string {
  const headline = out.headline.trim().replace(/\.+$/, "");
  const problem = out.problem.trim();
  const risk = out.risk.trim();
  const fix = out.fix.trim();
  const all = [headline, problem, risk, fix].join(" ");
  if (!headline || headline.split(/\s+/).length > 8 || headline.length > 60) return "headline too long";
  const count = (s: string) => sentences(s).length;
  if (!problem || count(problem) > 2 || problem.length > 320) return "problem too long";
  if (!risk || count(risk) !== 1 || risk.length > 220) return "risk too long";
  if (!fix || count(fix) !== 1 || fix.length > 220) return "fix too long";
  if (all.includes("!")) return "exclamation mark";
  if (/\bfree\b/i.test(all) && !freeFix(remedy)) return "says free";
  if (/\b(tyres?|kerbs?|aluminium|centre|programme|licence|manoeuvre|colour)\b/i.test(all)) return "British spelling";
  return { headline, problem, risk, fix };
}

/** Thrown inside the cache, so a failed or unusable answer isn't kept for 30 days. */
class Unusable extends Error {}

let client: Anthropic | null = null;

async function summarizeLive(r: ModelRecall, make: string): Promise<RecallWords> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Unusable("no key");
  client ??= new Anthropic({ apiKey });
  const msg = await client.beta.messages.parse(
    {
      model: process.env.RECALL_SUMMARY_MODEL?.trim() || "claude-opus-5-5",
      max_tokens: 2000,
      // A request the safety classifiers decline is run again on the model
      // Anthropic recommends for that kind of decline, in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: zodOutputFormat(PlainRecall) },
      system: SYSTEM,
      messages: [{ role: "user", content: noticeFor(r, make) }],
    },
    // Late answers still land in the cache for the next visitor (after() in
    // the action), but none waits forever.
    { timeout: 30_000, maxRetries: 1 },
  );
  if (msg.stop_reason === "refusal") throw new Unusable("refused");
  if (msg.stop_reason === "max_tokens") throw new Unusable("cut off");
  if (!msg.parsed_output) throw new Unusable("no answer");
  const checked = checkPlain(msg.parsed_output, r.remedy);
  if (typeof checked === "string") throw new Unusable(checked);
  return checked;
}

/** The same request without the cache, for scripts — the cache needs Next's runtime. */
export const summarizeUncached = (r: ModelRecall, make: string) => summarizeLive(r, make);

/**
 * One answer per campaign and make, kept 30 days; a failure throws, so it is
 * asked again next time. The make is part of the key because one campaign
 * can cover several makes (20V682000 is both Toyota's and Lexus's), and
 * Claude is told the make: an answer written for a Toyota must not be shown
 * to someone checking a Lexus.
 */
function cachedSummary(r: ModelRecall, make: string): Promise<RecallWords> {
  return unstable_cache(() => summarizeLive(r, make), ["recall-plain-v1", r.campaign, make.toUpperCase()], {
    revalidate: 30 * DAY,
  })();
}

type Summarizer = (r: ModelRecall, make: string) => Promise<RecallWords>;
let summarizer: Summarizer | null = null;
/** For scripts/verify-vin-plain.mts: a stand-in for Claude. */
export function __setSummarizerForTests(f: Summarizer | null): void {
  summarizer = f;
  inFlight.clear();
}

const aiAvailable = () => summarizer !== null || Boolean(process.env.ANTHROPIC_API_KEY);

/** Asked once per campaign at a time: the "Is this the car?" warm-up and the check share it. */
const inFlight = new Map<string, Promise<RecallWords | null>>();

function summary(r: ModelRecall, make: string): Promise<RecallWords | null> {
  // Per campaign and make, like the cache: one campaign can cover two makes.
  const key = `${r.campaign}|${make.toUpperCase()}`;
  const running = inFlight.get(key);
  if (running) return running;
  const p = (summarizer ?? cachedSummary)(r, make)
    .then(
      (words) => words,
      (e: unknown) => {
        // The campaign number only: never the car or the visitor.
        const why =
          e instanceof Unusable
            ? e.message
            : e instanceof Anthropic.APIError
              ? `HTTP ${e.status ?? "error"}`
              : e instanceof Error
                ? e.name
                : "failed";
        console.error(`[recall-plain] ${r.campaign}: ${why}`);
        return null;
      },
    )
    .finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

/**
 * The answers that are back within `ms`, in order; undefined for the rest.
 * Nothing is cancelled: the late ones carry on, and land in the cache.
 */
export function settleWithin<T>(promises: Promise<T>[], ms: number): Promise<(T | undefined)[]> {
  const got: (T | undefined)[] = promises.map(() => undefined);
  let left = promises.length;
  return new Promise((resolve) => {
    if (left === 0) return resolve(got);
    const timer = setTimeout(() => resolve([...got]), ms);
    promises.forEach((p, i) =>
      p
        .then(
          (v) => {
            got[i] = v;
          },
          () => undefined,
        )
        .finally(() => {
          if (--left === 0) {
            clearTimeout(timer);
            resolve([...got]);
          }
        }),
    );
  });
}

/** Each recall's words: Claude's where they came back, NHTSA's own for the rest. */
export function mergeTexts(list: ModelRecall[], ai: Map<string, RecallWords | null | undefined>): Record<string, RecallText> {
  const out: Record<string, RecallText> = {};
  for (const r of list) {
    const words = ai.get(r.campaign);
    out[r.campaign] = words ? { ...words, source: "ai" } : { ...fallbackText(r), source: "nhtsa" };
  }
  return out;
}

/**
 * The words for a check: the newest recalls asked of Claude in parallel,
 * waiting at most `budgetMs`. `rest` settles when every answer is in, for
 * after(), so the cache is warm for the next visitor.
 */
export async function recallTexts(
  list: ModelRecall[],
  make: string,
  budgetMs: number,
): Promise<{ texts: Record<string, RecallText>; rest: Promise<unknown> }> {
  const newest = aiAvailable() ? list.slice(0, MAX_SUMMARIZED) : [];
  const asked = newest.map((r) => summary(r, make));
  const back = await settleWithin(asked, budgetMs);
  const ai = new Map(newest.map((r, i) => [r.campaign, back[i]] as const));
  return { texts: mergeTexts(list, ai), rest: Promise.allSettled(asked) };
}

/** Starts the newest recalls' summaries without waiting: "Is this the car?" warms the cache for "Yes". */
export function warmRecallTexts(list: ModelRecall[], make: string): Promise<unknown> {
  if (!aiAvailable()) return Promise.resolve();
  return Promise.allSettled(list.slice(0, MAX_SUMMARIZED).map((r) => summary(r, make)));
}
