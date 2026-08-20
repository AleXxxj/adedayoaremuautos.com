import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { vehicles, rentalRates } from "@/db/schema";
import { listTiers, toOwnershipTier } from "@/lib/repositories/tiers";
import { listLocations, formatPhone } from "@/lib/repositories/locations";
import { pathToOwnership } from "@/lib/rentToOwn";
import { formatMoney, money } from "@/lib/money";
import { MARKETS, type MarketCode } from "@/lib/market";

/** Enough stock to answer honestly; not so much that the prompt bloats. */
const MAX_VEHICLES = 40;

/**
 * Everything the assistant is allowed to know, drawn from the live database.
 *
 * The assistant is grounded rather than generative about facts: it never
 * invents a car, a price or a rate, because everything it can say about them
 * is assembled here from the same rows the public pages render. A chatbot that
 * improvises inventory will eventually promise a customer a vehicle that was
 * sold last month, and in a dealership that is not a cosmetic error.
 *
 * Prices are pre-formatted in the market's own currency. Handing the model raw
 * minor units and asking it to divide by a hundred is exactly the sort of
 * arithmetic it should never be doing in front of a customer.
 */
export async function buildBusinessContext(market: MarketCode): Promise<string> {
  const cfg = MARKETS[market];
  const fmt = (minor: number | null) =>
    minor == null ? "price on request" : formatMoney(money(minor, cfg.currency), cfg.locale);

  const [forSale, fleet, tiers, sites] = await Promise.all([
    db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.marketCode, market), eq(vehicles.status, "available")))
      .orderBy(asc(vehicles.priceMinor))
      .limit(MAX_VEHICLES),
    db
      .select({ v: vehicles, r: rentalRates })
      .from(vehicles)
      .innerJoin(rentalRates, eq(rentalRates.vehicleId, vehicles.id))
      .where(
        and(
          eq(vehicles.marketCode, market),
          inArray(vehicles.listingKind, ["rental", "both"]),
          inArray(vehicles.status, ["available", "pending"]),
        ),
      )
      .limit(MAX_VEHICLES),
    listTiers(market),
    listLocations(market),
  ]);

  const lines: string[] = [];

  lines.push(`## Market: ${cfg.name} (prices in ${cfg.currency})`);

  // ── Where the business is ────────────────────────────────────────────────
  if (sites.length > 0) {
    lines.push("\n## Our locations");
    for (const s of sites) {
      lines.push(
        `- ${s.name}: ${[s.addressLine1, s.city, s.region, s.postalCode].filter(Boolean).join(", ")}` +
          (s.phone ? ` — phone ${formatPhone(s.phone)}` : ""),
      );
    }
  }

  // ── Cars for sale ────────────────────────────────────────────────────────
  lines.push(`\n## Vehicles for sale (${forSale.length} listed)`);
  if (forSale.length === 0) {
    lines.push("- Nothing is listed for sale right now.");
  } else {
    for (const v of forSale) {
      const bits = [
        `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}`,
        fmt(v.priceMinor),
        v.mileage != null ? `${v.mileage.toLocaleString()} ${v.mileageUnit}` : null,
        v.transmission,
        v.fuelType,
        v.condition,
      ].filter(Boolean);
      lines.push(`- ${bits.join(" · ")} — page: /${market}/inventory/${v.slug}`);
    }
  }

  // ── Cars for hire ────────────────────────────────────────────────────────
  lines.push(`\n## Vehicles available to rent (${fleet.length})`);
  if (fleet.length === 0) {
    lines.push("- No vehicles are on the rental fleet right now.");
  } else {
    for (const { v, r } of fleet) {
      const rates = [
        `${fmt(r.dailyMinor)}/day`,
        r.weeklyMinor != null ? `${fmt(r.weeklyMinor)}/week` : null,
        r.monthlyMinor != null ? `${fmt(r.monthlyMinor)}/month` : null,
      ].filter(Boolean);
      lines.push(
        `- ${v.year} ${v.make} ${v.model} — ${rates.join(", ")}` +
          (r.depositMinor > 0 ? `, refundable deposit ${fmt(r.depositMinor)}` : "") +
          (r.withDriverAvailable && r.driverDailyMinor != null
            ? `, driver available at ${fmt(r.driverDailyMinor)}/day`
            : "") +
          ` — page: /${market}/rentals/${v.slug}`,
      );
    }
    lines.push(
      "  Longer hires are automatically priced on the cheapest combination of " +
        "daily, weekly and monthly rates. Nobody pays more than the daily rate times the days.",
    );
  }

  // ── Rent to own ──────────────────────────────────────────────────────────
  lines.push(`\n## Rent to Own plans (${tiers.length})`);
  if (tiers.length === 0) {
    lines.push("- No rent-to-own plans are published for this market yet.");
  } else {
    for (const t of tiers) {
      const path = pathToOwnership(toOwnershipTier(t));
      const rates = [
        `${fmt(t.dailyMinor)}/day`,
        t.weeklyMinor != null ? `${fmt(t.weeklyMinor)}/week` : null,
        t.monthlyMinor != null ? `${fmt(t.monthlyMinor)}/month` : null,
      ].filter(Boolean);
      lines.push(
        `- ${t.name}: ${rates.join(", ")}` +
          (t.ownershipThresholdMinor != null
            ? `. The car becomes theirs once ${fmt(t.ownershipThresholdMinor)} of rent has been paid` +
              (path ? ` — about ${path.days} days of continuous hire` : "")
            : ". Hire only — this plan does not lead to ownership") +
          `. Page: /${market}/rent-to-own/${t.slug}`,
      );
    }
  }

  return lines.join("\n");
}
