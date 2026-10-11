/**
 * Referral codes.
 *
 * The site has advertised commission and "track your referrals easily"
 * since the original build, with nothing behind either — no codes, no
 * attribution, so a commission could only ever be settled from memory.
 */

/**
 * Where a followed partner link is remembered.
 *
 * httpOnly: nothing in the browser needs to read it, and a code that page
 * scripts can rewrite is a code a competitor can rewrite.
 */
export const REF_COOKIE = "aaa_ref";

/** Ninety days. Buying a car is a slow decision; a week would lose most of it. */
export const REF_COOKIE_MAX_AGE = 90 * 24 * 60 * 60;

/**
 * Ambiguous characters are excluded. These codes get read down a phone line
 * and written on the back of receipts, where O/0 and I/1 are the same
 * character, and a mistyped code silently pays nobody.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Matches the database CHECK on referral_partners.code. */
export const CODE_RE = /^[A-Z0-9-]{4,20}$/;

export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase().slice(0, 20);
}

/**
 * A code derived from the partner's own name, so they recognise it as theirs:
 * "Chidi Okafor" -> "CHIDI-4K7P". Falls back to a plain random code when the
 * name has nothing usable in it.
 */
export function suggestCode(fullName: string, random = randomPart): string {
  const stem = fullName
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[^A-Z]/g, "")
    .slice(0, 8);
  return stem.length >= 3 ? `${stem}-${random()}` : `AAA-${random()}${random()}`;
}

function randomPart(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** The link a partner shares. Short enough to say out loud. */
export function referralLink(base: string, code: string): string {
  return `${base.replace(/\/+$/, "")}/r/${code}`;
}

/** Where a partner reads and accepts their agreement. */
export function agreementLink(base: string, token: string): string {
  return `${base.replace(/\/+$/, "")}/partner/agreement/${token}`;
}

/** Where they turn an accepted agreement into an account they can log into. */
export function accountSetupLink(base: string, token: string): string {
  return `${base.replace(/\/+$/, "")}/partner/start/${token}`;
}

/**
 * Whose law the partner agreement is read under.
 *
 * Named rather than left to "the applicable jurisdiction", because a finder's
 * fee argument between Greensboro and Lagos with no governing law in the
 * agreement is an argument about which court before it is an argument about
 * the money.
 */
export function governingLaw(market: "us" | "ng"): string {
  return market === "us"
    ? "the State of North Carolina, United States of America"
    : "the Federal Republic of Nigeria";
}

/** 150 bps -> "1.5%", 500 -> "5%" */
export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}

/** A partner's two rates. Satisfied by a `referralPartners` row. */
export interface PartnerRates {
  /** The sale rate. The column has no prefix for historical reasons. */
  commissionBps: number;
  rentalCommissionBps: number;
}

/**
 * Which of a partner's two rates applies.
 *
 * Exists so that every call site has to say what it is pricing. The sale rate
 * lives in a column called `commission_bps` with no prefix, which makes it the
 * obvious thing to reach for when writing a hire commission — and a hire
 * quietly paid at the sale rate is a partner underpaid by more than three to
 * one, with nothing on screen to show it happened.
 */
export function rateFor(p: PartnerRates, source: "sale" | "rental"): number {
  return source === "rental" ? p.rentalCommissionBps : p.commissionBps;
}

/**
 * What a partner earns, in minor units, rounded to the currency.
 *
 * Takes the rate rather than the partner, so the caller has already had to
 * decide which one applies.
 */
export function commissionOn(basisMinor: number, bps: number): number {
  return Math.round((basisMinor * bps) / 10000);
}
