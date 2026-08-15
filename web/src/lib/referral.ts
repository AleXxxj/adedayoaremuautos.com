/**
 * Referral codes.
 *
 * The site has advertised 1.5% commission and "track your referrals easily"
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

/** 150 bps -> "1.5%" */
export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}

/** What a partner earns on a sale, in minor units, rounded to the currency. */
export function commissionOn(saleMinor: number, bps: number): number {
  return Math.round((saleMinor * bps) / 10000);
}
