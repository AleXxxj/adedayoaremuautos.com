import Link from "next/link";
import { formatRange, parseTstzRange } from "@/lib/pgRange";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode } from "@/lib/market";
import { getFleetVehicle, bookedWindows, listFleet, weekCost } from "@/lib/repositories/rentals";
import { listLocations } from "@/lib/repositories/locations";
import { RentalBookingForm } from "@/components/RentalBookingForm";
import type { TakenWindow } from "@/components/rentalBookingSteps";
import { formatMoney, money } from "@/lib/money";
import { providerConfigured, providerFor } from "@/lib/payments/provider";
import { CarCard } from "@/components/cars/CarCard";
import { Gallery } from "@/components/cars/Gallery";
import { RecentlyViewed } from "@/components/cars/RecentlyViewed";
import { SaveButton } from "@/components/cars/SaveButton";
import {
  bodyLabel,
  bodyTypeOf,
  cardFor,
  shortFuel,
  shortTransmission,
  similarCars,
  splitName,
} from "@/components/cars/carData";
import "@/styles/cars.css";

/**
 * Cached and revalidated, not rebuilt per visitor.
 *
 * Every public page was `force-dynamic`, so each view needed a live database
 * round trip and a brief backend problem produced a dead site rather than a
 * slightly stale one. The admin calls `revalidatePath` when the underlying
 * records change, so edits still appear immediately; this window only governs
 * how long a cached copy keeps serving when nothing has changed — and what
 * the page falls back on when the database cannot be reached at all.
 */
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string; slug: string }>;
}): Promise<Metadata> {
  const { market, slug } = await params;
  if (!isMarketCode(market)) return {};
  const v = await getFleetVehicle(market, slug);
  if (!v) return {};
  const title = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
  // A car no longer offered keeps its page for old links, out of search
  // results: "Rent a … Live availability" would be untrue there.
  if (!v.bookable) {
    return {
      title: `${title}: not available to rent`,
      robots: { index: false, follow: true },
    };
  }
  return {
    title: `Rent a ${title}`,
    // No deposit promised for a car that takes none.
    description:
      v.tariff.depositMinor > 0
        ? `Rent a ${title} by the day, week or month. See your total and deposit before you book.`
        : `Rent a ${title} by the day, week or month. See your total before you book.`,
    alternates: { canonical: `/${market}/rentals/${slug}` },
    openGraph: v.image ? { images: [v.image] } : undefined,
  };
}

/**
 * One car to rent, and the form that books it.
 *
 * The same top as a car for sale: the name, three facts, what a week costs,
 * then the photos. Under them the rates, compact, and the booking form
 * exactly as it was: its steps, its fields and its legal text are
 * RentalBookingForm's and are not touched here. The form brings its own bar
 * pinned to the bottom of a phone ("$350 a week … Pick dates"), so this page
 * adds none. Similar rentals and the cars looked at before come last.
 *
 * On a wide screen the booking card stays beside the photos, as before: it
 * keeps the `rental-book` and `rental-book-card` classes the form measures
 * and the stylesheet positions (refine.css).
 */
export default async function RentalDetailPage({
  params,
}: {
  params: Promise<{ market: string; slug: string }>;
}) {
  const { market: code, slug } = await params;
  if (!isMarketCode(code)) notFound();

  const market = MARKETS[code];
  const v = await getFleetVehicle(code, slug);
  if (!v) notFound();

  const [taken, sites, fleet] = await Promise.all([
    bookedWindows(v.id, new Date()),
    listLocations(code),
    listFleet(code),
  ]);
  // The showroom line, for "Text us" if a booking cannot be sent.
  const contactPhone = sites.find((s) => s.phone)?.phone ?? null;
  const title = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
  const name = splitName(v);
  const fmt = (minor: number) => formatMoney(money(minor, market.currency), market.locale);
  const payOnline = providerConfigured(providerFor(code));

  /*
   * Dates already taken, handed to the form as data.
   *
   * The form lists them on its first step and checks a choice against them
   * before moving on, [start, end) like the database: a pickup on someone
   * else's return day is fine. Each hold carries its end, because the page is
   * cached and a hold mostly ends by the clock, with nothing to refresh it;
   * the browser drops the ones already over. The server still decides.
   */
  const takenWindows: TakenWindow[] = taken.flatMap((t) => {
    const r = parseTstzRange(t.period);
    return r
      ? [
          {
            start: r.start.toISOString().slice(0, 10),
            end: r.end.toISOString().slice(0, 10),
            label: formatRange(t.period, market.locale),
            heldUntil: t.status === "quote" && t.heldUntil ? t.heldUntil.toISOString() : null,
          },
        ]
      : [];
  });

  // Three facts, from whatever this car has. A row padded with "—" reads as
  // missing data rather than a car that simply has no third row of seats.
  const body = bodyTypeOf(v);
  const facts = (
    [
      shortTransmission(v.transmission) && { icon: "fa-gears", text: shortTransmission(v.transmission)! },
      shortFuel(v.fuelType, market) && { icon: "fa-gas-pump", text: shortFuel(v.fuelType, market)! },
      v.seats != null && { icon: "fa-user-group", text: `${v.seats} seats` },
      body && { icon: "fa-car-side", text: bodyLabel(body) },
    ] as (false | null | { icon: string; text: string })[]
  )
    .filter((f): f is { icon: string; text: string } => Boolean(f))
    .slice(0, 3);

  const weekly = v.tariff.weeklyMinor;

  // Every rate on file, then the terms that belong with them.
  const rates = [
    { label: "A day", value: fmt(v.tariff.dailyMinor) },
    weekly != null && { label: "A week", value: fmt(weekly) },
    v.tariff.monthlyMinor != null && { label: "A month", value: fmt(v.tariff.monthlyMinor) },
    v.tariff.withDriverAvailable &&
      v.tariff.driverDailyMinor != null && {
        label: "Driver, a day",
        value: fmt(v.tariff.driverDailyMinor),
      },
    v.tariff.depositMinor > 0 && {
      label: "Deposit (refundable)",
      value: fmt(v.tariff.depositMinor),
    },
    {
      label: "Shortest rental",
      value: `${v.tariff.minDays} day${v.tariff.minDays === 1 ? "" : "s"}`,
    },
    v.tariff.maxDays && { label: "Longest rental", value: `${v.tariff.maxDays} days` },
  ].filter(Boolean) as { label: string; value: string }[];

  // Similar rentals: the same body type first, then the nearest weekly cost.
  const similar = v.bookable ? similarCars(v, weekCost(v), fleet, weekCost, 3) : [];

  return (
    <div className="cd-page">
      <div className="cd-wrap">
        <nav className="cd-back" aria-label="Back">
          <Link href={`/${code}/rentals`}>
            <i className="fas fa-arrow-left" aria-hidden="true" />
            All rentals
          </Link>
        </nav>

        <div className="cd-grid cd-grid--rental">
          <section className="cd-top" aria-label="This car">
            <div className="cd-head">
              <h1 className="cd-title">
                <span className="cd-kicker">{name.kicker}</span> {name.name}
                {name.detail && <span className="cd-title-detail"> {name.detail}</span>}
              </h1>
              {v.bookable && <SaveButton market={code} slug={v.slug} name={title} variant="pill" />}
            </div>

            {(facts.length > 0 || v.tariff.withDriverAvailable) && (
              <ul className="cd-facts">
                {facts.map((f) => (
                  <li key={f.icon}>
                    <i className={`fas ${f.icon}`} aria-hidden="true" />
                    {f.text}
                  </li>
                ))}
                {v.tariff.withDriverAvailable && (
                  <li>
                    <i className="fas fa-id-badge" aria-hidden="true" />
                    Driver available
                  </li>
                )}
              </ul>
            )}

            {v.bookable && (
              <p className="cd-price">
                <span>
                  <strong>{fmt(weekly ?? v.tariff.dailyMinor)}</strong>{" "}
                  <span className="cd-price-unit">{weekly != null ? "a week" : "a day"}</span>
                </span>
                {weekly != null && (
                  <span className="cd-price-sub">or {fmt(v.tariff.dailyMinor)} a day</span>
                )}
              </p>
            )}
          </section>

          <div className="cd-gallery">
            <Gallery images={v.images} name={title} />
          </div>

          <div className="cd-body">
            <section className="cd-section" aria-labelledby="cd-rates">
              <h2 className="cd-h" id="cd-rates">
                Rates
              </h2>
              <dl className="cd-specs">
                {rates.map((r) => (
                  <div key={r.label}>
                    <dt>{r.label}</dt>
                    <dd>{r.value}</dd>
                  </div>
                ))}
              </dl>
              {/* One sentence. The second, "never more than the daily rate
                  times the days", stopped being true once a driver or added
                  insurance is chosen. */}
              <p className="cd-rates-note">
                Longer rentals get the cheapest mix of these rates automatically.
              </p>
            </section>
          </div>

          <aside className="rental-book">
            <div className="rental-book-card">
              {v.bookable ? (
                <>
                  <h2>Reserve this car</h2>
                  {/* What reserving costs, first. The hold and how long it
                      lasts are said once, in the form's fine print beside
                      Reserve, where the decision is made. */}
                  <p className="rental-book-lead">
                    {payOnline
                      ? "Reserving is free. Pay online now, or when you pick it up."
                      : "Reserving is free. Pay when you pick it up."}
                  </p>
                  <RentalBookingForm
                    market={market}
                    vehicleSlug={v.slug}
                    vehicleTitle={title}
                    contactPhone={contactPhone}
                    payOnline={payOnline}
                    tariff={v.tariff}
                    taken={takenWindows}
                  />
                </>
              ) : (
                // Sold or taken off rental since the link was shared: said
                // plainly, with the way to the cars that can be booked.
                <>
                  <h2>Not available to rent</h2>
                  <p className="rental-book-lead">This car isn&rsquo;t available to rent right now.</p>
                  <Link href={`/${code}/rentals`} className="cd-btn cd-btn--primary">
                    See cars you can rent
                  </Link>
                </>
              )}
            </div>
          </aside>
        </div>

        {similar.length > 0 && (
          <section className="cd-section" aria-labelledby="cd-similar">
            <h2 className="cd-h" id="cd-similar">
              Similar rentals
            </h2>
            <ul className="cc-row">
              {similar.map((r) => (
                <CarCard
                  key={r.id}
                  market={code}
                  sizes="(min-width: 700px) 33vw, 78vw"
                  card={cardFor(
                    {
                      slug: r.slug,
                      year: r.year,
                      make: r.make,
                      model: r.model,
                      trim: r.trim,
                      bodyStyle: r.bodyStyle,
                      mileage: null,
                      transmission: r.transmission,
                      fuelType: r.fuelType,
                      drivetrain: null,
                      seats: r.seats,
                      image: r.image,
                      pending: false,
                      justIn: false,
                      sale: null,
                      rent: {
                        dailyMinor: r.tariff.dailyMinor,
                        weeklyMinor: r.tariff.weeklyMinor,
                        driver: r.tariff.withDriverAvailable,
                      },
                    },
                    market,
                    "rent",
                  )}
                />
              ))}
            </ul>
          </section>
        )}

        {v.bookable && <RecentlyViewed market={code} slug={v.slug} kind="rent" />}
      </div>
    </div>
  );
}
