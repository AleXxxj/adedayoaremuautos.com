import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MARKETS, isMarketCode } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import { canResize } from "@/lib/photo";
import { siteUrl } from "@/lib/siteUrl";
import { CompareBoard, type BoardCar, type PickCar } from "@/components/compare/CompareBoard";
import {
  MIN_COMPARE,
  compareHref,
  compareRows,
  differenceLines,
  featuresOnlyOn,
  parseCarsParam,
  popularPairs,
  type CompareCar,
} from "@/components/compare/compareData";
import { loadCompareCars, withDetails } from "@/components/compare/loadCompareCars";
import "@/styles/guides.css";
import "@/styles/compare.css";

const TITLE = "Compare Used Cars Side by Side";

type Search = Promise<{ cars?: string | string[] }>;

/** The chosen cars still in stock, in the link's order, and how many were dropped. */
async function resolve(market: "us" | "ng", raw: string | string[] | undefined) {
  const { slugs, rejected } = parseCarsParam(raw);
  const all = await loadCompareCars(market);
  const found = slugs.flatMap((slug) => all.filter((c) => c.slug === slug));
  return { all, found, dropped: rejected + (slugs.length - found.length) };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ market: string }>;
  searchParams: Search;
}): Promise<Metadata> {
  const { market } = await params;
  if (!isMarketCode(market)) return {};
  const raw = (await searchParams).cars;
  const where = market === "us" ? "Greensboro, NC" : "Nigeria";

  // The bare page is the one to find in a search.
  if (raw == null) {
    const description = `Pick two or three cars in our stock in ${where} and see price, year, miles, engine and features side by side. Tap to choose. No typing.`;
    return {
      title: TITLE,
      description,
      alternates: {
        canonical: `/${market}/compare`,
        languages: { "en-US": "/us/compare", "en-NG": "/ng/compare" },
      },
      openGraph: { title: TITLE, description, url: `/${market}/compare`, type: "website" },
    };
  }

  // A link with cars in it is one of countless pairs: good to share, not to
  // index. Its links are still followed.
  const { found } = await resolve(market, raw);
  const names = found.map((c) => c.short);
  const title = found.length >= MIN_COMPARE ? `${names.join(" vs ")}: ${TITLE}` : TITLE;
  const description =
    found.length >= MIN_COMPARE
      ? `${names.join(" vs ")}: price, year, miles and more, side by side, from our stock in ${where}.`
      : `Pick two or three cars in our stock in ${where} and see them side by side.`;
  const photo = found.find((c) => c.image)?.image ?? null;
  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: {
      title,
      description,
      type: "website",
      ...(photo ? { images: [photo] } : {}),
    },
  };
}

/**
 * Compare two or three cars in stock, side by side.
 *
 * The address holds the choice and nothing else: `?cars=slug,slug[,slug]`.
 * Slugs only, never a VIN. A slug that is malformed, unknown or sold is
 * dropped and the page says a car was dropped, without repeating what the
 * link said.
 *
 * Everything in the table is worked out here, on the server, from the same
 * reads the sale and rental lists use (compareData.ts): the rows, which
 * value is the better one where "better" is a fact, and one line of plain
 * differences for each car. The page has no opinion about which car to buy.
 *
 * Read-only: nothing on this page writes anywhere.
 */
export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string }>;
  searchParams: Search;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();
  const market = MARKETS[code];
  const { all, found, dropped } = await resolve(code, (await searchParams).cars);

  const format = { currency: market.currency, locale: market.locale, distanceUnit: market.distanceUnit };
  const fmt = (minor: number) => formatMoney(money(minor, market.currency), market.locale);
  const chosen = await Promise.all(found.map((c) => withDetails(code, c)));
  const comparing = chosen.length >= MIN_COMPARE;
  const allRent = comparing && chosen.every((c) => c.rental);

  /** What a car costs, as its column head and its photo in the picker say it. */
  const priceOf = (c: CompareCar) =>
    c.forSale
      ? c.priceMinor != null
        ? fmt(c.priceMinor)
        : "Ask us"
      : c.rental!.weeklyMinor != null
        ? `${fmt(c.rental!.weeklyMinor)} a week`
        : `${fmt(c.rental!.dailyMinor)} a day`;

  const board: BoardCar[] = chosen.map((c) => ({
    slug: c.slug,
    name: c.name,
    short: c.short,
    image: c.image,
    price: priceOf(c),
    href: c.forSale ? `/${code}/inventory/${c.slug}` : `/${code}/rentals/${c.slug}`,
    // A car for sale: its page, at the interest form. A rental: its booking.
    next: c.forSale
      ? { label: "I'm interested", href: `/${code}/inventory/${c.slug}#interested` }
      : { label: "Pick dates", href: `/${code}/rentals/${c.slug}` },
    rentHref: c.forSale && allRent ? `/${code}/rentals/${c.slug}` : null,
  }));

  const picks: PickCar[] = all.map((c) => ({
    slug: c.slug,
    short: c.short,
    image: c.image,
    price: priceOf(c),
    sub:
      c.forSale && c.rental
        ? `or rent from ${
            c.rental.weeklyMinor != null ? `${fmt(c.rental.weeklyMinor)} a week` : `${fmt(c.rental.dailyMinor)} a day`
          }`
        : null,
    group: c.bodyGroup,
    rental: Boolean(c.rental),
  }));

  // One tap to a real pair: the same body type and the nearest prices.
  const pairs = popularPairs(all, 6).map(([a, b]) => {
    const gap = Math.abs(
      a.forSale && b.forSale ? a.priceMinor! - b.priceMinor! : a.rental!.weekCostMinor - b.rental!.weekCostMinor,
    );
    return {
      a,
      b,
      href: compareHref(code, [a.slug, b.slug]),
      note: [
        a.bodyGroup && a.bodyGroup === b.bodyGroup ? a.bodyGroup : null,
        gap === 0 ? "Same price" : `${fmt(gap)} apart${a.forSale && b.forSale ? "" : " a week"}`,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });

  const base = siteUrl();
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${base}/${code}` },
      { "@type": "ListItem", position: 2, name: "Compare", item: `${base}/${code}/compare` },
    ],
  };

  return (
    <div className="cmp-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }} />

      <div className="cmp-wrap">
        <header className="cmp-head-block">
          <p className="gd-eyebrow">Compare</p>
          {comparing ? (
            <h1 className="cmp-title cmp-title--pair">
              {chosen.map((c, i) => (
                <span key={c.slug}>
                  {i > 0 && <em>vs</em>}
                  {c.short}
                </span>
              ))}
            </h1>
          ) : (
            <>
              <h1 className="cmp-title">
                Compare cars <span>side by side</span>
              </h1>
              <p className="gd-lead">Pick 2 or 3 cars in stock. Tap their photos. No typing.</p>
            </>
          )}
        </header>

        {dropped > 0 && (
          <p className="cmp-dropped" role="status">
            <i className="fas fa-circle-info" aria-hidden="true" />
            {dropped === 1
              ? "One car in this link is no longer in stock, so it was left out."
              : `${dropped} cars in this link are no longer in stock, so they were left out.`}
          </p>
        )}

        <CompareBoard
          market={code}
          chosen={board}
          rows={comparing ? compareRows(chosen, format) : []}
          lines={comparing ? differenceLines(chosen, format) : []}
          features={comparing ? featuresOnlyOn(chosen) : null}
          cars={picks}
          recallsHref={code === "us" ? "/us/check" : null}
        />

        {pairs.length > 0 && (
          <section className="cmp-popular" aria-labelledby="cmp-popular-h">
            <h2 className="gd-h" id="cmp-popular-h">
              Popular comparisons
            </h2>
            <ul className="cmp-pairs">
              {pairs.map((p) => (
                <li key={p.href}>
                  <Link href={p.href} className="cmp-pair">
                    <span className="cmp-pair-photos" aria-hidden="true">
                      {[p.a, p.b].map((c) => (
                        <span key={c.slug} className="cmp-pair-photo">
                          {c.image && (
                            <Image src={c.image} alt="" fill sizes="64px" unoptimized={!canResize(c.image)} />
                          )}
                        </span>
                      ))}
                    </span>
                    <span className="cmp-pair-text">
                      <span className="cmp-pair-names">
                        {p.a.short} <em>vs</em> {p.b.short}
                      </span>
                      <span className="cmp-pair-note">{p.note}</span>
                    </span>
                    <i className="fas fa-chevron-right" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <nav className="cmp-also" aria-label="Related pages">
          <Link href={`/${code}/inventory`} className="cmp-textlink">
            All cars for sale
          </Link>
          <Link href={`/${code}/rentals`} className="cmp-textlink">
            All cars for rent
          </Link>
          {code === "us" && (
            <Link href="/us/guides" className="cmp-textlink">
              Guides
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}
