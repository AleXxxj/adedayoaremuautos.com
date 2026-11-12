/**
 * Rent, buy or rent to own for a length of time: the three figures, which is
 * lowest, and the sentence that says so.
 *
 * Pure, so the tool (ThreeWayTool) and the build's checks (scripts/
 * verify-guides.ts) run the same code. The sentence states arithmetic and
 * nothing else: which figure is lowest and the plain reason. It never says
 * which a person should choose, and it never mentions credit.
 */
import { formatMoney, money, type CurrencyCode } from "@/lib/money";
import type { RentalTariff } from "@/lib/rental";
import type { OwnershipTier } from "@/lib/rentToOwn";
import {
  cheapestRental,
  lowestWays,
  rentToOwnFor,
  type OwnFigure,
  type RentCost,
  type Way,
} from "./guideMath";

export interface ThreeWayInput<T extends { name: string; tariff: RentalTariff }> {
  rent: T[];
  /** The lowest sale price in stock, or null with nothing for sale. */
  buyLowestMinor: number | null;
  /** The rent-to-own category with the lowest total, or null. */
  tier: OwnershipTier | null;
}

export interface ThreeWayFigures<T> {
  days: number;
  rent: { car: T; cost: RentCost } | null;
  buyMinor: number | null;
  own: OwnFigure | null;
  /** The lowest of the three; more than one on a tie, none with nothing to compare. */
  lowest: Way[];
}

export function threeWay<T extends { name: string; tariff: RentalTariff }>(
  input: ThreeWayInput<T>,
  days: number,
): ThreeWayFigures<T> {
  const rent = cheapestRental(input.rent, days);
  const own = input.tier ? rentToOwnFor(input.tier, days) : null;
  return {
    days,
    rent,
    buyMinor: input.buyLowestMinor,
    own,
    lowest: lowestWays({
      rent: rent?.cost.rentMinor ?? null,
      buy: input.buyLowestMinor,
      own: own?.paidMinor ?? null,
    }),
  };
}

const WAY_NAME: Record<Way, string> = { rent: "renting", buy: "buying", own: "rent to own" };

/**
 * "For 3 months, renting costs the least: $3,600 for the 2009 Smart. Rent is
 * charged only for the time you have the car."
 *
 * @param phrase the length as said in a sentence: "3 months", "2 years"
 */
export function verdict<T extends { name: string }>(
  f: ThreeWayFigures<T>,
  phrase: string,
  format: { currency: CurrencyCode; locale: string },
): string {
  const cash = (minor: number) => formatMoney(money(minor, format.currency), format.locale);
  if (f.lowest.length === 0) return "There is nothing to compare today.";

  if (f.lowest.length > 1) {
    const amount =
      f.lowest[0] === "rent" ? f.rent!.cost.rentMinor : f.lowest[0] === "buy" ? f.buyMinor! : f.own!.paidMinor;
    const names = f.lowest.map((w) => WAY_NAME[w]);
    return `For ${phrase}, ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} cost the same: ${cash(amount)}.`;
  }

  switch (f.lowest[0]) {
    case "rent":
      return `For ${phrase}, renting costs the least: ${cash(f.rent!.cost.rentMinor)} for the ${f.rent!.car.name}. Rent is charged only for the time you have the car, and you hand it back at the end.`;
    case "buy":
      return `For ${phrase}, buying costs the least: ${cash(f.buyMinor!)} for the lowest-priced car in stock, and you keep it. A sale price is paid once. Rent keeps adding up${
        f.rent ? `: ${cash(f.rent.cost.rentMinor)} for ${phrase}` : ""
      }.`;
    case "own":
      return f.own!.owned
        ? `For ${phrase}, rent to own costs the least: ${cash(f.own!.paidMinor)} in rent, and the car is yours. Rent stops once it reaches the total.`
        : `For ${phrase}, rent to own costs the least: ${cash(f.own!.paidMinor)} in rent, toward a total of ${cash(f.own!.totalMinor)} to own the car.`;
  }
}
