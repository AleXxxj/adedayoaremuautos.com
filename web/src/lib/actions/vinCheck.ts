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
 */

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
  after(() =>
    Promise.allSettled([
      recallsForModel(year, make, names, want),
      complaintsForModel(year, make, names, want),
      crashRatings(year, make, names, fit),
    ]),
  );

  return {
    ok: true,
    vin: check.vin,
    car,
    warning: check.checkDigitOk ? (car.warnings[0] ?? null) : check.message,
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
  const want = { power: car.fit.power, cab: car.fit.cab, words: car.fit.words };
  const [recalls, complaints, ratings] = await Promise.all([
    recallsForModel(car.year, car.make, car.names, want),
    complaintsForModel(car.year, car.make, car.names, want),
    crashRatings(car.year, car.make, car.names, car.fit),
  ]);

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
  };
}
