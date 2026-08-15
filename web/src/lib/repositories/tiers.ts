import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { rentalTiers, vehicles, vehicleMedia, type RentalTier } from "@/db/schema";
import { pathToOwnership, type OwnershipTier } from "@/lib/rentToOwn";
import type { MarketCode } from "@/lib/market";

/** The database row reduced to what the ownership maths needs. */
export function toOwnershipTier(t: RentalTier): OwnershipTier {
  return {
    slug: t.slug,
    name: t.name,
    tagline: t.tagline,
    dailyMinor: t.dailyMinor,
    weeklyMinor: t.weeklyMinor,
    monthlyMinor: t.monthlyMinor,
    ownershipThresholdMinor: t.ownershipThresholdMinor,
    depositMinor: t.depositMinor,
    currency: t.currency,
  };
}

/**
 * Active categories for a market, in display order.
 *
 * Returns the full row rather than only the fields the ownership maths needs,
 * because the category pages have to link to a tier by id. It remains
 * structurally compatible with OwnershipTier, so pathToOwnership still takes
 * it directly and the page cannot drift from the calculation.
 *
 * Price is the tie-break, so two categories sharing a position still appear
 * cheapest-first rather than in whatever order the database returns them.
 */
export async function listTiers(market: MarketCode): Promise<RentalTier[]> {
  return db
    .select()
    .from(rentalTiers)
    .where(and(eq(rentalTiers.marketCode, market), eq(rentalTiers.isActive, true)))
    .orderBy(asc(rentalTiers.position), asc(rentalTiers.dailyMinor));
}

export async function findTier(
  market: MarketCode,
  slug: string,
): Promise<RentalTier | null> {
  const [row] = await db
    .select()
    .from(rentalTiers)
    .where(
      and(
        eq(rentalTiers.marketCode, market),
        eq(rentalTiers.slug, slug),
        eq(rentalTiers.isActive, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Categories for the admin's vehicle form, across every market the signed-in
 * person can act on. Inactive ones are included so that editing an old vehicle
 * does not silently drop the category it is already in.
 */
export async function listTierOptions(markets: MarketCode[]) {
  const rows = await db
    .select()
    .from(rentalTiers)
    .orderBy(asc(rentalTiers.marketCode), asc(rentalTiers.position));

  return rows
    .filter((t) => markets.includes(t.marketCode))
    .map((t) => {
      const path = pathToOwnership(toOwnershipTier(t));
      return {
        id: t.id,
        marketCode: t.marketCode,
        name: t.isActive ? t.name : `${t.name} (inactive)`,
        ownsAfter: path ? `${path.days} days` : null,
      };
    });
}

export interface TierVehicle {
  id: string;
  slug: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
  mileageUnit: string | null;
  transmission: string | null;
  fuelType: string | null;
  bodyStyle: string | null;
  exteriorColor: string | null;
  condition: string;
  headline: string | null;
  features: unknown;
  imageKey: string | null;
}

/**
 * Vehicles offered under one category.
 *
 * Only `available` stock: a rent-to-own page is an invitation to commit to a
 * specific car for months, so listing one that is already sold or still a
 * draft would be a promise the business cannot keep.
 */
export async function listTierVehicles(
  market: MarketCode,
  tierId: string,
): Promise<TierVehicle[]> {
  const rows = await db
    .select({
      id: vehicles.id,
      slug: vehicles.slug,
      year: vehicles.year,
      make: vehicles.make,
      model: vehicles.model,
      trim: vehicles.trim,
      mileage: vehicles.mileage,
      mileageUnit: vehicles.mileageUnit,
      transmission: vehicles.transmission,
      fuelType: vehicles.fuelType,
      bodyStyle: vehicles.bodyStyle,
      exteriorColor: vehicles.exteriorColor,
      condition: vehicles.condition,
      headline: vehicles.headline,
      features: vehicles.features,
      imageKey: vehicleMedia.storageKey,
    })
    .from(vehicles)
    .leftJoin(
      vehicleMedia,
      and(
        eq(vehicleMedia.vehicleId, vehicles.id),
        eq(vehicleMedia.position, 0),
      ),
    )
    .where(
      and(
        eq(vehicles.marketCode, market),
        eq(vehicles.rentalTierId, tierId),
        eq(vehicles.status, "available"),
      ),
    )
    .orderBy(asc(vehicles.year));

  return rows as TierVehicle[];
}

/** One vehicle within a category, for the application form. */
export async function findTierVehicle(
  market: MarketCode,
  tierId: string,
  slug: string,
): Promise<TierVehicle | null> {
  const all = await listTierVehicles(market, tierId);
  return all.find((v) => v.slug === slug) ?? null;
}
