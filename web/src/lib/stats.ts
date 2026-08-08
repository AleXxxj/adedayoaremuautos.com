import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { vehicles } from "@/db/schema";

/**
 * Vehicles sold before this platform existed, as stated by the owner.
 *
 * The old site claimed "50+ Vehicles Sold" and "100% Client Satisfaction",
 * neither of which was substantiated. In the US market, marketing claims you
 * cannot support are a liability, so this figure is now (a) the real number the
 * owner gave us, and (b) the ONLY hardcoded part — every sale recorded through
 * the platform from here on is counted live.
 *
 * Update this only if the historical figure is itself corrected.
 */
export const HISTORICAL_SALES = 15;

export interface SiteStats {
  /** Historical figure plus every sale recorded in the system. */
  vehiclesSold: number;
  /** Sales recorded by the platform itself. */
  salesOnPlatform: number;
  /** Currently listed and buyable. */
  available: number;
}

export async function getSiteStats(): Promise<SiteStats> {
  const [[sold], [available]] = await Promise.all([
    db
      .select({ n: count() })
      .from(vehicles)
      .where(eq(vehicles.status, "sold")),
    db
      .select({ n: count() })
      .from(vehicles)
      .where(eq(vehicles.status, "available")),
  ]);

  const salesOnPlatform = Number(sold.n);

  return {
    salesOnPlatform,
    vehiclesSold: HISTORICAL_SALES + salesOnPlatform,
    available: Number(available.n),
  };
}

/**
 * Renders a count as an honest "15+" style figure.
 *
 * The "+" is meaningful rather than decorative: it marks a floor, which is
 * exactly what a historical figure plus live sales is. Once enough sales are
 * recorded through the platform the number stands on its own.
 */
export function formatMilestone(n: number, locale: string): string {
  return `${new Intl.NumberFormat(locale).format(n)}+`;
}
