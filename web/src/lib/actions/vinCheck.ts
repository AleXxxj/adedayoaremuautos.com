"use server";

import { after } from "next/server";
import { checkVin } from "@/lib/vin/validate";
import { spendLookup } from "@/lib/vin/usage";
import {
  decodeVin,
  recallsForModel,
  complaintsForModel,
  crashRatings,
  type DecodedVin,
  type ModelRecalls,
  type ComplaintSummary,
  type CrashRatings,
} from "@/lib/vin/nhtsa";
import { carPhoto, type CarPhoto } from "@/lib/vin/photo";
import { recallTexts, settleWithin, warmRecallTexts, type RecallText } from "@/lib/vin/recallPlain";

/**
 * The free "Check any car" tool: two public actions, on purpose.
 *
 * Both are open to anyone — the page exists for visitors — and return only
 * public government data about a model, never anything about a person. The
 * VIN travels in the POST body and is never put in a URL or a log: on its
 * own it names no one, but beside an IP address or an email it can.
 *
 * Each costs one of the visitor's daily lookups (src/lib/vin/usage.ts), so
 * the site can't be used to run thousands of checks against NHTSA.
 *
 * Two other services see the car's year, make and model, never its VIN:
 * Wikimedia Commons, for a photo of the model (src/lib/vin/photo.ts), and,
 * when ANTHROPIC_API_KEY is set, Anthropic, which is given NHTSA's public
 * recall notices to put in plain words (src/lib/vin/recallPlain.ts).
 */

/** How long "Is this the car?" waits for a photo before showing the drawing instead. */
const PHOTO_ON_CONFIRM_MS = 1_500;
/** How long a check waits for the photo and the AI recall summaries; the rest are NHTSA's words. */
const CHECK_BUDGET_MS = 4_500;

const USED_UP =
  "You've checked a lot of cars today. Please come back tomorrow, or call us and we'll check one for you.";

const NOT_DECODED =
  "NHTSA couldn't decode this VIN. Compare it with the one on the car: the bottom corner of the windshield on the driver's side, or the driver's door frame.";

export interface LookUpResult {
  ok: boolean;
  error?: string;
  vin?: string;
  car?: DecodedVin;
  /** A check-digit or decoding warning to show beside the car, if any. */
  warning?: string | null;
  /** A photo of the model, if one was ready in time; the page draws the body shape otherwise. */
  photo?: CarPhoto | null;
}

/** Step one: what the car is, for "Is this the car?". */
export async function lookUpVin(
  _prev: LookUpResult | null,
  formData: FormData,
): Promise<LookUpResult> {
  // The hidden field only a bot fills in.
  if (String(formData.get("leave_empty") ?? "")) {
    return { ok: false, error: "Please try again." };
  }

  const check = checkVin(String(formData.get("vin") ?? ""));
  if (!check.wellFormed) return { ok: false, error: check.message ?? "Check the VIN." };
  // Counted only once the VIN is worth asking NHTSA about: a typo costs nothing.
  if (!(await spendLookup())) return { ok: false, error: USED_UP };

  const car = await decodeVin(check.vin);
  if (!car) {
    return {
      ok: false,
      error: "We couldn't reach NHTSA to look up this VIN. Please try again in a minute.",
    };
  }
  if (!car.year || !car.make || !car.model) return { ok: false, error: NOT_DECODED };

  /*
   * Fetch the model's data while the visitor reads "Is this the car?".
   *
   * The first lookup of a popular model can take several seconds — its
   * complaints arrive as one large download — and the answer is cached, so
   * starting it now means the next step is usually instant. `after` keeps the
   * server working once this reply has gone; a failure here costs nothing,
   * because the next step asks again.
   */
  const { year, make, names, fit } = car;
  const want = { power: fit.power, cab: fit.cab, words: fit.words };
  // Started now rather than in the after() callback, so it runs while the
  // photo is awaited below. The recalls' plain-English summaries are warmed
  // as soon as the recalls are known.
  const prefetch = Promise.allSettled([
    recallsForModel(year, make, names, want).then((r) => (r ? warmRecallTexts(r.list, make) : null)),
    complaintsForModel(year, make, names, want),
    crashRatings(year, make, names, fit),
  ]);
  // The photo helps the visitor say "yes, that's the car", but is worth only
  // a short wait: if it isn't ready, the drawing shows here and the photo on
  // the results. Either way it carries on into the cache.
  const photoLookup = carPhoto(car);
  after(() => Promise.allSettled([prefetch, photoLookup]));
  const [photo] = await settleWithin([photoLookup], PHOTO_ON_CONFIRM_MS);

  return {
    ok: true,
    vin: check.vin,
    car,
    warning: check.checkDigitOk ? (car.warnings[0] ?? null) : check.message,
    photo: photo ?? null,
  };
}

export interface CheckResult {
  ok: boolean;
  error?: string;
  vin?: string;
  car?: DecodedVin;
  /** null = NHTSA could not be reached for that part; empty = none on file. */
  recalls?: ModelRecalls | null;
  complaints?: ComplaintSummary | null;
  ratings?: CrashRatings | null;
  /** The oldest of the answers' dates, for "NHTSA data as of". */
  asOf?: string | null;
  photo?: CarPhoto | null;
  /** Each recall in plain words, by campaign number: Claude's or NHTSA's own (RecallText.source). */
  recallText?: Record<string, RecallText>;
}

/** Step two: everything free that is known about this model. */
export async function checkCar(
  _prev: CheckResult | null,
  formData: FormData,
): Promise<CheckResult> {
  const check = checkVin(String(formData.get("vin") ?? ""));
  if (!check.wellFormed) return { ok: false, error: check.message ?? "Check the VIN." };
  // Counted here too: this action is an endpoint of its own, and calling it
  // directly would otherwise skip the limit.
  if (!(await spendLookup())) return { ok: false, error: USED_UP };

  const car = await decodeVin(check.vin);
  if (!car) return { ok: false, error: "We couldn't reach NHTSA just now. Please try again in a minute." };
  if (!car.year || !car.make || !car.model) return { ok: false, error: NOT_DECODED };

  // The same arguments as the prefetch in lookUpVin, so its answers are the ones found here.
  const { year, make } = car;
  const want = { power: car.fit.power, cab: car.fit.cab, words: car.fit.words };
  const photoLookup = carPhoto(car);
  const [recalled, complaints, ratings, [photo]] = await Promise.all([
    // The summaries start as soon as the recalls are known, not after the
    // complaints, which can take several seconds to download.
    recallsForModel(year, make, car.names, want).then(async (recalls) => {
      if (!recalls || recalls.list.length === 0) return { recalls, recallText: {} };
      const { texts, rest } = await recallTexts(recalls.list, make, CHECK_BUDGET_MS);
      // Late summaries finish after the reply, so the next visitor gets them.
      after(() => rest);
      return { recalls, recallText: texts };
    }),
    complaintsForModel(year, make, car.names, want),
    crashRatings(year, make, car.names, car.fit),
    settleWithin([photoLookup], CHECK_BUDGET_MS),
  ]);
  after(() => photoLookup);
  const { recalls, recallText } = recalled;

  const dates = [recalls?.fetchedAt, complaints?.fetchedAt, ratings?.fetchedAt].filter(
    (d): d is string => !!d,
  );

  return {
    ok: true,
    vin: check.vin,
    car,
    recalls,
    complaints,
    ratings,
    asOf: dates.length ? dates.sort()[0] : null,
    photo: photo ?? null,
    recallText,
  };
}
