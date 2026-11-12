import "server-only";
import { cache } from "react";
import type { MarketCode } from "@/lib/market";
import { mediaUrl } from "@/lib/media";
import { getVehicleBySlug, listInventory } from "@/lib/repositories/vehicles";
import { byWeekCost, listFleet, weekCost, type FleetVehicle } from "@/lib/repositories/rentals";
import { bodyGroup, type CompareCar } from "./compareData";

/** A cap, not a page size: the business lists a few dozen cars at most. */
const SALE_READ = 120;

const names = (v: { year: number; make: string; model: string; trim: string | null }) => ({
  name: [v.year, v.make, v.model, v.trim].filter(Boolean).join(" "),
  short: [v.year, v.make, v.model].filter(Boolean).join(" "),
});

const rentalOf = (f: FleetVehicle): CompareCar["rental"] => ({
  dailyMinor: f.tariff.dailyMinor,
  weeklyMinor: f.tariff.weeklyMinor,
  depositMinor: f.tariff.depositMinor,
  weekCostMinor: weekCost(f),
});

const clean = (list: unknown): string[] =>
  Array.isArray(list) ? list.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

/**
 * Every car that can be compared in a market: the cars for sale, lowest
 * price first, then the cars that are only for rent, lowest week first.
 *
 * The same two reads the lists use, so a car is here exactly when it is on
 * the sale list or the rental list: a sold or unlisted car is in neither,
 * which is how an old link's car comes to be dropped.
 *
 * Only what the table shows leaves this function. No VIN, no stock number,
 * no cost price: the page's link holds slugs and nothing else.
 */
export const loadCompareCars = cache(async (market: MarketCode): Promise<CompareCar[]> => {
  const [sale, fleet] = await Promise.all([
    listInventory(market, { limit: SALE_READ, sort: "price_asc" }),
    listFleet(market),
  ]);
  const rentals = new Map(fleet.map((f) => [f.slug, f]));

  const forSale: CompareCar[] = sale.vehicles.map((v) => {
    const f = rentals.get(v.slug);
    return {
      slug: v.slug,
      ...names(v),
      year: v.year,
      image: v.primaryImage ? mediaUrl(v.primaryImage) : null,
      forSale: true,
      priceMinor: v.priceMinor,
      mileage: v.mileage,
      bodyStyle: v.bodyStyle,
      bodyGroup: bodyGroup(v.bodyStyle, v.model, v.trim),
      engine: v.engine,
      transmission: v.transmission,
      drivetrain: v.drivetrain,
      fuel: v.fuelType,
      seats: v.seats,
      features: clean(v.features),
      rental: f ? rentalOf(f) : null,
    };
  });

  const listed = new Set(forSale.map((c) => c.slug));
  const rentOnly: CompareCar[] = [...fleet]
    .filter((f) => !listed.has(f.slug))
    .sort(byWeekCost)
    .map((f) => ({
      slug: f.slug,
      ...names(f),
      year: f.year,
      image: f.image,
      forSale: false,
      priceMinor: null,
      // The fleet read carries no miles, engine, drive or features. They are
      // filled in for the cars actually chosen (withDetails), not for all.
      mileage: null,
      bodyStyle: f.bodyStyle,
      bodyGroup: bodyGroup(f.bodyStyle, f.model, f.trim),
      engine: null,
      transmission: f.transmission,
      drivetrain: null,
      fuel: f.fuelType,
      seats: f.seats,
      features: [],
      rental: rentalOf(f),
    }));

  return [...forSale, ...rentOnly];
});

/**
 * A chosen car with every fact its listing has. Cars for sale already carry
 * them; a car that is only for rent gets its miles, engine, drive and
 * features from its own record, so "Not listed" in the table means the
 * listing really doesn't say.
 */
export async function withDetails(market: MarketCode, car: CompareCar): Promise<CompareCar> {
  if (car.forSale) return car;
  const v = await getVehicleBySlug(market, car.slug);
  if (!v) return car;
  return {
    ...car,
    mileage: v.mileage,
    engine: v.engine,
    drivetrain: v.drivetrain,
    features: clean(v.features),
  };
}
