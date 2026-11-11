import Link from "next/link";
import { formatRange, parseTstzRange } from "@/lib/pgRange";
import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { MARKETS, isMarketCode } from "@/lib/market";
import { getFleetVehicle, bookedWindows } from "@/lib/repositories/rentals";
import { listLocations } from "@/lib/repositories/locations";
import { RentalBookingForm } from "@/components/RentalBookingForm";
import type { TakenWindow } from "@/components/rentalBookingSteps";
import { formatMoney, money } from "@/lib/money";
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

/*
 * Edge to edge on phones with a notch or a home indicator, on this page only.
 *
 * The booking form pins its price and its button to the bottom of a phone's
 * screen; without "cover" there is no env(safe-area-inset-bottom) to keep
 * them clear of the home indicator. Next keeps width=device-width and
 * initial-scale=1 beside it. Zoom is never limited.
 */
export const viewport: Viewport = { viewportFit: "cover" };

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
              {/* One sentence. The second, "never more than the daily rate
                  times the days", stopped being true once a driver or added
                  insurance is chosen. */}
              <p className="rental-note">
                <i className="fas fa-circle-info" aria-hidden="true" /> Longer
                rentals get the cheapest mix of these rates automatically.
              </p>
            </section>
          </div>

          <aside className="rental-book">
            <div className="rental-book-card">
              {v.bookable ? (
                <>
                  <h2>
                    Reserve this <span>vehicle</span>
                  </h2>
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
