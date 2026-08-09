import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode } from "@/lib/market";
import { getFleetVehicle, bookedWindows } from "@/lib/repositories/rentals";
import { RentalBookingForm } from "@/components/RentalBookingForm";
import { formatMoney, money } from "@/lib/money";

export const dynamic = "force-dynamic";

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
    title: `Rent a ${title} — Adedayo Aremu Autos`,
    alternates: { canonical: `/${market}/rentals/${slug}` },
  };
}

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

  const taken = await bookedWindows(v.id, new Date());
  const title = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
  const fmt = (minor: number) => formatMoney(money(minor, market.currency), market.locale);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <nav className="mb-6 text-sm text-[var(--text-muted)]">
        <Link href={`/${code}/rentals`} className="hover:text-[var(--link)]">
          ← All rentals
        </Link>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]">
            {v.image ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={v.image} alt={title} className="aspect-[4/3] w-full object-cover" />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center text-[var(--text-muted)]">
                Photography coming soon
              </div>
            )}
          </div>

          <h1 className="mt-6 text-2xl font-bold tracking-tight">{title}</h1>

          <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            {v.seats && <Spec label="Seats" value={String(v.seats)} />}
            {v.transmission && <Spec label="Transmission" value={v.transmission} />}
            {v.fuelType && <Spec label="Fuel" value={v.fuelType} />}
            {v.bodyStyle && <Spec label="Body" value={v.bodyStyle} />}
            <Spec
              label="Minimum hire"
              value={`${v.tariff.minDays} day${v.tariff.minDays === 1 ? "" : "s"}`}
            />
            {v.tariff.maxDays && <Spec label="Maximum hire" value={`${v.tariff.maxDays} days`} />}
          </dl>

          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold">Rates</h2>
            <dl className="max-w-sm space-y-2 text-sm">
              <Row label="Daily" value={fmt(v.tariff.dailyMinor)} />
              {v.tariff.weeklyMinor != null && <Row label="Weekly" value={fmt(v.tariff.weeklyMinor)} />}
              {v.tariff.monthlyMinor != null && <Row label="Monthly" value={fmt(v.tariff.monthlyMinor)} />}
              {v.tariff.withDriverAvailable && v.tariff.driverDailyMinor != null && (
                <Row label="Driver, per day" value={fmt(v.tariff.driverDailyMinor)} />
              )}
              {v.tariff.depositMinor > 0 && (
                <Row label="Deposit (refundable)" value={fmt(v.tariff.depositMinor)} muted />
              )}
            </dl>
            <p className="mt-3 max-w-md text-xs text-[var(--text-muted)]">
              Longer hires are priced on the best combination of rates
              automatically — you are never charged more than the daily rate
              multiplied by the number of days.
            </p>
          </section>

          {taken.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Already booked
              </h2>
              <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
                {taken.map((t, i) => (
                  <li key={i} className="tabular-nums">{formatPeriod(t.period, market.locale)}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6">
            <h2 className="mb-1 text-lg font-semibold">Request this vehicle</h2>
            <p className="mb-5 text-sm text-[var(--text-muted)]">
              We confirm availability and take a deposit before the booking holds.
            </p>
            <RentalBookingForm
              market={market}
              vehicleSlug={v.slug}
              tariff={v.tariff}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

/** "[2026-09-01 00:00+00,2026-09-08 00:00+00)" -> "1 Sep – 8 Sep 2026" */
function formatPeriod(period: string, locale: string): string {
  const m = /^[\[(]([^,]+),([^)\]]+)[)\]]$/.exec(period);
  if (!m) return period;
  const f = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  return `${f.format(new Date(m[1]))} – ${f.format(new Date(m[2]))}`;
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[var(--border-subtle)] pb-1.5">
      <dt className={muted ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"}>{label}</dt>
      <dd className={`tabular-nums ${muted ? "text-[var(--text-muted)]" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}
