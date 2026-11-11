import Link from "next/link";
import { formatRange } from "@/lib/pgRange";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode } from "@/lib/market";
import { getFleetVehicle, bookedWindows } from "@/lib/repositories/rentals";
import { listLocations } from "@/lib/repositories/locations";
import { RentalBookingForm } from "@/components/RentalBookingForm";
import { TakenDates } from "@/components/TakenDates";
import { formatMoney, money } from "@/lib/money";
import { RESERVATION_HOURS } from "@/lib/reservation";
import { providerConfigured, providerFor } from "@/lib/payments/provider";

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
  return {
    title: `Rent a ${title}`,
    description: `Rent a ${title} by the day, week or month. Live availability, transparent rates, no hidden charges.`,
    alternates: { canonical: `/${market}/rentals/${slug}` },
    openGraph: v.image ? { images: [v.image] } : undefined,
  };
}

/**
 * One vehicle, and the form that books it.
 *
 * Rebuilt out of Tailwind utilities. The legacy reset — `.legacy-theme
 * :where(…)` setting margin and padding to zero — carries the same 0,1,0
 * specificity as a utility class and loads after them, so every `px-`, `mt-`
 * and `mx-auto` on this page was being silently stripped: the content sat
 * flush against the left edge of the window with no container at all. It was
 * not that the page needed decorating; it had no layout. Written in the same
 * vocabulary as every other public page, it cannot drift out of the theme
 * again.
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

  const [taken, sites] = await Promise.all([
    bookedWindows(v.id, new Date()),
    listLocations(code),
  ]);
  // The showroom line, for "Text us" if a booking cannot be sent.
  const contactPhone = sites.find((s) => s.phone)?.phone ?? null;
  const title = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
  const fmt = (minor: number) => formatMoney(money(minor, market.currency), market.locale);

  // Only what this vehicle actually has. A spec grid padded with "—" reads as
  // missing data rather than a car that simply has no third row of seats.
  const specs = [
    v.seats && { icon: "fas fa-user-group", label: "Seats", value: String(v.seats) },
    v.transmission && { icon: "fas fa-cog", label: "Transmission", value: v.transmission },
    v.fuelType && { icon: "fas fa-gas-pump", label: "Fuel", value: v.fuelType },
    v.bodyStyle && { icon: "fas fa-car-side", label: "Body", value: v.bodyStyle },
    {
      icon: "fas fa-calendar-day",
      label: "Min. rental",
      value: `${v.tariff.minDays} day${v.tariff.minDays === 1 ? "" : "s"}`,
    },
    v.tariff.maxDays && {
      icon: "fas fa-calendar-week",
      label: "Max. rental",
      value: `${v.tariff.maxDays} days`,
    },
  ].filter(Boolean) as { icon: string; label: string; value: string }[];

  const rates = [
    { label: "Daily", value: fmt(v.tariff.dailyMinor) },
    v.tariff.weeklyMinor != null && { label: "Weekly", value: fmt(v.tariff.weeklyMinor) },
    v.tariff.monthlyMinor != null && { label: "Monthly", value: fmt(v.tariff.monthlyMinor) },
    v.tariff.withDriverAvailable &&
      v.tariff.driverDailyMinor != null && {
        label: "Driver, per day",
        value: fmt(v.tariff.driverDailyMinor),
      },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="rental-detail page-top">
      <div className="rental-detail-container">
        <nav className="rto-crumbs">
          <Link href={`/${code}/rentals`}>← All rentals</Link>
        </nav>

        <div className="rental-detail-grid">
          <div className="rental-detail-main">
            <div className="rental-gallery">
              {v.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={v.image}
                  alt={title}
                  /* The largest element above the fold, so it is fetched at
                     high priority rather than queued behind the icon font. */
                  fetchPriority="high"
                  decoding="async"
                />
              ) : (
                <div className="rental-gallery-empty">
                  <i className="fas fa-camera" aria-hidden="true" />
                  <span>Photography coming soon</span>
                </div>
              )}
            </div>

            <h1 className="rental-title">{title}</h1>

            <dl className="rental-specs">
              {specs.map((s) => (
                <div className="rental-spec" key={s.label}>
                  <dt>
                    <i className={s.icon} aria-hidden="true" /> {s.label}
                  </dt>
                  <dd>{s.value}</dd>
                </div>
              ))}
            </dl>

            <section className="rental-block">
              <h2>Rates</h2>
              <dl className="rental-rates">
                {rates.map((r) => (
                  <div className="rental-rate" key={r.label}>
                    <dt>{r.label}</dt>
                    <dd>{r.value}</dd>
                  </div>
                ))}
                {v.tariff.depositMinor > 0 && (
                  <div className="rental-rate rental-rate--muted">
                    <dt>Deposit (refundable)</dt>
                    <dd>{fmt(v.tariff.depositMinor)}</dd>
                  </div>
                )}
              </dl>
              <p className="rental-note">
                <i className="fas fa-circle-info" aria-hidden="true" /> Longer
                rentals are priced on the best combination of these rates
                automatically. You are never charged more than the daily rate
                multiplied by the number of days.
              </p>
            </section>

            <TakenDates
              windows={taken.map((t) => ({
                label: formatRange(t.period, market.locale),
                heldUntil:
                  t.status === "quote" && t.heldUntil ? t.heldUntil.toISOString() : null,
              }))}
            />
          </div>

          <aside className="rental-book">
            <div className="rental-book-card">
              {v.bookable ? (
                <>
                  <h2>
                    Reserve this <span>vehicle</span>
                  </h2>
                  {/* This used to say the booking did not hold until a deposit was
                      taken — true before reservations existed, and the first
                      thing a customer read on the card afterwards. */}
                  <p className="rental-book-lead">
                    Pick your dates to see the price. Reserving holds the vehicle
                    for you for up to {RESERVATION_HOURS / 24} days, so you can see
                    it before you pay.
                  </p>
                  <RentalBookingForm
                    market={market}
                    vehicleSlug={v.slug}
                    vehicleTitle={title}
                    contactPhone={contactPhone}
                    payOnline={providerConfigured(providerFor(code))}
                    tariff={v.tariff}
                  />
                </>
              ) : (
                // Sold or taken off rental since the link was shared: said
                // plainly, with the way to the cars that can be booked.
                <>
                  <h2>
                    Not available <span>to rent</span>
                  </h2>
                  <p className="rental-book-lead">This car isn&rsquo;t available to rent right now.</p>
                  <Link href={`/${code}/rentals`} className="btn btn-primary">
                    See cars you can rent
                  </Link>
                </>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
