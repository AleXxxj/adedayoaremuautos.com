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
import { ListToolbar, type ListFilter } from "@/components/ListToolbar";
import { CarRow } from "@/components/CarRow";
import "@/styles/car-list.css";
import "@/styles/rentals.css";

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

/** Price bands in whole currency units, wide enough to be useful in both markets. */
function priceBands(market: MarketConfig, fleet: FleetVehicle[]) {
  if (fleet.length === 0) return [];
  const fmt = (minor: number) =>
    formatMoney(money(minor, market.currency), market.locale, { compact: true });

  const dailies = fleet.map((v) => v.tariff.dailyMinor).sort((a, b) => a - b);
  const min = dailies[0];
  const max = dailies.at(-1)!;
  if (min === max) return [];

  // Three bands across the actual range, so every band has something in it —
  // the original's fixed ₦30k/₦50k/₦80k steps were empty or all-inclusive
  // depending on what happened to be in the fleet.
  const step = Math.ceil((max - min) / 3);
  const cuts = [min + step, min + step * 2];

  return [
    { label: `Under ${fmt(cuts[0])}`, value: `0-${cuts[0]}` },
    { label: `${fmt(cuts[0])} – ${fmt(cuts[1])}`, value: `${cuts[0]}-${cuts[1]}` },
    { label: `Above ${fmt(cuts[1])}`, value: `${cuts[1]}-` },
  ];
}

export default async function RentalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string }>;
  searchParams: Promise<{
    type?: string;
    duration?: string;
    price?: string;
    transmission?: string;
    sort?: string;
  }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();
  const market = MARKETS[code];
  const q = await searchParams;

  const all = await listFleet(code);
  const fmt = (minor: number) => formatMoney(money(minor, market.currency), market.locale);

  const each = (values: (string | null | undefined)[]) =>
    [...new Set(values.filter((t): t is string => Boolean(t)))].sort().map((t) => ({ value: t, label: t }));
  const filters: ListFilter[] = [
    { key: "type", label: "Type", anyLabel: "Any type", options: each(all.map((v) => v.bodyStyle)) },
    {
      key: "duration",
      label: "Rent by",
      anyLabel: "Day, week or month",
      options: [
        { value: "weekly", label: "The week" },
        { value: "monthly", label: "The month" },
      ],
    },
    { key: "price", label: "Price a day", anyLabel: "Any price", options: priceBands(market, all) },
    { key: "transmission", label: "Transmission", anyLabel: "Any", options: each(all.map((v) => v.transmission)) },
  ];

  // Filtering in the route rather than the browser: the whole fleet is already
  // loaded here, and doing it server-side keeps every filtered view a real URL.
  let fleet = all;
  if (q.type) fleet = fleet.filter((v) => v.bodyStyle === q.type);
  if (q.transmission) fleet = fleet.filter((v) => v.transmission === q.transmission);
  if (q.duration === "weekly") fleet = fleet.filter((v) => v.tariff.weeklyMinor != null);
  if (q.duration === "monthly") fleet = fleet.filter((v) => v.tariff.monthlyMinor != null);
  if (q.price) {
    const [lo, hi] = q.price.split("-");
    const min = Number(lo) || 0;
    const max = hi ? Number(hi) : Infinity;
    fleet = fleet.filter((v) => v.tariff.dailyMinor >= min && v.tariff.dailyMinor <= max);
  }

  const name = (v: FleetVehicle) =>
    [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");

  // Sorted on what a week costs, the price each card leads with (weekCost).
  fleet = [...fleet].sort((a, b) => {
    switch (q.sort) {
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
  const { fromDaily, fromWeekly, fromMonthly } = fromPrices(all);

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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="page-header page-header--rentals">
        <div className="page-header-content">
          <h1>
            Rent a <span>car</span>
          </h1>
          <p>By the day, the week or the month. Tap a car to see open dates and book.</p>
        </div>
      </div>

      <div className="rent-page">
        {/* One line instead of three cards: each car shows its own prices,
            so all this needs to say is where they start. */}
        {all.length > 0 && fromDaily != null && (
          <p className="rent-from">
            From <strong>{fmt(fromDaily)}</strong> a day
            {fromWeekly != null && (
              <>
                {" "}· <strong>{fmt(fromWeekly)}</strong> a week
              </>
            )}
            {fromMonthly != null && (
              <>
                {" "}· <strong>{fmt(fromMonthly)}</strong> a month
              </>
            )}
          </p>
        )}

        {all.length > 0 && (
          <ListToolbar
            count={fleet.length === all.length ? `${all.length} cars` : `${fleet.length} of ${all.length} cars`}
            filters={filters}
            sort={{
              defaultValue: "price-low",
              options: [
                { value: "price-low", label: "Lowest price" },
                { value: "price-high", label: "Highest price" },
                { value: "name", label: "Name" },
              ],
            }}
          />
        )}

        {fleet.length === 0 ? (
          <div className="no-results">
            <i className="fas fa-car" />
            <h3>{all.length === 0 ? "No cars to rent right now" : "No cars match those filters"}</h3>
            <p>
              {all.length === 0
                ? "Tell us what you need and for how long, and we will let you know what we can arrange."
                : "Clear a filter or two to see more."}
            </p>
            <Link
              href={all.length === 0 ? `/${code}/contact?type=rental` : `/${code}/rentals`}
              className="btn btn-primary"
              style={{ marginTop: 20, display: "inline-flex", width: "auto" }}
            >
              {all.length === 0 ? "Ask about a rental" : "See all cars"}
            </Link>
          </div>
        ) : (
          /* One row per car on a phone, a grid on a wider screen. The whole
             card is the link, and it leads with the weekly price: most
             renters here rent by the week. The deposit, every rate and the
             open dates are on the car's own page, where they decide. */
          <ul className="cl-list" id="rental-cars">
            {fleet.map((v, i) => {
              const weekly = v.tariff.weeklyMinor;
              return (
                <CarRow
                  key={v.id}
                  href={`/${code}/rentals/${v.slug}`}
                  image={v.image}
                  preload={i === 0}
                  title={name(v)}
                  price={fmt(weekly ?? v.tariff.dailyMinor)}
                  unit={weekly != null ? "a week" : "a day"}
                  details={[
                    weekly != null && `or ${fmt(v.tariff.dailyMinor)} a day`,
                    v.transmission,
                    v.seats != null && `${v.seats} seats`,
                  ]}
                  badge={v.tariff.withDriverAvailable ? "Driver available" : null}
                />
              );
            })}
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
            <p style={{ marginTop: 12 }}>
              <Link href={`/${code}/rental-policy`}>Read the full rental policy</Link>
            </p>
          )}
        </details>
      </div>
    </>
  );
}
