/**
 * Vehicle queries.
 *
 * Every function here takes a MarketCode and filters on it. There is no way to
 * fetch "all vehicles" across markets, because there is no page that should
 * ever show a Lagos car and a Greensboro car in the same list.
 */

import { and, asc, desc, eq, gte, lte, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { vehicles, vehicleMedia } from "@/db/schema";
import type { MarketCode } from "../market";

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

/** Public inventory for one market. Only ever returns listable vehicles. */
export async function listInventory(
  market: MarketCode,
  filters: InventoryFilters = {},
) {
  const {
    make,
    condition,
    transmission,
    minPriceMinor,
    maxPriceMinor,
    minYear,
    maxYear,
    query,
    sort = "newest",
    limit = 24,
    offset = 0,
  } = filters;

  const where = and(
    eq(vehicles.marketCode, market),
    // 'pending' still shows — a car under offer is social proof, and buyers
    // ask about it. 'draft', 'sold' and 'unlisted' never reach the public.
    or(eq(vehicles.status, "available"), eq(vehicles.status, "pending")),
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
  );

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
