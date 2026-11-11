/**
 * The booking form's step rules, in the server's own words. Pure: no React, no
 * DOM, no browser-only imports, so scripts/verify-rental.ts can check it under
 * tsx. verify-rental fails the build if the server's wording drifts.
 */
import type { RentalTariff } from "@/lib/rental";

export type Step = 1 | 2 | 3 | 4;

export const STEP_TITLES: Record<Step, string> = {
  1: "Your dates", 2: "Your details", 3: "License and insurance", 4: "Review and reserve",
};

/** Where every field the server can name lives. Insertion order = page order. */
export const FIELD_STEP: Record<string, Step> = {
  from: 1, to: 1, withDriver: 1,
  name: 2, phone: 2, email: 2, note: 2,
  insuranceChoice: 3, licenceFile: 3, insuranceFile: 3, licenceNo: 3,
  insuranceProvider: 3, insurancePolicyNo: 3, confirmEligible: 3,
  acceptTerms: 4, termsVersion: 4,
};
/** Read by the server, never typed by the renter. */
export const NO_STEP: readonly string[] = ["marketCode", "vehicleSlug", "website", "leave_empty", "elapsedMs"];

export const MESSAGES = {
  pickupMissing: "Choose a pickup date",
  pickupPast: "Pickup can't be in the past",
  returnMissing: "Choose a return date",
  returnBeforePickup: "Return must be after pickup",
  taken: "That vehicle is already booked for some of those dates. Please choose different dates.",
  name: "Please enter your name",
  phoneMissing: "Please enter a reachable phone number",
  phoneShort: "Please enter your full phone number, with the area code",
  email: "That email does not look right",
  preparing: "Still preparing your photo. Try again in a moment.",
  license: "Please attach a photo of your driver's license.",
  proof: "Please attach proof of insurance, or choose a different option above.",
  eligible: "Please confirm you meet the rental requirements",
  terms: "Please read and accept the rental terms to continue.",
} as const;

/** zod 4.4.3 regexes.email, copied so the page ships no zod. Parity: verify-rental. */
export const EMAIL_RE =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

export const digitCount = (s: string): number => s.replace(/\D/g, "").length;

/** "2026-11-28" + 7 → "2026-12-05". Calendar days: no clock, no time zone. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface TakenWindow {
  start: string; end: string;   // [start, end) calendar days
  label: string;                // "Nov 20, 2026 → Nov 27, 2026", formatted on the server
  heldUntil: string | null;     // ISO end of a hold; null for confirmed/active
}

/** [from, to) against [start, end): a pickup on a return day is fine. */
export function overlapsTaken(from: string, to: string, windows: TakenWindow[], nowMs: number): boolean {
  return windows.some((w) => (!w.heldUntil || Date.parse(w.heldUntil) > nowMs) && from < w.end && to > w.start);
}

export function lengthsFor(t: Pick<RentalTariff, "minDays" | "maxDays">): number[] {
  return [7, 14, 30].filter((n) => n >= t.minDays && (t.maxDays == null || n <= t.maxDays));
}

export interface Snapshot {
  today: string; from: string; to: string; days: number; quoteError: string | null; overlap: boolean;
  name: string; phone: string; email: string;
  preparing: "licenceFile" | "insuranceFile" | null; hasLicence: boolean; own: boolean; hasProof: boolean;
  sizeMessage: string | null;   // submit()'s "Your files add up to …" text, or null
  eligible: boolean; acceptedTerms: boolean;
}
export interface Problem { field: string; message: string }

export function stepProblem(step: Step, s: Snapshot): Problem | null {
  const M = MESSAGES;
  if (step === 1) {
    if (!s.from) return { field: "from", message: M.pickupMissing };
    if (s.today && s.from < s.today) return { field: "from", message: M.pickupPast };
    if (!s.to) return { field: "to", message: M.returnMissing };
    if (s.days <= 0) return { field: "to", message: M.returnBeforePickup };
    if (s.quoteError) return { field: /driver/i.test(s.quoteError) ? "withDriver" : "to", message: s.quoteError };
    if (s.overlap) return { field: "from", message: M.taken };
    return null;
  }
  if (step === 2) {
    if (s.name.trim().length < 2) return { field: "name", message: M.name };
    if (!s.phone.trim()) return { field: "phone", message: M.phoneMissing };
    if (digitCount(s.phone) < 10) return { field: "phone", message: M.phoneShort };
    const email = s.email.trim();
    if (email && !EMAIL_RE.test(email)) return { field: "email", message: M.email };
    return null;
  }
  if (step === 3) {
    if (s.preparing) return { field: s.preparing, message: M.preparing };
    if (!s.hasLicence) return { field: "licenceFile", message: M.license };
    if (s.own && !s.hasProof) return { field: "insuranceFile", message: M.proof };
    if (s.sizeMessage) return { field: s.own ? "insuranceFile" : "licenceFile", message: s.sizeMessage };
    if (!s.eligible) return { field: "confirmEligible", message: M.eligible };
    return null;
  }
  if (!s.acceptedTerms) return { field: "acceptTerms", message: M.terms };
  return null;
}

/** Earliest step holding a field the server named, and that field. */
export function routeForResult(fieldErrors: Record<string, string[] | undefined>): { step: Step; field: string } | null {
  for (const field of Object.keys(FIELD_STEP)) if (fieldErrors[field]?.[0]) return { step: FIELD_STEP[field], field };
  return null;
}

/** Offers "Change dates" beside a general error. Never moves the renter by itself. */
export const isDatesError = (message: string): boolean =>
  /\b(dates|shortest rental|longest rental|driver)\b/i.test(message);
