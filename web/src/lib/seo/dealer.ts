import "server-only";
import { listLocations, type OpeningHour } from "@/lib/repositories/locations";
import { socialLinks, CONTACT_EMAIL } from "@/lib/contact";
import { MARKETS, type MarketCode } from "@/lib/market";
import { siteUrl } from "@/lib/siteUrl";

/**
 * The business, described in the vocabulary search engines actually read.
 *
 * A person searching "Aremu Autos" is not searching for a page, they are
 * searching for a company, and a search engine can only connect the two if
 * something on the site says "this company is called that". Prose in a hero
 * banner does not say it; this does.
 *
 * One builder, used by every page that describes the business, because two
 * hand-written copies of an organisation's identity drift — and a name or
 * phone number that disagrees between pages is worse than one stated once.
 * The stable `@id` is what makes several pages describe a single entity
 * instead of several similar ones.
 */

/** schema.org spells the days out; the stored `day` is 1 = Monday. */
const DAY_OF_WEEK = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/**
 * The name really is written several ways.
 *
 * People search for the founder's first name, his surname, and every pairing
 * of either with "Autos". These are the forms the business is actually known
 * by — not keyword padding, which is why the list is short and each entry is
 * a name a real customer would type.
 */
const ALSO_KNOWN_AS = [
  "Adedayo Aremu",
  "Aremu Autos",
  "Adedayo Autos",
  "Adedayo Aremu Auto",
  "AAA Autos",
];

export async function dealerJsonLd(market: MarketCode) {
  const base = siteUrl();
  const sites = await listLocations(market);
  const site = sites[0];
  const cfg = MARKETS[market];
  const socials = socialLinks(market).map((s) => s.url);

  const hours = (site?.hours as OpeningHour[] | null) ?? [];

  return {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    // Per market: the two showrooms are genuinely different places with
    // different addresses and hours, and merging them would publish an
    // address in Greensboro under Nigerian opening times.
    "@id": `${base}/${market}#dealer`,
    name: "Adedayo Aremu Autos",
    alternateName: ALSO_KNOWN_AS,
    url: `${base}/${market}`,
    logo: `${base}/icon.svg`,
    image: `${base}/icon.svg`,
    email: CONTACT_EMAIL,
    description:
      "Vehicle sales, rentals, rent-to-own and financing from Adedayo Aremu Autos.",
    priceRange: "$$",
    areaServed:
      market === "us"
        ? { "@type": "AdministrativeArea", name: "Greensboro, North Carolina" }
        : { "@type": "Country", name: "Nigeria" },
    currenciesAccepted: cfg.currency,
    ...(socials.length > 0 ? { sameAs: socials } : {}),
    ...(site
      ? {
          ...(site.phone ? { telephone: site.phone } : {}),
          address: {
            "@type": "PostalAddress",
            streetAddress: [site.addressLine1, site.addressLine2]
              .filter(Boolean)
              .join(", "),
            addressLocality: site.city,
            ...(site.region ? { addressRegion: site.region } : {}),
            ...(site.postalCode ? { postalCode: site.postalCode } : {}),
            addressCountry: site.country,
          },
          // Only when both coordinates are present and parse as numbers — a
          // geo point with a NaN in it invalidates the whole block.
          ...(geoOf(site.latitude, site.longitude) ?? {}),
          ...(hours.length > 0
            ? {
                openingHoursSpecification: hours
                  .filter((h) => DAY_OF_WEEK[h.day])
                  .map((h) => ({
                    "@type": "OpeningHoursSpecification",
                    dayOfWeek: DAY_OF_WEEK[h.day],
                    opens: h.open,
                    closes: h.close,
                  })),
              }
            : {}),
        }
      : {}),
  };
}

function geoOf(lat: string | null, lng: string | null) {
  if (!lat || !lng) return null;
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { geo: { "@type": "GeoCoordinates", latitude, longitude } };
}

/**
 * The site itself, as distinct from the business that runs it.
 *
 * Small, but it is the node that carries the name a search engine prints
 * above a set of sitelinks.
 */
export function websiteJsonLd(market: MarketCode) {
  const base = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${base}#website`,
    url: `${base}/${market}`,
    name: "Adedayo Aremu Autos",
    alternateName: ALSO_KNOWN_AS,
    publisher: { "@id": `${base}/${market}#dealer` },
  };
}
