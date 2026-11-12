import { NextResponse, type NextRequest } from "next/server";
import { isMarketCode } from "@/lib/market";
import { publicCarsBySlug } from "@/lib/repositories/vehicles";
import { parseSlugList } from "@/components/cars/carData";

/**
 * Listed cars by slug: what a browser needs to draw the cars it has saved
 * or looked at.
 *
 *   GET /api/cars?market=us&slugs=2013-hyundai-sonata,2007-toyota-camry
 *
 * Saved and recently viewed cars are kept in the visitor's own browser, as
 * slugs and nothing else. This turns up to twelve of them back into cards.
 * It reads and never writes; it takes no cookie and knows nobody; and it
 * sends only what a card prints for a car the public lists already show
 * (PublicCar, components/cars/carData.ts): no VIN, no stock number, nothing
 * about a car that is sold or unlisted.
 *
 * The answer depends on the address alone, so any cache may keep it for a
 * minute: a price changed in the admin shows on a saved card within that.
 */
export const dynamic = "force-dynamic";

const CACHE = "public, max-age=60, s-maxage=60";

function refuse(error: string) {
  return NextResponse.json({ error }, { status: 400, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const market = params.get("market");
  if (!market || !isMarketCode(market)) return refuse("Unknown market.");

  const slugs = parseSlugList(params.get("slugs"));
  if (!slugs) return refuse("Send one to twelve car slugs, separated by commas.");

  const cars = await publicCarsBySlug(market, slugs, new Date());
  return NextResponse.json({ cars }, { headers: { "Cache-Control": CACHE } });
}
