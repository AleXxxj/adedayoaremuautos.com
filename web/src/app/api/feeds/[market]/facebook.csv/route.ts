import { isMarketCode, MARKETS } from "@/lib/market";
import { getFeedVehicles, csvRow } from "@/lib/feeds/inventory";
import { listLocations } from "@/lib/repositories/locations";

export const dynamic = "force-dynamic";

/**
 * Facebook / Meta Automotive Inventory Ads catalogue.
 *
 * Added in Commerce Manager as a scheduled feed pointing at this URL. Drives
 * Marketplace vehicle listings and dynamic retargeting — someone who viewed a
 * GLE on the site can be shown that exact GLE on Facebook and Instagram.
 *
 * Column names follow Meta's automotive catalogue schema. Meta revises this
 * periodically; verify against their current spec and watch Commerce Manager's
 * diagnostics for rejected rows.
 */
const COLUMNS = [
  "vehicle_id",
  "title",
  "description",
  "url",
  "make",
  "model",
  "year",
  "mileage.value",
  "mileage.unit",
  "price",
  "exterior_color",
  "interior_color",
  "state_of_vehicle",
  "vin",
  "body_style",
  "drivetrain",
  "fuel_type",
  "transmission",
  "trim",
  "condition",
  "availability",
  "dealer_name",
  "address",
  "image[0].url",
  "image[1].url",
  "image[2].url",
] as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ market: string }> },
) {
  const { market } = await params;
  if (!isMarketCode(market)) {
    return new Response("Unknown market", { status: 404 });
  }

  const [items, sites] = await Promise.all([
    getFeedVehicles(market),
    listLocations(market),
  ]);

  const site = sites[0];
  // Meta expects a JSON-encoded address object in this column.
  const address = site
    ? JSON.stringify({
        addr1: site.addressLine1,
        city: site.city,
        region: site.region ?? "",
        postal_code: site.postalCode ?? "",
        country: site.country,
      })
    : "";

  const lines = [
    COLUMNS.join(","),
    ...items.map((v) =>
      csvRow([
        v.id,
        v.title,
        v.description.slice(0, 5000),
        v.link,
        v.make,
        v.model,
        v.year,
        v.mileage ?? "",
        v.mileage != null ? (v.mileageUnit === "mi" ? "MI" : "KM") : "",
        `${v.priceMajor.toFixed(2)} ${v.currency}`,
        v.exteriorColor ?? "",
        v.interiorColor ?? "",
        v.stateOfVehicle,
        v.vin ?? "",
        v.bodyStyle ?? "",
        v.drivetrain ?? "",
        v.fuelType ?? "",
        v.transmission ?? "",
        v.trim ?? "",
        v.condition,
        v.availability,
        v.dealerName,
        address,
        v.images[0] ?? "",
        v.images[1] ?? "",
        v.images[2] ?? "",
      ]),
    ),
  ];

  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `inline; filename="aaa-${market}-inventory.csv"`,
      "Cache-Control": "public, max-age=600, s-maxage=600",
      "X-Item-Count": String(items.length),
      "X-Market": MARKETS[market].name,
    },
  });
}
