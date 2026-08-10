import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { MARKETS, isMarketCode, formatDistance } from "@/lib/market";
import { listInventory, filterOptions, type SortKey } from "@/lib/repositories/vehicles";
import { formatMoney, money, fromMajor } from "@/lib/money";
import { mediaUrl } from "@/lib/media";
import { LegacyFilters, ActiveFilters } from "@/components/LegacyFilters";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  return {
    title: "Cars for Sale — Adedayo Aremu Autos",
    description:
      market === "us"
        ? "Browse inspected vehicles for sale in Greensboro, North Carolina."
        : "Browse our collection of premium, verified vehicles for sale in Nigeria.",
    alternates: {
      canonical: `/${market}/inventory`,
      languages: { "en-US": "/us/inventory", "en-NG": "/ng/inventory" },
    },
  };
}

const PER_PAGE = 12;
const SORTS: SortKey[] = ["newest", "price_asc", "price_desc", "year_desc", "mileage_asc"];

/** Price bands in each market's own money — not one list converted. */
function priceBands(market: (typeof MARKETS)[keyof typeof MARKETS]) {
  const raw =
    market.currency === "NGN"
      ? [
          { label: "Under ₦10M", lo: 0, hi: 10_000_000 },
          { label: "₦10M – ₦15M", lo: 10_000_000, hi: 15_000_000 },
          { label: "₦15M – ₦20M", lo: 15_000_000, hi: 20_000_000 },
          { label: "₦20M – ₦30M", lo: 20_000_000, hi: 30_000_000 },
          { label: "Above ₦30M", lo: 30_000_000, hi: 999_999_999 },
        ]
      : [
          { label: "Under $15,000", lo: 0, hi: 15_000 },
          { label: "$15,000 – $25,000", lo: 15_000, hi: 25_000 },
          { label: "$25,000 – $40,000", lo: 25_000, hi: 40_000 },
          { label: "$40,000 – $60,000", lo: 40_000, hi: 60_000 },
          { label: "Above $60,000", lo: 60_000, hi: 9_999_999 },
        ];
  return raw.map((b) => ({ label: b.label, value: `${b.lo}-${b.hi}` }));
}

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();
  const market = MARKETS[code];

  const sp = await searchParams;
  const sort = (SORTS.includes(sp.sort as SortKey) ? sp.sort : "newest") as SortKey;
  const page = Math.max(1, Number(sp.page) || 1);

  // Price arrives as a "lo-hi" band in major units; convert once, here.
  let minPriceMinor: number | undefined;
  let maxPriceMinor: number | undefined;
  if (sp.price && sp.price !== "all") {
    const [lo, hi] = sp.price.split("-").map(Number);
    if (Number.isFinite(lo)) minPriceMinor = fromMajor(lo, market.currency).minor;
    if (Number.isFinite(hi)) maxPriceMinor = fromMajor(hi, market.currency).minor;
  }
  const year = sp.year && sp.year !== "all" ? Number(sp.year) : undefined;

  const [{ vehicles, total }, options] = await Promise.all([
    listInventory(code, {
      make: sp.make && sp.make !== "all" ? sp.make : undefined,
      condition: sp.condition && sp.condition !== "all" ? sp.condition : undefined,
      transmission: sp.transmission && sp.transmission !== "all" ? sp.transmission : undefined,
      minPriceMinor,
      maxPriceMinor,
      minYear: year,
      maxYear: year,
      query: sp.q,
      sort,
      limit: PER_PAGE,
      offset: (page - 1) * PER_PAGE,
    }),
    filterOptions(code),
  ]);

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const pageHref = (n: number) => {
    const next = new URLSearchParams(
      Object.entries(sp).filter(([, v]) => v) as [string, string][],
    );
    next.set("page", String(n));
    return `/${code}/inventory?${next.toString()}`;
  };

  return (
    <>
      <div className="page-header page-header--inventory">
        <h1>
          Cars for <span>Sale</span>
        </h1>
        <p>
          {code === "us"
            ? "Browse our inspected vehicles, available in Greensboro"
            : "Browse our collection of premium, verified vehicles"}
        </p>
      </div>

      <Suspense fallback={null}>
        <LegacyFilters
          options={{
            makes: options.makes,
            years: options.years,
            conditions: market.conditions,
            transmissions: options.transmissions,
            fuels: options.fuels,
            priceBands: priceBands(market),
          }}
        />
      </Suspense>

      <div className="featured">
        <div className="featured-container">
          <Suspense fallback={null}>
            <ActiveFilters />
          </Suspense>

          <div className="results-count">
            {total === 0
              ? "No vehicles match"
              : `Showing ${(page - 1) * PER_PAGE + 1}–${Math.min(page * PER_PAGE, total)} of ${total} vehicle${total === 1 ? "" : "s"}`}
          </div>

          {vehicles.length === 0 ? (
            <div className="no-results">
              <i className="fas fa-car" />
              <h3>No vehicles found</h3>
              <p>
                Try widening your filters — or tell us what you are looking for
                and we will source it.
              </p>
              <Link href={`/${code}/contact`} className="btn btn-primary">
                <i className="fas fa-paper-plane" /> Tell us what you want
              </Link>
            </div>
          ) : (
            <div className="cars-grid">
              {vehicles.map((v) => {
                const name = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
                return (
                  <div className="car-card" key={v.id}>
                    <div className="car-image">
                      {v.primaryImage ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={mediaUrl(v.primaryImage)} alt={name} loading="lazy" />
                      ) : (
                        <div className="car-image-placeholder">Photography coming soon</div>
                      )}
                      <span className="car-badge">{v.condition}</span>
                    </div>
                    <div className="car-details">
                      <h3 className="car-title">{name}</h3>
                      <div className="car-specs">
                        <span>
                          <i className="fas fa-calendar" /> {v.year}
                        </span>
                        {v.mileage != null && (
                          <span>
                            <i className="fas fa-tachometer-alt" />{" "}
                            {formatDistance(v.mileage, market)}
                          </span>
                        )}
                        {v.transmission && (
                          <span>
                            <i className="fas fa-cog" /> {v.transmission}
                          </span>
                        )}
                      </div>
                      <div className="car-price">
                        {v.priceMinor != null
                          ? formatMoney(money(v.priceMinor, market.currency), market.locale)
                          : "Price on request"}
                      </div>
                      <div className="car-actions">
                        <Link href={`/${code}/inventory/${v.slug}`} className="btn btn-primary">
                          View
                        </Link>
                        <Link
                          href={`/${code}/contact?vehicle=${v.slug}`}
                          className="btn btn-outline"
                        >
                          <i className="fas fa-envelope" /> Enquire
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {pages > 1 && (
            <div className="pagination">
              {page > 1 && (
                <Link href={pageHref(page - 1)} className="page-link">
                  <i className="fas fa-chevron-left" />
                </Link>
              )}
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <Link
                  key={n}
                  href={pageHref(n)}
                  className={`page-link${n === page ? " active" : ""}`}
                  aria-current={n === page ? "page" : undefined}
                >
                  {n}
                </Link>
              ))}
              {page < pages && (
                <Link href={pageHref(page + 1)} className="page-link">
                  <i className="fas fa-chevron-right" />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
