import type { MetadataRoute } from "next";
import { MARKET_CODES, MARKETS } from "@/lib/market";
import { allListedSlugs } from "@/lib/repositories/vehicles";
import { siteUrl } from "@/lib/feeds/inventory";

export const dynamic = "force-dynamic";

/**
 * Sitemap covering both markets.
 *
 * `alternates.languages` emits hreflang, which tells Google the US and Nigeria
 * pages are regional variants rather than duplicate content. Without it, two
 * near-identical inventory pages compete with each other and Google picks one
 * — often the wrong one for the searcher's country.
 *
 * The legacy site had no sitemap at all.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  const staticEntries: MetadataRoute.Sitemap = MARKET_CODES.flatMap((code) => [
    {
      url: `${base}/${code}`,
      changeFrequency: "daily" as const,
      priority: 1,
      alternates: {
        languages: Object.fromEntries(
          MARKET_CODES.map((c) => [MARKETS[c].locale, `${base}/${c}`]),
        ),
      },
    },
    {
      url: `${base}/${code}/inventory`,
      changeFrequency: "hourly" as const,
      priority: 0.9,
      alternates: {
        languages: Object.fromEntries(
          MARKET_CODES.map((c) => [MARKETS[c].locale, `${base}/${c}/inventory`]),
        ),
      },
    },
    {
      url: `${base}/${code}/contact`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    },
  ]);

  const vehicleEntries = (
    await Promise.all(
      MARKET_CODES.map(async (code) => {
        const rows = await allListedSlugs(code);
        return rows.map((v) => ({
          url: `${base}/${code}/inventory/${v.slug}`,
          lastModified: v.updatedAt,
          changeFrequency: "daily" as const,
          priority: 0.8,
        }));
      }),
    )
  ).flat();

  return [...staticEntries, ...vehicleEntries];
}
