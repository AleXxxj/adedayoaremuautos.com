import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { rentalTiers } from "@/db/schema";
import type { MarketCode } from "../market";
import type { OwnershipTier } from "../rentToOwn";

/**
 * Rent-to-own tiers for a market, in display order.
 *
 * Returns the shape the ownership maths expects, so the page cannot drift from
 * the calculation by mapping fields differently.
 */
export async function listTiers(market: MarketCode): Promise<OwnershipTier[]> {
  const rows = await db
    .select()
    .from(rentalTiers)
    .where(and(eq(rentalTiers.marketCode, market), eq(rentalTiers.isActive, true)))
    .orderBy(asc(rentalTiers.position), asc(rentalTiers.dailyMinor));

  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    tagline: r.tagline,
    dailyMinor: r.dailyMinor,
    weeklyMinor: r.weeklyMinor,
    monthlyMinor: r.monthlyMinor,
    ownershipThresholdMinor: r.ownershipThresholdMinor,
    depositMinor: r.depositMinor,
    currency: r.currency,
  }));
}
