import { isMarketCode } from "@/lib/market";
import { getFeedVehicles, siteUrl, xmlEscape } from "@/lib/feeds/inventory";

export const dynamic = "force-dynamic";

/**
 * Google vehicle inventory feed (RSS 2.0 + Merchant `g:` namespace).
 *
 * Submitted in Google Merchant Center as a scheduled fetch of this URL, which
 * is what makes listings eligible for Vehicle Ads and the free vehicle listings
 * surface. Google pulls it on a schedule, so a price edited in the admin
 * propagates without anyone re-uploading a spreadsheet.
 *
 * The attribute set below covers Google's required and strongly-recommended
 * vehicle fields. Google revises this spec periodically — confirm against their
 * current vehicle-ads documentation before going live, and use Merchant
 * Center's feed diagnostics to catch rejections.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ market: string }> },
) {
  const { market } = await params;
  if (!isMarketCode(market)) {
    return new Response("Unknown market", { status: 404 });
  }

  const items = await getFeedVehicles(market);
  const base = siteUrl();

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Adedayo Aremu Autos — ${market.toUpperCase()} inventory</title>
    <link>${xmlEscape(`${base}/${market}/inventory`)}</link>
    <description>Vehicles available for sale.</description>
${items
  .map((v) => {
    const identifier = v.vin
      ? `      <g:vin>${xmlEscape(v.vin)}</g:vin>\n`
      : "";
    const mileage =
      v.mileage != null
        ? `      <g:mileage><g:value>${v.mileage}</g:value><g:unit>${
            v.mileageUnit === "mi" ? "MI" : "KM"
          }</g:unit></g:mileage>\n`
        : "";
    const optional = (tag: string, value: string | null) =>
      value ? `      <g:${tag}>${xmlEscape(value)}</g:${tag}>\n` : "";

    return `    <item>
      <g:id>${xmlEscape(v.id)}</g:id>
      <title>${xmlEscape(v.title)}</title>
      <description>${xmlEscape(v.description.slice(0, 5000))}</description>
      <link>${xmlEscape(v.link)}</link>
      <g:image_link>${xmlEscape(v.images[0])}</g:image_link>
${v.images
  .slice(1, 11)
  .map((img) => `      <g:additional_image_link>${xmlEscape(img)}</g:additional_image_link>`)
  .join("\n")}${v.images.length > 1 ? "\n" : ""}      <g:price>${v.priceMajor.toFixed(2)} ${v.currency}</g:price>
      <g:availability>${v.availability}</g:availability>
      <g:condition>${v.stateOfVehicle === "new" ? "new" : "used"}</g:condition>
      <g:brand>${xmlEscape(v.make)}</g:brand>
      <g:model>${xmlEscape(v.model)}</g:model>
      <g:year>${v.year}</g:year>
      <g:vehicle_fulfillment>
        <g:option>in_store</g:option>
      </g:vehicle_fulfillment>
${identifier}${mileage}${optional("trim", v.trim)}${optional("body_style", v.bodyStyle)}${optional(
      "transmission",
      v.transmission,
    )}${optional("fuel_type", v.fuelType)}${optional("drivetrain", v.drivetrain)}${optional(
      "color",
      v.exteriorColor,
    )}${optional("interior_color", v.interiorColor)}    </item>`;
  })
  .join("\n")}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Google fetches on a schedule; a short cache keeps the endpoint cheap
      // without letting a price edit go stale for long.
      "Cache-Control": "public, max-age=600, s-maxage=600",
      "X-Item-Count": String(items.length),
    },
  });
}
