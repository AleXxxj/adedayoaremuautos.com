import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode } from "@/lib/market";
import {
  inventoryFacets,
  listInventory,
  type InventoryFilters,
  type SortKey,
} from "@/lib/repositories/vehicles";
import { formatMoney, money, fromMajor } from "@/lib/money";
import { mediaUrl } from "@/lib/media";
import { ActiveFilters, type ActiveFilter } from "@/components/ActiveFilters";
import { ListToolbar } from "@/components/ListToolbar";
import { EmptyState } from "@/components/EmptyState";
import { CarCard } from "@/components/cars/CarCard";
import { BodyChips, ListHead } from "@/components/cars/ListChrome";
import { SavedCars, SavedCount } from "@/components/cars/Saved";
import { mailConfigured, priceAlertsEnabled } from "@/lib/alerts/rules";
import { priceCeilings, spread } from "@/components/home/homeData";
import {
  bodyCounts,
  bodyTypeOf,
  cardFor,
  isBodyKey,
  isJustIn,
  makeMatches,
  makeOptions,
  type BodyKey,
} from "@/components/cars/carData";
import "@/styles/cars.css";
import "@/styles/car-list.css";
import { GuideLinks } from "@/components/guides/GuideLinks";
import { refreshSaleHolds } from "@/lib/saleHolds/offer";

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

/** How many budgets the price menu offers. */
const BUDGETS = 5;

/** The filters a visitor can have in the address, besides the page number. */
const FILTER_KEYS = ["body", "make", "price", "year", "condition", "transmission", "q"] as const;

/**
 * The cars for sale.
 *
 * A short header, tap chips for body type, three menus, then one photo card
 * per car. Everything is in the address: `body`, `make`, `price` ("lo-hi" in
 * whole units), `year`, `condition`, `transmission`, `q`, `sort` and `page`
 * all still work from older links, and `saved=1` shows the cars this browser
 * has saved instead.
 *
 * Body type and make are worked out in code, not in the query: both are read
 * from text typed by hand (carData.ts), so the page reads every matching
 * car's make and body once, counts the chips from that, and asks the
 * database only for the cars that are left.
 */
export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();

  // End any deposit hold whose time is up before the list is read, so a car
  // doesn't keep saying "Sale pending" here until someone opens its own page.
  // Asks the database nothing while holds are switched off.
  await refreshSaleHolds();
  const market = MARKETS[code];

  const sp = await searchParams;
  const pick = (key: string) => (sp[key] && sp[key] !== "all" ? sp[key] : undefined);
  const sort = (SORTS.includes(sp.sort as SortKey) ? sp.sort : "newest") as SortKey;
  const page = Math.max(1, Number(sp.page) || 1);
  const showSaved = sp.saved === "1";
  const body: BodyKey | null = isBodyKey(sp.body) ? sp.body : null;
  const make = pick("make");

  // Price arrives as a "lo-hi" band in major units; convert once, here.
  let minPriceMinor: number | undefined;
  let maxPriceMinor: number | undefined;
  const price = pick("price");
  if (price) {
    const [lo, hi] = price.split("-").map(Number);
    if (Number.isFinite(lo)) minPriceMinor = fromMajor(lo, market.currency).minor;
    if (Number.isFinite(hi)) maxPriceMinor = fromMajor(hi, market.currency).minor;
  }
  const year = pick("year") ? Number(pick("year")) : undefined;

  // What the database filters on. Make and body type are applied below.
  const inQuery: InventoryFilters = {
    condition: pick("condition"),
    transmission: pick("transmission"),
    minPriceMinor,
    maxPriceMinor,
    minYear: year,
    maxYear: year,
    query: sp.q || undefined,
  };
  const queryNarrows = Object.values(inQuery).some((v) => v !== undefined);

  // Whether the visitor narrowed the list, and how much stock the market
  // holds regardless — the two facts the empty state needs to tell "nothing
  // matches" apart from "nothing yet".
  const [matching, everything] = await Promise.all([
    inventoryFacets(code, inQuery),
    queryNarrows ? inventoryFacets(code) : null,
  ]);
  const stock = everything ?? matching;
  const marketTotal = stock.length;

  /*
   * The price menu: round budgets that each have cars under them, worked out
   * from the cars for sale today by the same function as the home page's
   * "Up to $7,500" chips, and sent the same way (`price=0-7500`).
   *
   * It used to be five fixed bands ($15,000 to $25,000, and so on). With
   * every car on the lot under $15,000 the first band was the whole list and
   * the other four were empty.
   */
  const prices = stock.flatMap((car) => (car.priceMinor != null ? [car.priceMinor] : []));
  const fmtMajor = (major: number) =>
    formatMoney(fromMajor(major, market.currency), market.locale, { compact: major >= 1_000_000 });
  const bands = spread(priceCeilings(prices.map((minor) => minor / 100), false), BUDGETS).map(
    (c) => ({ value: `0-${c.major}`, label: `Up to ${fmtMajor(c.major)}` }),
  );

  const ofMake = make ? matching.filter((car) => makeMatches(car.make, make)) : matching;
  // The chips count what each would show with the other filters as they are.
  const types = bodyCounts(ofMake, body);
  const left = body ? ofMake.filter((car) => bodyTypeOf(car) === body) : ofMake;
  const hasFilters = FILTER_KEYS.some((key) => Boolean(sp[key]));

  // The saved list is drawn in the browser, which is where it is kept.
  const listed = showSaved
    ? null
    : await listInventory(code, {
        ...inQuery,
        ids: make || body ? left.map((car) => car.id) : undefined,
        sort,
        limit: PER_PAGE,
        offset: (page - 1) * PER_PAGE,
      });
  const vehicles = listed?.vehicles ?? [];
  const total = listed?.total ?? 0;

  // ── Addresses ───────────────────────────────────────────────────────────
  const path = `/${code}/inventory`;
  /** This list with some parameters changed; an empty value removes one. */
  const hrefWith = (changes: Record<string, string | null>, keep: readonly string[]) => {
    const next = new URLSearchParams();
    for (const key of keep) if (sp[key]) next.set(key, sp[key]!);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    return query ? `${path}?${query}` : path;
  };
  const kept = [...FILTER_KEYS, "sort"] as const;
  const pageHref = (n: number) => hrefWith({ page: n > 1 ? String(n) : null }, kept);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  // ── Chips for the filters in force ──────────────────────────────────────
  const priceLabel = () => {
    const band = bands.find((b) => b.value === price);
    if (band) return band.label;
    const [lo, hi] = (price ?? "").split("-").map(Number);
    if (!lo && Number.isFinite(hi) && hi > 0) return `Up to ${fmtMajor(hi)}`;
    if (Number.isFinite(lo) && Number.isFinite(hi) && hi > 0) return `${fmtMajor(lo)} to ${fmtMajor(hi)}`;
    return "Price";
  };
  // A price from an older link, or a budget typed on the home page, may not
  // be one the menu offers: it shows there by name, as chosen.
  const priceOptions =
    price && !bands.some((b) => b.value === price)
      ? [{ value: price, label: priceLabel() }, ...bands]
      : bands;
  const active: ActiveFilter[] = [
    make && { key: "make", label: make },
    price && { key: "price", label: priceLabel() },
    pick("year") && { key: "year", label: pick("year")! },
    pick("condition") && { key: "condition", label: pick("condition")! },
    pick("transmission") && { key: "transmission", label: pick("transmission")! },
    sp.q && { key: "q", label: `Search: ${sp.q}` },
  ]
    .filter((f): f is { key: string; label: string } => Boolean(f))
    .map((f) => ({ label: f.label, href: hrefWith({ [f.key]: null }, kept) }));

  // The header's one line: how many, and where the prices start. The title
  // already says "for sale", so the count does not say it again.
  const fromPrice = prices.length
    ? formatMoney(money(Math.min(...prices), market.currency), market.locale)
    : null;
  const count = showSaved ? (
    <SavedCount market={code} />
  ) : hasFilters ? (
    `${total} of ${marketTotal} ${marketTotal === 1 ? "car" : "cars"}`
  ) : (
    [`${total} ${total === 1 ? "car" : "cars"}`, total > 0 && fromPrice && `from ${fromPrice}`]
      .filter(Boolean)
      .join(" · ")
  );

  const now = new Date();

  return (
    <div className="cl-page">
      <div className="cl-wrap">
        <ListHead
          eyebrow={code === "us" ? "Greensboro, NC" : "Nigeria"}
          title="Cars for sale"
          count={count}
        />

        {/* Nothing to choose between until the market has stock: "no cars
            match" above a panel explaining the stock has not been uploaded
            yet says the same thing twice, and contradicts it. */}
        {marketTotal > 0 && (
          <>
            <BodyChips
              market={code}
              types={types}
              total={ofMake.length}
              chosen={body}
              saved={showSaved}
              hrefFor={(key) => hrefWith({ body: key }, kept)}
              savedHref={`${path}?saved=1`}
            />
            {!showSaved && (
              <>
                <ListToolbar
                  action={path}
                  selects={[
                    {
                      key: "make",
                      label: "Make",
                      anyLabel: "Any make",
                      options: makeOptions(stock).map((m) => ({ value: m, label: m })),
                    },
                    { key: "price", label: "Price", anyLabel: "Any price", options: priceOptions },
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
                  values={{ make, price, sort: sp.sort && sort !== "newest" ? sort : undefined, q: sp.q }}
                  carry={{
                    body: body ?? undefined,
                    year: pick("year"),
                    condition: pick("condition"),
                    transmission: pick("transmission"),
                  }}
                  search={{ placeholder: "Make or model" }}
                />
                <ActiveFilters filters={active} clearHref={path} />
              </>
            )}
          </>
        )}

        {showSaved ? (
          <SavedCars
            market={code}
            kind="sale"
            allHref={path}
            alerts={priceAlertsEnabled() ? { email: mailConfigured() } : undefined}
          />
        ) : vehicles.length === 0 ? (
          /* An empty filter and an empty market are different situations.
             Showing one message for both is what makes a page read broken:
             "no vehicles found" under no filters says the business has
             nothing, when it means the stock has not been uploaded yet. */
          hasFilters && marketTotal > 0 ? (
            <div className="cl-empty">
              <i className="fas fa-filter-circle-xmark" aria-hidden="true" />
              <h2>No cars match</h2>
              <p>
                {marketTotal} {marketTotal === 1 ? "car is" : "cars are"} for sale. Clear the
                filters to see {marketTotal === 1 ? "it" : "them all"}.
              </p>
              <Link href={path} className="cl-btn cl-btn--primary">
                Clear filters
              </Link>
              <Link href={`/${code}/contact`} className="cl-btn">
                Tell us what you want
              </Link>
            </div>
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
          /* One photo card per car on a phone, two across from 700px, three
             from 1100px. The whole card opens the car. */
          <ul className="cc-grid" id="cars">
            {vehicles.map((v, i) => (
              <CarCard
                key={v.id}
                market={code}
                heading="h2"
                eager={i === 0}
                card={cardFor(
                  {
                    slug: v.slug,
                    year: v.year,
                    make: v.make,
                    model: v.model,
                    trim: v.trim,
                    bodyStyle: v.bodyStyle,
                    mileage: v.mileage,
                    transmission: v.transmission,
                    fuelType: v.fuelType,
                    drivetrain: v.drivetrain,
                    seats: v.seats,
                    image: v.primaryImage ? mediaUrl(v.primaryImage) : null,
                    pending: v.status === "pending",
                    justIn: isJustIn(v.publishedAt, now),
                    sale: { priceMinor: v.priceMinor },
                    rent: null,
                  },
                  market,
                  "sale",
                )}
              />
            ))}
          </ul>
        )}

        {!showSaved && pages > 1 && (
          <nav className="cl-pages" aria-label="Pages">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="cl-page-link" aria-label="Previous page">
                <i className="fas fa-chevron-left" aria-hidden="true" />
              </Link>
            )}
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={pageHref(n)}
                className="cl-page-link"
                aria-label={`Page ${n}`}
                aria-current={n === page ? "page" : undefined}
              >
                {n}
              </Link>
            ))}
            {page < pages && (
              <Link href={pageHref(page + 1)} className="cl-page-link" aria-label="Next page">
                <i className="fas fa-chevron-right" aria-hidden="true" />
              </Link>
            )}
          </nav>
        )}
      </div>
      <GuideLinks market={code} slugs={["guess-the-price-game", "which-car-fits-your-life-quiz"]} compare />
    </div>
  );
}
