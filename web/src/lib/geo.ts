import { headers } from "next/headers";
import { MARKETS, type MarketCode } from "./market";

/**
 * Which market a country belongs to.
 *
 * Only the two countries the business actually operates in are mapped. A
 * visitor from anywhere else is not offered a switch, because there is no
 * better market to send them to and a prompt with no good answer is noise.
 */
const COUNTRY_TO_MARKET: Record<string, MarketCode> = {
  US: "us",
  NG: "ng",
};

const COUNTRY_NAMES: Record<string, string> = {
  US: "the United States",
  NG: "Nigeria",
};

export interface MarketSuggestion {
  code: MarketCode;
  country: string;
  currency: string;
}

/**
 * The market this visitor's country suggests, when it differs from the one
 * they are looking at.
 *
 * The country comes from the edge — Vercel sets `x-vercel-ip-country`, and
 * Cloudflare's equivalent is accepted so the behaviour survives a change of
 * host. Locally neither header exists, so nothing is suggested, which is the
 * correct default: never guess a country from a timezone or a language, both
 * of which are wrong constantly for diaspora customers.
 */
export async function suggestMarket(
  current: MarketCode,
): Promise<MarketSuggestion | null> {
  const h = await headers();
  const country = (
    h.get("x-vercel-ip-country") ??
    h.get("cf-ipcountry") ??
    ""
  ).toUpperCase();

  const code = COUNTRY_TO_MARKET[country];
  if (!code || code === current) return null;

  return {
    code,
    country: COUNTRY_NAMES[country] ?? MARKETS[code].name,
    currency: MARKETS[code].currency,
  };
}
