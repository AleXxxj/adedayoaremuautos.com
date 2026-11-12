import "server-only";
import { cache } from "react";
import { MARKETS } from "@/lib/market";
import { mediaUrl } from "@/lib/media";
import { listInventory } from "@/lib/repositories/vehicles";
import { byWeekCost, listFleet } from "@/lib/repositories/rentals";
import { listTiers, toOwnershipTier } from "@/lib/repositories/tiers";
import { listLocations, formatPhone } from "@/lib/repositories/locations";
import { providerConfigured, providerFor } from "@/lib/payments/provider";
import { MAX_OPEN_RESERVATIONS, RESERVATION_HOURS } from "@/lib/reservation";
import type { GuideData } from "@/content/guides/types";

/** A cap, not a page size: the business lists a few dozen cars at most. */
const SALE_READ = 120;

const carName = (v: { year: number; make: string; model: string; trim: string | null }) =>
  [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");

/**
 * Today's stock and rules, as the guides read them: four reads, nothing
 * written. Wrapped in `cache` so a page and its metadata share one load.
 *
 * Only what a guide shows leaves this function: names, photos, prices,
 * rates, years and miles. No ids, no VINs, no cost prices.
 */
export const loadGuideData = cache(async (): Promise<GuideData> => {
  const market = MARKETS.us;
  const [fleet, sale, tiers, sites] = await Promise.all([
    listFleet("us"),
    listInventory("us", { limit: SALE_READ, sort: "price_asc" }),
    listTiers("us"),
    listLocations("us"),
  ]);
  const phone = sites.find((s) => s.phone)?.phone ?? null;
  const updated = sale.vehicles.map((v) => v.updatedAt.getTime());

  return {
    currency: market.currency,
    locale: market.locale,
    distanceUnit: market.distanceUnit,
    rent: [...fleet].sort(byWeekCost).map((v) => ({
      slug: v.slug,
      name: carName(v),
      image: v.image,
      tariff: v.tariff,
    })),
    sale: sale.vehicles
      .filter((v): v is typeof v & { priceMinor: number } => v.priceMinor != null)
      .map((v) => ({
        slug: v.slug,
        name: carName(v),
        year: v.year,
        mileage: v.mileage,
        priceMinor: v.priceMinor,
        image: v.primaryImage ? mediaUrl(v.primaryImage) : null,
        transmission: v.transmission,
        pending: v.status === "pending",
      })),
    saleTotal: sale.total,
    tiers: tiers.map(toOwnershipTier),
    payOnline: providerConfigured(providerFor("us")),
    holdDays: RESERVATION_HOURS / 24,
    maxHolds: MAX_OPEN_RESERVATIONS,
    phone,
    phoneLabel: formatPhone(phone),
    stockUpdated: updated.length ? new Date(Math.max(...updated)).toISOString() : null,
  };
});
