import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { MARKETS, isMarketCode, formatDistance } from "@/lib/market";
import { listInventory, filterOptions, type SortKey } from "@/lib/repositories/vehicles";
import { formatMoney, money, fromMajor } from "@/lib/money";
import { mediaUrl } from "@/lib/media";
import { ActiveFilters } from "@/components/ActiveFilters";
import { ListToolbar } from "@/components/ListToolbar";
import { CarRow } from "@/components/CarRow";
import "@/styles/car-list.css";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  return {
    title: "Cars for Sale",
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

  // Whether the visitor narrowed the search, and how much stock the market
  // holds regardless of it — the two facts the empty state needs to tell
  // "nothing matches" apart from "nothing yet".
  const hasFilters = ["make", "year", "price", "condition", "transmission", "fuel", "q"].some(
    (k) => Boolean(sp[k as keyof typeof sp]),
  );
  const marketTotal = hasFilters
    ? (await listInventory(code, { limit: 1 })).total
    : total;

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

      <div className="featured featured--list">
        <div className="featured-container">
          {/* Count, filters and sort in one row; the filters fold behind a
              button. A count only when there is something to count: "no
              vehicles match" above a panel explaining the market has no stock
              yet says the same thing twice, and contradicts it. */}
          {marketTotal > 0 && (
            <Suspense fallback={null}>
              <ListToolbar
                // The total; the page numbers are under the list.
                count={total === 0 ? "No matches" : `${total} car${total === 1 ? "" : "s"}`}
                resetPage
                filters={[
                  { key: "make", label: "Make", anyLabel: "Any make", options: options.makes.map((m) => ({ value: m, label: m })) },
                  { key: "year", label: "Year", anyLabel: "Any year", options: options.years.map((y) => ({ value: String(y), label: String(y) })) },
                  { key: "price", label: "Price", anyLabel: "Any price", options: priceBands(market) },
                  { key: "condition", label: "Condition", anyLabel: "Any", options: market.conditions.map((c) => ({ value: c, label: c })) },
                  { key: "transmission", label: "Transmission", anyLabel: "Any", options: options.transmissions.map((t) => ({ value: t, label: t })) },
                ]}
                sort={{
                  defaultValue: "newest",
                  options: [
                    { value: "newest", label: "Newest" },
                    { value: "price_asc", label: "Lowest price" },
                    { value: "price_desc", label: "Highest price" },
                    { value: "year_desc", label: "Newest year" },
                    { value: "mileage_asc", label: "Lowest miles" },
                  ],
                }}
              />
            </Suspense>
          )}
          <Suspense fallback={null}>
            <ActiveFilters />
          </Suspense>

          {vehicles.length === 0 ? (
            /* An empty filter and an empty market are different situations.
               Showing one message for both is what makes a page read broken:
               "no vehicles found" under no filters says the business has
               nothing, when it means the stock has not been uploaded yet. */
            hasFilters ? (
              <EmptyState
                icon="fas fa-filter-circle-xmark"
                title="Nothing matches those filters"
                body={`There ${marketTotal === 1 ? "is" : "are"} ${marketTotal} vehicle${marketTotal === 1 ? "" : "s"} available in ${market.name}. Widen the search, or tell us what you are after and we will source it.`}
                actions={[
                  { href: `/${code}/inventory`, label: "Clear filters", icon: "fas fa-rotate-left", primary: true },
                  { href: `/${code}/contact`, label: "Tell us what you want", icon: "fas fa-paper-plane" },
                ]}
              />
            ) : (
              <EmptyState
                icon="fas fa-warehouse"
                eyebrow={`${market.name} showroom`}
                title="Stock is being prepared"
                body="Vehicles for this market are being inspected and photographed before they go on the site. Tell us what you are looking for and we will come to you first when it lands."
                points={[
                  "Every vehicle inspected before it is listed",
                  "Photographs and full specification on each listing",
                  "Financing and rentals arranged in-house",
                ]}
                actions={[
                  { href: `/${code}/contact`, label: "Tell us what you want", icon: "fas fa-paper-plane", primary: true },
                  { href: `/${code}/financing`, label: "See financing terms", icon: "fas fa-hand-holding-dollar" },
                ]}
              />
            )
          ) : (
            /* One row per car on a phone, a grid on a wider screen; the whole
               row opens the car, where the full details and "Inquire" are. */
            <ul className="cl-list">
              {vehicles.map((v, i) => (
                <CarRow
                  key={v.id}
                  href={`/${code}/inventory/${v.slug}`}
                  image={v.primaryImage ? mediaUrl(v.primaryImage) : null}
                  preload={i === 0}
                  title={[v.year, v.make, v.model, v.trim].filter(Boolean).join(" ")}
                  price={
                    v.priceMinor != null
                      ? formatMoney(money(v.priceMinor, market.currency), market.locale)
                      : "Price on request"
                  }
                  details={[v.mileage != null && formatDistance(v.mileage, market), v.transmission]}
                  badge={v.condition}
                />
              ))}
            </ul>
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
