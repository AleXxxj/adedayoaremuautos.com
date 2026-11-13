import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode, type MarketConfig } from "@/lib/market";
import {
  listFleet,
  byWeekCost,
  fromPrices,
  type FleetVehicle,
} from "@/lib/repositories/rentals";
import { formatMoney, money, toMajor } from "@/lib/money";
import { ActiveFilters, type ActiveFilter } from "@/components/ActiveFilters";
import { ListToolbar } from "@/components/ListToolbar";
import { CarCard } from "@/components/cars/CarCard";
import { BodyChips, ListHead } from "@/components/cars/ListChrome";
import { SavedCars, SavedCount } from "@/components/cars/Saved";
import {
  bodyCounts,
  bodyTypeOf,
  cardFor,
  isBodyKey,
  makeMatches,
  makeOptions,
  parseBand,
  priceCuts,
  type BodyKey,
} from "@/components/cars/carData";
import "@/styles/cars.css";
import "@/styles/car-list.css";
import "@/styles/rentals.css";
import { GuideLinks } from "@/components/guides/GuideLinks";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  return {
    title: "Car Rentals",
    description:
      market === "us"
        ? "Daily, weekly and monthly car rental in Greensboro, North Carolina."
        : "Daily, weekly and monthly car rental in Nigeria, with or without a driver.",
    alternates: {
      canonical: `/${market}/rentals`,
      languages: { "en-US": "/us/rentals", "en-NG": "/ng/rentals" },
    },
  };
}

/** How a band on the daily rate reads, its ends in minor units: "$180 – $290 a day". */
function bandLabel(market: MarketConfig, lo: number, hi: number | null) {
  const fmt = (minor: number) =>
    formatMoney(money(minor, market.currency), market.locale, { compact: true });
  if (hi == null) return `Above ${fmt(lo)} a day`;
  return lo > 0 ? `${fmt(lo)} – ${fmt(hi)} a day` : `Under ${fmt(hi)} a day`;
}

/**
 * Price bands on the daily rate, in minor units.
 *
 * Up to three bands across the actual range, cut at round figures, so every
 * band has something in it — the original's fixed ₦30k/₦50k/₦80k steps were
 * empty or all-inclusive depending on what happened to be in the fleet.
 */
function priceBands(market: MarketConfig, fleet: FleetVehicle[]) {
  const cuts = priceCuts(fleet.map((v) => v.tariff.dailyMinor));
  if (cuts.length === 0) return [];
  return [0, ...cuts].map((lo, i) => {
    const hi = cuts[i] ?? null;
    return { label: bandLabel(market, lo, hi), value: `${lo}-${hi ?? ""}` };
  });
}

const SORTS = ["price-low", "price-high", "name"] as const;
const FILTER_KEYS = ["type", "make", "price", "duration", "transmission"] as const;

/**
 * The cars to rent.
 *
 * The same shape as the sale list: a short header, tap chips for body type,
 * menus for make, price and sort, then one photo card per car, leading with
 * what a week costs. `type`, `make`, `price` (a band on the daily rate, in
 * minor units), `duration`, `transmission` and `sort` are all in the
 * address, and `saved=1` shows the cars this browser has saved.
 */
export default async function RentalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();
  const market = MARKETS[code];
  const q = await searchParams;

  const all = await listFleet(code);
  const fmt = (minor: number) => formatMoney(money(minor, market.currency), market.locale);
  const bands = priceBands(market, all);
  const showSaved = q.saved === "1";

  // A chip sends a body type ("suv"). An older link sent the body style as it
  // was typed ("Suv"): read as a type when it is one, matched exactly if not.
  const body: BodyKey | null = isBodyKey(q.type)
    ? q.type
    : q.type
      ? bodyTypeOf({ bodyStyle: q.type })
      : null;
  const typedBody = q.type && !body ? q.type : null;
  const sort = SORTS.find((s) => s === q.sort) ?? "price-low";

  // Filtering in the route rather than the browser: the whole fleet is already
  // loaded here, and doing it server-side keeps every filtered view a real URL.
  let others = all;
  if (q.make) others = others.filter((v) => makeMatches(v.make, q.make!));
  if (q.transmission) others = others.filter((v) => v.transmission === q.transmission);
  if (q.duration === "weekly") others = others.filter((v) => v.tariff.weeklyMinor != null);
  if (q.duration === "monthly") others = others.filter((v) => v.tariff.monthlyMinor != null);
  if (q.price) {
    const [lo, hi] = q.price.split("-");
    const min = Number(lo) || 0;
    const max = hi ? Number(hi) : Infinity;
    others = others.filter((v) => v.tariff.dailyMinor >= min && v.tariff.dailyMinor <= max);
  }
  // The chips count what each would show with the other filters as they are.
  const types = bodyCounts(others, body);
  let fleet = others;
  if (body) fleet = fleet.filter((v) => bodyTypeOf(v) === body);
  if (typedBody) fleet = fleet.filter((v) => v.bodyStyle === typedBody);

  const name = (v: FleetVehicle) =>
    [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");

  // Sorted on what a week costs, the price each card leads with (weekCost).
  fleet = [...fleet].sort((a, b) => {
    switch (sort) {
      case "price-high":
        return byWeekCost(b, a);
      case "name":
        return name(a).localeCompare(name(b));
      case "price-low":
      default:
        return byWeekCost(a, b);
    }
  });

  // From the whole fleet, not the filtered list: where the prices start.
  const { fromDaily, fromWeekly } = fromPrices(all);

  const deposits = all.map((v) => v.tariff.depositMinor).filter((d) => d > 0);
  const minDays = all.length ? Math.min(...all.map((v) => v.tariff.minDays)) : null;
  const driverAvailable = all.some((v) => v.tariff.withDriverAvailable);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AutoRental",
    name: "Adedayo Aremu Autos",
    areaServed: market.name,
    ...(fromDaily != null
      ? {
          makesOffer: {
            "@type": "Offer",
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: toMajor(money(fromDaily, market.currency)),
              priceCurrency: market.currency,
              unitCode: "DAY",
            },
          },
        }
      : {}),
  };

  // ── Addresses ───────────────────────────────────────────────────────────
  const path = `/${code}/rentals`;
  const kept = [...FILTER_KEYS, "sort"] as const;
  /** This list with some parameters changed; null removes one. */
  const hrefWith = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const key of kept) if (q[key]) next.set(key, q[key]!);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    return query ? `${path}?${query}` : path;
  };

  const hasFilters = FILTER_KEYS.some((key) => Boolean(q[key]));
  // A price from an older link may not be one of today's bands: it still
  // filters, so it is named from its own two ends.
  const chosenBand = parseBand(q.price);
  const priceText =
    bands.find((b) => b.value === q.price)?.label ??
    (chosenBand ? bandLabel(market, chosenBand.lo, chosenBand.hi) : "Price");
  const priceOptions =
    q.price && !bands.some((b) => b.value === q.price)
      ? [{ value: q.price, label: priceText }, ...bands]
      : bands;
  const active: ActiveFilter[] = [
    q.make && { key: "make", label: q.make },
    q.price && { key: "price", label: priceText },
    q.duration === "weekly" && { key: "duration", label: "By the week" },
    q.duration === "monthly" && { key: "duration", label: "By the month" },
    q.transmission && { key: "transmission", label: q.transmission },
    typedBody && { key: "type", label: typedBody },
  ]
    .filter((f): f is { key: string; label: string } => Boolean(f))
    .map((f) => ({ label: f.label, href: hrefWith({ [f.key]: null }) }));

  // The header's one line: how many, and where a week starts (a day, where
  // no car has a weekly rate). Each card shows its own prices.
  const fromLine =
    fromWeekly != null
      ? `from ${fmt(fromWeekly)} a week`
      : fromDaily != null
        ? `from ${fmt(fromDaily)} a day`
        : null;
  const count = showSaved ? (
    <SavedCount market={code} />
  ) : hasFilters ? (
    `${fleet.length} of ${all.length} ${all.length === 1 ? "car" : "cars"}`
  ) : (
    [`${all.length} ${all.length === 1 ? "car" : "cars"}`, all.length > 0 && fromLine]
      .filter(Boolean)
      .join(" · ")
  );

  return (
    <div className="cl-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="cl-wrap">
        <ListHead
          eyebrow={code === "us" ? "Greensboro, NC" : "Nigeria"}
          title="Rent a car"
          count={count}
        />

        {all.length > 0 && (
          <>
            <BodyChips
              market={code}
              types={types}
              total={others.length}
              chosen={body}
              saved={showSaved}
              hrefFor={(key) => hrefWith({ type: key })}
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
                      options: makeOptions(all).map((m) => ({ value: m, label: m })),
                    },
                    { key: "price", label: "Price a day", anyLabel: "Any price", options: priceOptions },
                  ]}
                  sort={{
                    defaultValue: "price-low",
                    options: [
                      { value: "price-low", label: "Lowest price" },
                      { value: "price-high", label: "Highest price" },
                      { value: "name", label: "Name" },
                    ],
                  }}
                  values={{
                    make: q.make,
                    price: q.price,
                    sort: sort !== "price-low" ? sort : undefined,
                  }}
                  carry={{
                    type: q.type,
                    duration: q.duration,
                    transmission: q.transmission,
                  }}
                />
                <ActiveFilters filters={active} clearHref={path} />
              </>
            )}
          </>
        )}

        {showSaved ? (
          <SavedCars market={code} kind="rent" allHref={path} />
        ) : fleet.length === 0 ? (
          all.length === 0 ? (
            <div className="cl-empty">
              <i className="fas fa-key" aria-hidden="true" />
              <h2>No cars to rent right now</h2>
              <p>Tell us what you need and for how long. We will tell you what we can arrange.</p>
              <Link href={`/${code}/contact?type=rental`} className="cl-btn cl-btn--primary">
                Ask about a rental
              </Link>
            </div>
          ) : (
            <div className="cl-empty">
              <i className="fas fa-filter-circle-xmark" aria-hidden="true" />
              <h2>No cars match</h2>
              <p>
                {all.length} {all.length === 1 ? "car is" : "cars are"} ready to rent. Clear the
                filters to see {all.length === 1 ? "it" : "them all"}.
              </p>
              <Link href={path} className="cl-btn cl-btn--primary">
                Clear filters
              </Link>
            </div>
          )
        ) : (
          /* One photo card per car on a phone, two across from 700px, three
             from 1100px. The whole card is the link, and it leads with the
             weekly price: most renters here rent by the week. The deposit,
             every rate and the open dates are on the car's own page. */
          <ul className="cc-grid" id="rental-cars">
            {fleet.map((v, i) => (
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
                    mileage: null,
                    transmission: v.transmission,
                    fuelType: v.fuelType,
                    drivetrain: null,
                    seats: v.seats,
                    image: v.image,
                    pending: false,
                    justIn: false,
                    sale: null,
                    rent: {
                      dailyMinor: v.tariff.dailyMinor,
                      weeklyMinor: v.tariff.weeklyMinor,
                      driver: v.tariff.withDriverAvailable,
                    },
                  },
                  market,
                  "rent",
                )}
              />
            ))}
          </ul>
        )}

        {/* Terms, folded. Every figure is read from the tariffs on file — the
            original quoted a deposit, a mileage allowance and free delivery
            that were tied to nothing. Items the business has not set are left
            out rather than guessed. */}
        <details className="rent-terms">
          <summary>Rental terms: license, deposit, fuel</summary>
          <dl>
            <div>
              <dt>Driver&rsquo;s license</dt>
              <dd>
                {code === "us"
                  ? "A valid US or international driver's license for the whole rental. Drivers must be 18 or older."
                  : "A valid Nigerian or international driver's license for the whole rental. Drivers must be 18 or older."}
              </dd>
            </div>
            {deposits.length > 0 && (
              <div>
                <dt>Security deposit</dt>
                <dd>
                  {Math.min(...deposits) === Math.max(...deposits)
                    ? `${fmt(deposits[0])}, refunded when you bring the car back.`
                    : `${fmt(Math.min(...deposits))} to ${fmt(Math.max(...deposits))} depending on the car, refunded when you bring it back.`}
                </dd>
              </div>
            )}
            <div>
              <dt>Fuel</dt>
              <dd>It comes with a full tank. Bring it back full.</dd>
            </div>
            {minDays != null && (
              <div>
                <dt>Shortest rental</dt>
                <dd>
                  {minDays === 1 ? "One day." : `${minDays} days.`} Longer rentals get the
                  weekly or monthly rate automatically when it is cheaper.
                </dd>
              </div>
            )}
            {driverAvailable && (
              <div>
                <dt>With a driver</dt>
                <dd>
                  Some cars can come with a driver. The daily driver rate is shown on the car
                  before you book.
                </dd>
              </div>
            )}
            <div>
              <dt>Mileage, insurance and delivery</dt>
              <dd>Confirmed in writing with your booking, before any payment is taken.</dd>
            </div>
          </dl>
          {code === "us" && (
            <p className="rent-terms-more">
              <Link href={`/${code}/rental-policy`}>Read the full rental policy</Link>
            </p>
          )}
        </details>
      </div>
      <GuideLinks
        market={code}
        slugs={["weekly-car-rental-greensboro-nc", "road-trip-from-greensboro"]}
      />
    </div>
  );
}
