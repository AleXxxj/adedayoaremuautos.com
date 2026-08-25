import type { MarketCode } from "@/lib/market";

/**
 * A phone number as a person would write it.
 *
 * Customers type their number however they like — "4783971097",
 * "(478) 397-1097", "+1 478 397 1097" — and the booking stores exactly what
 * they typed. That is right for a form field and wrong for a contract, where
 * an unpunctuated run of ten digits reads as a reference number rather than
 * something you could dial.
 *
 * The existing formatPhone only recognised `+1` followed by ten digits, which
 * is the shape the business's own location records use and almost never the
 * shape a customer submits.
 *
 * Market-aware, because the two markets group digits differently and a
 * Nigerian number rendered as an American one is worse than leaving it alone.
 * Anything unrecognised is returned untouched — a contract must never show a
 * number that has been reformatted into something wrong.
 */
export function displayPhone(raw: string | null, market: MarketCode): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return raw;

  if (market === "us") {
    // 4783971097 or 14783971097
    const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    if (local.length === 10) {
      return `+1 (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
    }
    return raw;
  }

  // Nigeria: 08012345678, 2348012345678, or 8012345678.
  let local = digits;
  if (local.startsWith("234")) local = local.slice(3);
  else if (local.startsWith("0")) local = local.slice(1);

  if (local.length === 10) {
    return `+234 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return raw;
}
