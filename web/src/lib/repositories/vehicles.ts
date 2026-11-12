/**
 * Vehicle queries.
 *
 * Every function here takes a MarketCode and filters on it. There is no way to
 * fetch "all vehicles" across markets, because there is no page that should
 * ever show a Lagos car and a Greensboro car in the same list.
 */

import { and, asc, desc, eq, gte, lte, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { vehicles, vehicleMedia, rentalRates } from "@/db/schema";
import type { MarketCode } from "../market";
import { mediaUrl } from "../media";
import { isJustIn, type PublicCar } from "@/components/cars/carData";

export type SortKey =
  | "newest"
  | "price_asc"
  | "price_desc"
  | "year_desc"
  | "mileage_asc";

export interface InventoryFilters {
  make?: string;
  condition?: string;
  transmission?: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  minYear?: number;
  maxYear?: number;
  query?: string;
  /**
   * Only these cars. The sale list works out in code which cars match a body
   * type or a brand (both are read from hand-typed text, see
   * components/cars/carData.ts) and hands the matches here, so sorting and
   * paging stay in the database.
   */
  ids?: string[];
  sort?: SortKey;
  limit?: number;
  offset?: number;
}

const ORDER_BY = {
  newest: desc(vehicles.publishedAt),
  price_asc: asc(vehicles.priceMinor),
  price_desc: desc(vehicles.priceMinor),
  year_desc: desc(vehicles.year),
  mileage_asc: asc(vehicles.mileage),
} as const satisfies Record<SortKey, unknown>;

/**
 * What puts a car on the public sale list, with any filters applied. Only
 * listable vehicles, and only cars offered for sale: a rental-only car has no
 * sale price, so it would be counted as "for sale" and listed as "Price on
 * request".
 */
function saleWhere(market: MarketCode, filters: InventoryFilters) {
  const {
    make,
    condition,
    transmission,
    minPriceMinor,
    maxPriceMinor,
    minYear,
    maxYear,
    query,
    ids,
  } = filters;

  return and(
    eq(vehicles.marketCode, market),
    // 'pending' still shows — a car under offer is social proof, and buyers
    // ask about it. 'draft', 'sold' and 'unlisted' never reach the public.
    or(eq(vehicles.status, "available"), eq(vehicles.status, "pending")),
    or(eq(vehicles.listingKind, "sale"), eq(vehicles.listingKind, "both")),
    make ? eq(vehicles.make, make) : undefined,
    condition ? eq(vehicles.condition, condition) : undefined,
    transmission ? eq(vehicles.transmission, transmission) : undefined,
    minPriceMinor !== undefined ? gte(vehicles.priceMinor, minPriceMinor) : undefined,
    maxPriceMinor !== undefined ? lte(vehicles.priceMinor, maxPriceMinor) : undefined,
    minYear !== undefined ? gte(vehicles.year, minYear) : undefined,
    maxYear !== undefined ? lte(vehicles.year, maxYear) : undefined,
    query
      ? or(
          ilike(vehicles.make, `%${query}%`),
          ilike(vehicles.model, `%${query}%`),
          ilike(vehicles.trim, `%${query}%`),
        )
      : undefined,
    ids ? inArray(vehicles.id, ids) : undefined,
  );
}

/** Public inventory for one market: the cars `saleWhere` lets through. */
export async function listInventory(
  market: MarketCode,
  filters: InventoryFilters = {},
) {
  const { sort = "newest", limit = 24, offset = 0 } = filters;

  // No car is in an empty list of ids, and `IN ()` is not valid SQL.
  if (filters.ids && filters.ids.length === 0) {
    const none: (typeof vehicles.$inferSelect & { primaryImage: string | null })[] = [];
    return { vehicles: none, total: 0, hasMore: false };
  }

  const where = saleWhere(market, filters);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(vehicles)
      .where(where)
      .orderBy(ORDER_BY[sort], desc(vehicles.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(vehicles)
      .where(where),
  ]);

  const media = rows.length ? await primaryMediaFor(rows.map((r) => r.id)) : {};

  return {
    vehicles: rows.map((v) => ({ ...v, primaryImage: media[v.id] ?? null })),
    total,
    hasMore: offset + rows.length < total,
  };
}

/**
 * Every car on the sale list that passes these filters, as little of each as
 * the list's header, chips and make filter read: how many cars and where
 * their prices start, which body types are in stock and how many of each,
 * which brands, and which cars a chosen one leaves.
 */
export async function inventoryFacets(
  market: MarketCode,
  filters: Omit<InventoryFilters, "sort" | "limit" | "offset" | "ids" | "make"> = {},
) {
  return db
    .select({
      id: vehicles.id,
      make: vehicles.make,
      model: vehicles.model,
      trim: vehicles.trim,
      bodyStyle: vehicles.bodyStyle,
      priceMinor: vehicles.priceMinor,
    })
    .from(vehicles)
    .where(saleWhere(market, filters));
}

/**
 * Listed cars by slug, as cards show them: for the cars a browser has saved
 * or looked at (app/api/cars). Only cars the public lists show, and only the
 * fields a card prints. A car that is sold, unlisted or unknown is simply not
 * in the answer.
 */
export async function publicCarsBySlug(
  market: MarketCode,
  slugs: string[],
  now: Date,
): Promise<PublicCar[]> {
  if (slugs.length === 0) return [];

  const rows = await db
    .select({ v: vehicles, r: rentalRates })
    .from(vehicles)
    .leftJoin(rentalRates, eq(rentalRates.vehicleId, vehicles.id))
    .where(
      and(
        eq(vehicles.marketCode, market),
        inArray(vehicles.slug, slugs),
        or(eq(vehicles.status, "available"), eq(vehicles.status, "pending")),
      ),
    );
  if (rows.length === 0) return [];

  const media = await primaryMediaFor(rows.map(({ v }) => v.id));

  return rows.flatMap(({ v, r }) => {
    const forSale = v.listingKind === "sale" || v.listingKind === "both";
    // The rental list's own rule: flagged for rental and priced.
    const forRent = (v.listingKind === "rental" || v.listingKind === "both") && r != null;
    if (!forSale && !forRent) return [];
    return [
      {
        slug: v.slug,
        year: v.year,
        make: v.make,
        model: v.model,
        trim: v.trim,
        bodyStyle: v.bodyStyle,
        mileage: v.mileage,
        transmission: v.transmission,
        fuelType: v.fuelType,
        drivetrain: v.drivetrain,
        seats: v.seats,
        image: media[v.id] ? mediaUrl(media[v.id]) : null,
        pending: v.status === "pending",
        justIn: isJustIn(v.publishedAt, now),
        sale: forSale ? { priceMinor: v.priceMinor } : null,
        rent:
          forRent && r
            ? {
                dailyMinor: r.dailyMinor,
                weeklyMinor: r.weeklyMinor,
                driver: r.withDriverAvailable,
              }
            : null,
      },
    ];
  });
}

/** Primary photo per vehicle, in one query rather than N. */
async function primaryMediaFor(ids: string[]): Promise<Record<string, string>> {
  const rows = await db
    .select({
      vehicleId: vehicleMedia.vehicleId,
      storageKey: vehicleMedia.storageKey,
    })
    .from(vehicleMedia)
    .where(
      and(
        sql`${vehicleMedia.vehicleId} = ANY(${sql.raw(`ARRAY['${ids.join("','")}']::uuid[]`)})`,
        eq(vehicleMedia.isPrimary, true),
      ),
    );

  return Object.fromEntries(rows.map((r) => [r.vehicleId, r.storageKey]));
}

/** A single vehicle by slug, scoped to its market. */
export async function getVehicleBySlug(market: MarketCode, slug: string) {
  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.marketCode, market), eq(vehicles.slug, slug)))
    .limit(1);

  if (!vehicle) return null;
  if (vehicle.status === "draft" || vehicle.status === "unlisted") return null;

  const images = await db
    .select()
    .from(vehicleMedia)
    .where(eq(vehicleMedia.vehicleId, vehicle.id))
    .orderBy(desc(vehicleMedia.isPrimary), asc(vehicleMedia.position));

  return { ...vehicle, images };
}

/** Distinct makes present in a market, for the filter UI. */
export async function availableMakes(market: MarketCode) {
  const rows = await db
    .selectDistinct({ make: vehicles.make })
    .from(vehicles)
    .where(
      and(eq(vehicles.marketCode, market), eq(vehicles.status, "available")),
    )
    .orderBy(asc(vehicles.make));
  return rows.map((r) => r.make);
}

/** Slugs for static generation / sitemap. */
export async function allListedSlugs(market: MarketCode) {
  return db
    .select({ slug: vehicles.slug, updatedAt: vehicles.updatedAt })
    .from(vehicles)
    .where(
      and(
        eq(vehicles.marketCode, market),
        or(eq(vehicles.status, "available"), eq(vehicles.status, "pending")),
      ),
    );
}

/**
 * Distinct values present in a market, for building the filter selects.
 *
 * Driven off real inventory rather than a hardcoded list, so the Brand
 * dropdown never offers a marque with nothing behind it — the legacy site
 * listed Range Rover and BMW permanently, both of which returned no results.
 */
export async function filterOptions(market: MarketCode) {
  const rows = await db
    .select({
      make: vehicles.make,
      year: vehicles.year,
      transmission: vehicles.transmission,
      fuelType: vehicles.fuelType,
    })
    .from(vehicles)
    .where(
      and(
        eq(vehicles.marketCode, market),
        or(eq(vehicles.status, "available"), eq(vehicles.status, "pending")),
      ),
    );

  const uniq = <T,>(xs: (T | null)[]) =>
    [...new Set(xs.filter((x): x is T => x != null && x !== ""))];

  return {
    makes: uniq(rows.map((r) => r.make)).sort(),
    years: uniq(rows.map((r) => r.year)).sort((a, b) => b - a),
    transmissions: uniq(rows.map((r) => r.transmission)).sort(),
    fuels: uniq(rows.map((r) => r.fuelType)).sort(),
  };
}
