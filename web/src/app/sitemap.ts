import type { MetadataRoute } from "next";
import { MARKET_CODES, MARKETS } from "@/lib/market";
import { allListedSlugs } from "@/lib/repositories/vehicles";
import { siteUrl } from "@/lib/feeds/inventory";
import { GUIDES } from "@/content/guides";

export const dynamic = "force-dynamic";

const SECTIONS: {
  path: string;
  changeFrequency: "daily" | "weekly" | "monthly";
  priority: number;
  only?: (typeof MARKET_CODES)[number];
  /** When the page's words last changed, where that is known. */
  lastModified?: string;
}[] = [
  { path: "rentals", changeFrequency: "daily", priority: 0.9 },
  { path: "sell", changeFrequency: "monthly", priority: 0.7 },
  { path: "rent-to-own", changeFrequency: "weekly", priority: 0.7 },
  { path: "financing", changeFrequency: "monthly", priority: 0.6 },
  { path: "check", changeFrequency: "monthly", priority: 0.6, only: "us" },
  { path: "referral", changeFrequency: "monthly", priority: 0.5 },
  { path: "about", changeFrequency: "monthly", priority: 0.5 },
  // The bare compare page only. A link with cars in it (?cars=a,b) is one of
  // countless pairs and is marked noindex.
  { path: "compare", changeFrequency: "daily", priority: 0.5 },
  // The guides are written for Greensboro and exist on the US site only.
  // Their numbers are today's stock, so they change as often as the lists.
  { path: "guides", changeFrequency: "daily", priority: 0.7, only: "us" },
  ...GUIDES.map((g) => ({
    path: `guides/${g.meta.slug}`,
    changeFrequency: "daily" as const,
    priority: 0.8,
    only: "us" as const,
    lastModified: g.meta.updated,
  })),
];

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
    // The section pages. Rentals is the US site's main business and was not
    // listed at all. The car check and the guides exist only in the United
    // States; every other page exists in both markets.
    ...SECTIONS.filter((s) => !s.only || s.only === code).map((s) => ({
      url: `${base}/${code}/${s.path}`,
      changeFrequency: s.changeFrequency,
      priority: s.priority,
      ...(s.lastModified ? { lastModified: s.lastModified } : {}),
      ...(s.only
        ? {}
        : {
            alternates: {
              languages: Object.fromEntries(
                MARKET_CODES.map((c) => [MARKETS[c].locale, `${base}/${c}/${s.path}`]),
              ),
            },
          }),
    })),
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
