/**
 * Market configuration.
 *
 * A market is a first-class dimension of this system, not a currency dropdown.
 * Inventories are disjoint: a vehicle in Lagos is not purchasable in Greensboro
 * at an FX-converted price, and presenting one as if it were is the central
 * mistake the legacy site made.
 *
 * Everything that differs by geography — currency, units, condition taxonomy,
 * vehicle identifiers, legal disclosure obligations — resolves from here.
 */

import type { CurrencyCode } from "./money";

export type MarketCode = "us" | "ng";

export interface MarketConfig {
  readonly code: MarketCode;
  readonly name: string;
  readonly country: string;
  readonly currency: CurrencyCode;
  readonly locale: string;
  readonly timezone: string;
  readonly distanceUnit: "mi" | "km";
  /** Condition labels buyers in this market actually use. */
  readonly conditions: readonly string[];
  /** How a vehicle is uniquely identified for buyers here. */
  readonly vehicleIdLabel: string;
  /** Whether a decodable 17-character VIN is expected and validated. */
  readonly usesVin: boolean;
  /** Whether buyers expect a third-party history report before enquiring. */
  readonly expectsHistoryReport: boolean;
  readonly financing: {
    /** In-house instalment plans quote a term; lenders quote an APR. */
    readonly quotesApr: boolean;
    readonly termMonths: readonly number[];
  };
  readonly compliance: {
    /**
     * When true, showing a monthly payment figure legally requires disclosing
     * down payment, repayment terms and APR in the same context.
     * US: Truth in Lending Act, Reg Z — monthly payment is a "triggering term".
     */
    readonly monthlyPaymentRequiresDisclosure: boolean;
    /** FTC Used Car Rule — Buyers Guide required on used vehicles for sale. */
    readonly requiresBuyersGuide: boolean;
  };
}

export const MARKETS: Record<MarketCode, MarketConfig> = {
  us: {
    code: "us",
    name: "United States",
    country: "US",
    currency: "USD",
    locale: "en-US",
    timezone: "America/New_York",
    distanceUnit: "mi",
    conditions: ["New", "Used", "Certified Pre-Owned"],
    vehicleIdLabel: "VIN",
    usesVin: true,
    expectsHistoryReport: true,
    financing: {
      quotesApr: true,
      termMonths: [24, 36, 48, 60, 72],
    },
    compliance: {
      monthlyPaymentRequiresDisclosure: true,
      requiresBuyersGuide: true,
    },
  },

  ng: {
    code: "ng",
    name: "Nigeria",
    country: "NG",
    currency: "NGN",
    locale: "en-NG",
    timezone: "Africa/Lagos",
    distanceUnit: "km",
    // "Foreign Used" (Tokunbo) is a real and load-bearing category here and
    // meaningless in the US. "Certified Pre-Owned" is the reverse.
    conditions: ["Brand New", "Foreign Used", "Nigerian Used"],
    vehicleIdLabel: "Chassis No.",
    usesVin: false,
    expectsHistoryReport: false,
    financing: {
      quotesApr: false,
      termMonths: [6, 12, 18, 24],
    },
    compliance: {
      monthlyPaymentRequiresDisclosure: false,
      requiresBuyersGuide: false,
    },
  },
};

export const MARKET_CODES = Object.keys(MARKETS) as MarketCode[];

export const isMarketCode = (v: string): v is MarketCode =>
  Object.prototype.hasOwnProperty.call(MARKETS, v);

export const getMarket = (code: MarketCode): MarketConfig => MARKETS[code];

/** Format a distance in the market's own unit. */
export function formatDistance(value: number, m: MarketConfig): string {
  return `${new Intl.NumberFormat(m.locale).format(value)} ${m.distanceUnit}`;
}
