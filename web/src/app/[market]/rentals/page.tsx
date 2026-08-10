import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode, type MarketConfig } from "@/lib/market";
import { listFleet, type FleetVehicle } from "@/lib/repositories/rentals";
import { formatMoney, money, toMajor } from "@/lib/money";
import { whatsappUrl } from "@/lib/contact";
import {
  LegacyRentalFilters,
  RentalResultsBar,
  type RentalFilterOptions,
} from "@/components/LegacyRentalFilters";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  return {
    title: "Car Rentals — Adedayo Aremu Autos",
    description:
      market === "us"
        ? "Daily, weekly and monthly car hire in Greensboro, North Carolina."
        : "Daily, weekly and monthly car hire in Nigeria, with or without a driver.",
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

  const options: RentalFilterOptions = {
    types: [...new Set(all.map((v) => v.bodyStyle).filter((t): t is string => Boolean(t)))].sort(),
    transmissions: [
      ...new Set(all.map((v) => v.transmission).filter((t): t is string => Boolean(t))),
    ].sort(),
    priceBands: priceBands(market, all),
  };

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

  fleet = [...fleet].sort((a, b) => {
    switch (q.sort) {
      case "price-high":
        return b.tariff.dailyMinor - a.tariff.dailyMinor;
      case "name":
        return name(a).localeCompare(name(b));
      case "price-low":
      default:
        return a.tariff.dailyMinor - b.tariff.dailyMinor;
    }
  });

  // "From" prices for the three type cards, taken from the cheapest vehicle
  // that actually offers each term. The original hardcoded ₦25,000 / ₦150,000
  // / ₦500,000 whether or not anything was available at those rates.
  const cheapest = (pick: (v: FleetVehicle) => number | null | undefined) => {
    const vals = all.map(pick).filter((n): n is number => typeof n === "number");
    return vals.length ? Math.min(...vals) : null;
  };
  const fromDaily = cheapest((v) => v.tariff.dailyMinor);
  const fromWeekly = cheapest((v) => v.tariff.weeklyMinor);
  const fromMonthly = cheapest((v) => v.tariff.monthlyMinor);

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
            Car <span>Rentals</span>
          </h1>
          <p>Flexible rental options for any occasion - daily, weekly, or monthly</p>
        </div>
      </div>

      {/* Rental type cards. Shown only when there is a fleet to quote from —
          three price cards above an empty grid would be advertising nothing. */}
      {all.length > 0 && (
        <div className="rental-types">
          <div className="type-card">
            <i className="fas fa-sun" />
            <h3>Daily Rental</h3>
            <p>Perfect for short trips, business meetings, and weekend getaways</p>
            <div className="price">
              {fromDaily != null ? (
                <>
                  {fmt(fromDaily)}
                  <small>/day</small>
                </>
              ) : (
                <small>On request</small>
              )}
            </div>
          </div>
          <div className="type-card">
            <i className="fas fa-calendar-week" />
            <h3>Weekly Rental</h3>
            <p>Save more with our weekly rates - ideal for vacations and projects</p>
            <div className="price">
              {fromWeekly != null ? (
                <>
                  {fmt(fromWeekly)}
                  <small>/week</small>
                </>
              ) : (
                <small>On request</small>
              )}
            </div>
          </div>
          <div className="type-card">
            <i className="fas fa-calendar-alt" />
            <h3>Monthly Rental</h3>
            <p>Best value for long-term needs - corporate and personal use</p>
            <div className="price">
              {fromMonthly != null ? (
                <>
                  {fmt(fromMonthly)}
                  <small>/month</small>
                </>
              ) : (
                <small>On request</small>
              )}
            </div>
          </div>
        </div>
      )}

      {all.length > 0 && <LegacyRentalFilters options={options} />}

      {all.length > 0 && (
        <RentalResultsBar showing={fleet.length} total={all.length} />
      )}

      <div className="cars-listing">
        {fleet.length === 0 ? (
          <div className="no-results">
            <i className="fas fa-car" />
            <h3>{all.length === 0 ? "No vehicles in the hire fleet yet" : "No vehicles found"}</h3>
            <p>
              {all.length === 0
                ? "Tell us what you need and for how long, and we will let you know what we can arrange."
                : "Try adjusting your filters or browse all rentals"}
            </p>
            <Link
              href={all.length === 0 ? `/${code}/contact?type=rental` : `/${code}/rentals`}
              className="btn btn-primary"
              style={{ marginTop: 20, display: "inline-flex", width: "auto" }}
            >
              {all.length === 0 ? "Ask about a rental" : "View All Rentals"}
            </Link>
          </div>
        ) : (
          <div className="cars-grid" id="rental-cars">
            {fleet.map((v) => {
              const title = name(v);
              const wa = whatsappUrl(
                code,
                `Hello, I'd like to rent the ${title}.`,
              );
              return (
                <div className="car-card" key={v.id}>
                  <div className="car-image">
                    <Link href={`/${code}/rentals/${v.slug}`}>
                      {v.image ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={v.image} alt={title} loading="lazy" />
                      ) : (
                        <div className="car-image-placeholder">Photography coming soon</div>
                      )}
                    </Link>
                    {v.tariff.withDriverAvailable && (
                      <span className="car-badge">With driver</span>
                    )}
                  </div>

                  <div className="car-details">
                    <h3 className="car-title">
                      <Link href={`/${code}/rentals/${v.slug}`}>{title}</Link>
                    </h3>

                    <div className="car-specs">
                      {v.transmission && (
                        <span>
                          <i className="fas fa-cog" /> {v.transmission}
                        </span>
                      )}
                      {v.fuelType && (
                        <span>
                          <i className="fas fa-gas-pump" /> {v.fuelType}
                        </span>
                      )}
                      {v.seats != null && (
                        <span>
                          <i className="fas fa-users" /> {v.seats} seats
                        </span>
                      )}
                    </div>

                    <div className="rental-prices">
                      <div className="price-row">
                        <span className="duration">
                          <i className="fas fa-sun" /> Daily
                        </span>
                        <span className="amount">{fmt(v.tariff.dailyMinor)}</span>
                      </div>
                      {v.tariff.weeklyMinor != null && (
                        <div className="price-row">
                          <span className="duration">
                            <i className="fas fa-calendar-week" /> Weekly
                          </span>
                          <span className="amount">{fmt(v.tariff.weeklyMinor)}</span>
                        </div>
                      )}
                      {v.tariff.monthlyMinor != null && (
                        <div className="price-row">
                          <span className="duration">
                            <i className="fas fa-calendar-alt" /> Monthly
                          </span>
                          <span className="amount">{fmt(v.tariff.monthlyMinor)}</span>
                        </div>
                      )}
                    </div>

                    {v.tariff.depositMinor > 0 && (
                      <div className="deposit-info">
                        <i className="fas fa-shield-alt" />
                        <span>
                          Security deposit: {fmt(v.tariff.depositMinor)} (refundable)
                        </span>
                      </div>
                    )}

                    <div className="car-actions">
                      {/* The original's Book button opened a WhatsApp chat with
                          a number the business does not own, so nothing was
                          ever booked. This goes to the availability calendar,
                          which checks real dates against real bookings. */}
                      <Link href={`/${code}/rentals/${v.slug}`} className="btn btn-primary">
                        <i className="fas fa-calendar-check" /> Book
                      </Link>
                      {wa && (
                        <a
                          href={wa}
                          className="btn btn-whatsapp"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Ask about the ${title} on WhatsApp`}
                        >
                          <i className="fab fa-whatsapp" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Terms. Every figure here is read from the tariffs actually on file —
          the original quoted a ₦100,000–₦500,000 deposit, 200km/day and free
          Lagos delivery, none of which was tied to anything. Items the
          business has not set are left out rather than guessed. */}
      <div className="terms-section">
        <h3>
          Rental <span>Terms &amp; Conditions</span>
        </h3>
        <div className="terms-grid">
          <div className="term-item">
            <i className="fas fa-id-card" />
            <div>
              <h4>Valid Driver&rsquo;s Licence</h4>
              <p>
                {code === "us"
                  ? "A valid US or international licence, held for the full hire period. Drivers must be 21 or over."
                  : "A valid Nigerian or international licence, held for the full hire period."}
              </p>
            </div>
          </div>

          {deposits.length > 0 && (
            <div className="term-item">
              <i className="fas fa-money-bill" />
              <div>
                <h4>Security Deposit</h4>
                <p>
                  {Math.min(...deposits) === Math.max(...deposits)
                    ? `${fmt(deposits[0])}, refunded on return.`
                    : `${fmt(Math.min(...deposits))} – ${fmt(Math.max(...deposits))} depending on the vehicle, refunded on return.`}
                </p>
              </div>
            </div>
          )}

          <div className="term-item">
            <i className="fas fa-gas-pump" />
            <div>
              <h4>Fuel Policy</h4>
              <p>Collected with a full tank. Return it the same way.</p>
            </div>
          </div>

          {minDays != null && (
            <div className="term-item">
              <i className="fas fa-calendar-day" />
              <div>
                <h4>Minimum Hire</h4>
                <p>
                  {minDays === 1
                    ? "One day. Longer hires are automatically priced on the better weekly or monthly rate."
                    : `${minDays} days. Longer hires are automatically priced on the better weekly or monthly rate.`}
                </p>
              </div>
            </div>
          )}

          {driverAvailable && (
            <div className="term-item">
              <i className="fas fa-user-tie" />
              <div>
                <h4>Chauffeur Service</h4>
                <p>
                  A driver can be added to selected vehicles. The daily driver
                  rate is shown on the vehicle before you book.
                </p>
              </div>
            </div>
          )}

          <div className="term-item">
            <i className="fas fa-file-contract" />
            <div>
              <h4>Mileage, Insurance &amp; Delivery</h4>
              {/* The original published "200km/day, ₦100/km excess, free
                  delivery within Lagos" as fact. None of it is recorded
                  anywhere, so it is confirmed in writing per booking until the
                  business sets the real allowances. */}
              <p>
                Confirmed in writing with your booking, before any payment is
                taken.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
