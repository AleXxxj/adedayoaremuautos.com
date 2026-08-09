import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode } from "@/lib/market";
import { listFleet } from "@/lib/repositories/rentals";
import { formatMoney, money } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  return {
    title: "Car rental — Adedayo Aremu Autos",
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

export default async function RentalsPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();
  const market = MARKETS[code];
  const fleet = await listFleet(code);

  const fmt = (minor: number) => formatMoney(money(minor, market.currency), market.locale);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-10 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight">Car rental</h1>
        <p className="mt-3 text-[var(--text-secondary)]">
          {code === "us"
            ? "Daily, weekly and monthly hire from our Greensboro location. Longer hires are priced on the better rate automatically."
            : "Daily, weekly and monthly hire, self-drive or with a driver. Longer hires are priced on the better rate automatically."}
        </p>
      </header>

      {fleet.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] px-6 py-16 text-center">
          <h2 className="text-lg font-semibold">No vehicles in the hire fleet yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">
            Tell us what you need and for how long, and we will let you know
            what we can arrange.
          </p>
          <Link
            href={`/${code}/contact?type=rental`}
            className="mt-6 inline-block rounded-lg bg-[var(--cta-bg)] px-5 py-2.5 text-sm font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)]"
          >
            Ask about a rental
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {fleet.map((v) => {
            const title = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
            return (
              <article
                key={v.id}
                className="group overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] transition-colors hover:bg-[var(--surface-2)]"
              >
                <Link href={`/${code}/rentals/${v.slug}`}>
                  <div className="relative aspect-[4/3] overflow-hidden bg-[var(--surface-2)]">
                    {v.image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={v.image}
                        alt={title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
                        Photography coming soon
                      </div>
                    )}
                    {v.tariff.withDriverAvailable && (
                      <span className="absolute left-3 top-3 rounded bg-[var(--accent-500)] px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--surface-0)]">
                        Driver available
                      </span>
                    )}
                  </div>
                </Link>

                <div className="space-y-3 p-5">
                  <h2 className="font-semibold leading-snug">
                    <Link href={`/${code}/rentals/${v.slug}`} className="hover:text-[var(--link)]">
                      {title}
                    </Link>
                  </h2>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-muted)]">
                    {v.seats && <span>{v.seats} seats</span>}
                    {v.transmission && <span>{v.transmission}</span>}
                    {v.bodyStyle && <span>{v.bodyStyle}</span>}
                  </div>

                  <dl className="space-y-1 border-t border-[var(--border-subtle)] pt-3 text-sm">
                    <Rate label="Per day" value={fmt(v.tariff.dailyMinor)} strong />
                    {v.tariff.weeklyMinor != null && (
                      <Rate label="Per week" value={fmt(v.tariff.weeklyMinor)} />
                    )}
                    {v.tariff.monthlyMinor != null && (
                      <Rate label="Per month" value={fmt(v.tariff.monthlyMinor)} />
                    )}
                    {v.tariff.depositMinor > 0 && (
                      <Rate
                        label="Refundable deposit"
                        value={fmt(v.tariff.depositMinor)}
                        muted
                      />
                    )}
                  </dl>

                  <Link
                    href={`/${code}/rentals/${v.slug}`}
                    className="block rounded-lg bg-[var(--cta-bg)] py-2.5 text-center font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)]"
                  >
                    Check availability
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Rate({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={muted ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"}>
        {label}
      </dt>
      <dd className={`tabular-nums ${strong ? "text-lg font-bold" : muted ? "text-[var(--text-muted)]" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
