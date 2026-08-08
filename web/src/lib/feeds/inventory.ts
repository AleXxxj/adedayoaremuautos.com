import "server-only";
import { and, asc, desc, eq, isNotNull, or } from "drizzle-orm";
import { db } from "@/db";
import { vehicles, vehicleMedia } from "@/db/schema";
import { MARKETS, type MarketCode } from "@/lib/market";
import { money, toMajor } from "@/lib/money";
import { mediaUrl } from "@/lib/media";

/**
 * Canonical feed data.
 *
 * This is the layer that turns inventory into distribution. Buyers do not start
 * at a dealer's website — they start on Google, Facebook Marketplace, CarGurus
 * and Cars.com. A feed is how your stock appears there. Everything else on this
 * site assumes the customer already arrived; this is the part that goes and
 * finds them.
 *
 * One source of truth, many channels: every export below is derived from the
 * same query, so a price change in the admin propagates everywhere on the next
 * fetch. The legacy site could not do this at all — its inventory was markup.
 */

export interface FeedVehicle {
  id: string;
  vin: string | null;
  chassisNo: string | null;
  stockNumber: string | null;
  title: string;
  description: string;
  link: string;
  images: string[];
  priceMajor: number;
  currency: string;
  condition: string;
  /** Google/Facebook vocabulary, not ours. */
  stateOfVehicle: "new" | "used" | "cpo";
  availability: "in stock" | "available for order" | "out of stock";
  make: string;
  model: string;
  trim: string | null;
  year: number;
  mileage: number | null;
  mileageUnit: string;
  bodyStyle: string | null;
  transmission: string | null;
  fuelType: string | null;
  drivetrain: string | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  dealerName: string;
  updatedAt: Date;
}

/**
 * The canonical origin for absolute URLs in feeds, sitemap and robots.
 *
 * Resolution order matters:
 *
 * 1. `NEXT_PUBLIC_SITE_URL` — an explicit override, for local development or
 *    when the canonical domain differs from the deployment.
 * 2. `VERCEL_PROJECT_PRODUCTION_URL` — set by Vercel to the project's
 *    production domain, and updated automatically when a custom domain is
 *    added. This means the feeds start pointing at adedayoaremuautos.com the
 *    moment the domain is attached, with no redeploy and nothing to remember.
 * 3. localhost, for a bare local run.
 *
 * This exists because a hand-set value was wrong the first time: the deployment
 * landed on `adedayoaremuautos-com.vercel.app` while the variable said
 * `adedayoaremuautos.vercel.app`, so every URL in every feed pointed at a
 * domain that does not resolve.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}

/**
 * Feeds must carry absolute image URLs.
 *
 * `mediaUrl()` returns site-relative paths for locally stored images, which is
 * correct in an <img> tag and fatal in a feed: Google and Meta reject every
 * item whose image cannot be resolved, and a feed of rejected items can get the
 * whole catalogue disabled. Supabase Storage URLs are already absolute and pass
 * through untouched.
 */
function absoluteImage(key: string): string {
  const url = mediaUrl(key);
  return /^https?:\/\//.test(url) ? url : `${siteUrl()}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** Map our market-specific condition vocabulary onto the ad platforms'. */
function stateOfVehicle(condition: string): FeedVehicle["stateOfVehicle"] {
  const c = condition.toLowerCase();
  if (c.includes("certified")) return "cpo";
  if (c.includes("new")) return "new";
  return "used";
}

/**
 * Vehicles eligible for syndication.
 *
 * Deliberately stricter than the on-site listing: ad platforms reject or
 * suspend feeds containing items without a price or image, and repeated
 * rejections can disable the whole account. Better to omit an incomplete
 * listing than to poison the feed.
 */
export async function getFeedVehicles(
  market: MarketCode,
): Promise<FeedVehicle[]> {
  const cfg = MARKETS[market];
  const base = siteUrl();

  const rows = await db
    .select()
    .from(vehicles)
    .where(
      and(
        eq(vehicles.marketCode, market),
        or(eq(vehicles.status, "available"), eq(vehicles.status, "pending")),
        isNotNull(vehicles.priceMinor),
      ),
    )
    .orderBy(desc(vehicles.updatedAt));

  if (rows.length === 0) return [];

  const media = await db
    .select()
    .from(vehicleMedia)
    .orderBy(desc(vehicleMedia.isPrimary), asc(vehicleMedia.position));

  const byVehicle = new Map<string, string[]>();
  for (const m of media) {
    const list = byVehicle.get(m.vehicleId) ?? [];
    list.push(absoluteImage(m.storageKey));
    byVehicle.set(m.vehicleId, list);
  }

  return rows
    .map((v): FeedVehicle | null => {
      const images = byVehicle.get(v.id) ?? [];
      // No image, no feed entry. Every major platform requires one.
      if (images.length === 0) return null;

      const title = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");

      return {
        id: v.stockNumber || v.vin || v.id,
        vin: v.vin,
        chassisNo: v.chassisNo,
        stockNumber: v.stockNumber,
        title,
        description:
          v.description?.trim() ||
          v.headline?.trim() ||
          `${v.condition} ${title} available at Adedayo Aremu Autos.`,
        link: `${base}/${market}/inventory/${v.slug}`,
        images: images.slice(0, 20),
        priceMajor: toMajor(money(v.priceMinor!, cfg.currency)),
        currency: cfg.currency,
        condition: v.condition,
        stateOfVehicle: stateOfVehicle(v.condition),
        availability: v.status === "available" ? "in stock" : "out of stock",
        make: v.make,
        model: v.model,
        trim: v.trim,
        year: v.year,
        mileage: v.mileage,
        mileageUnit: v.mileageUnit,
        bodyStyle: v.bodyStyle,
        transmission: v.transmission,
        fuelType: v.fuelType,
        drivetrain: v.drivetrain,
        exteriorColor: v.exteriorColor,
        interiorColor: v.interiorColor,
        dealerName: "Adedayo Aremu Autos",
        updatedAt: v.updatedAt,
      };
    })
    .filter((v): v is FeedVehicle => v !== null);
}

/* ── Serialisation helpers ─────────────────────────────────────────────── */

/** XML text escaping. Unescaped ampersands are the classic feed-breaker. */
export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * RFC 4180 CSV field. A vehicle description containing a comma, a quote or a
 * newline will silently corrupt column alignment for every row after it if
 * this is skipped.
 */
export function csvField(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvField).join(",");
}
