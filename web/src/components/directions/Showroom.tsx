import Link from "next/link";
import Image from "next/image";
import { fraunces, inter } from "@/lib/fonts";
import { SERVICES, reasons, REFERRAL } from "@/lib/content";
import { PaymentCalculator } from "@/components/PaymentCalculator";
import { VehicleCard } from "@/components/VehicleCard";
import { formatMilestone, type SiteStats } from "@/lib/stats";
import { formatPhone } from "@/lib/repositories/locations";
import type { MarketConfig } from "@/lib/market";
import type { Vehicle } from "@/db/schema";

/**
 * DIRECTION A — "Showroom"
 *
 * Light, generous, editorial. High-contrast serif headlines against white,
 * asymmetric layout, air between elements. The reference points are gallery and
 * architecture sites rather than car dealerships — the premise being that a
 * premium vehicle reads as more premium against white space than against black.
 */
export function Showroom({
  market,
  stats,
  vehicles,
  phone,
}: {
  market: MarketConfig;
  stats: SiteStats;
  vehicles: (Vehicle & { primaryImage?: string | null })[];
  phone: string | null;
}) {
  const m = market.code;

  return (
    <div
      data-theme="light"
      className={`${fraunces.variable} ${inter.variable} bg-[var(--surface-0)] text-[var(--text-primary)]`}
      style={{ fontFamily: "var(--font-body)" }}
    >
      {/* ── Hero: asymmetric, type-led ─────────────────────────────────── */}
      <section className="mx-auto grid max-w-7xl gap-12 px-6 pb-16 pt-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-24">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-700)]">
            {m === "us" ? "Greensboro · North Carolina" : "Nigeria"}
          </p>

          <h1
            className="mt-6 text-[clamp(2.75rem,6vw,4.75rem)] font-light leading-[0.98] tracking-[-0.02em]"
            style={{ fontFamily: "var(--font-display-serif)" }}
          >
            The car you want,
            <br />
            <em className="font-normal italic text-[var(--brand-700)]">
              honestly
            </em>{" "}
            priced.
          </h1>

          <p className="mt-7 max-w-md text-lg leading-relaxed text-[var(--text-secondary)]">
            {m === "us"
              ? "Inspected vehicles with the history in the open, and financing decided under this roof — not passed to a bank and hoped for."
              : "Verified foreign-used and Nigerian-used vehicles, documentation handled end to end, and instalment plans that fit real budgets."}
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href={`/${m}/inventory`}
              className="rounded-full bg-[var(--cta-bg)] px-8 py-3.5 font-semibold text-[var(--cta-fg)] transition-transform hover:scale-[1.02]"
            >
              See what's available
            </Link>
            {phone && (
              <a
                href={`tel:${phone}`}
                className="border-b border-current pb-0.5 font-medium text-[var(--text-primary)] hover:text-[var(--brand-700)]"
              >
                or call {phone}
              </a>
            )}
          </div>
        </div>

        <div className="relative">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem]">
            <Image
              src="/img/hero-nissan.png"
              alt=""
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 45vw"
              className="object-cover"
            />
          </div>
          {/* Figures set as a caption rather than a banner — quieter, reads as
              fact rather than advertising. */}
          <dl className="absolute -bottom-6 left-6 flex gap-8 rounded-2xl bg-[var(--surface-0)] px-7 py-5 shadow-[var(--shadow-lg)]">
            <div>
              <dd
                className="text-3xl font-normal"
                style={{ fontFamily: "var(--font-display-serif)" }}
              >
                {formatMilestone(stats.vehiclesSold, market.locale)}
              </dd>
              <dt className="mt-0.5 text-xs uppercase tracking-wider text-[var(--text-muted)]">
                Sold
              </dt>
            </div>
            <div>
              <dd
                className="text-3xl font-normal"
                style={{ fontFamily: "var(--font-display-serif)" }}
              >
                {stats.available}
              </dd>
              <dt className="mt-0.5 text-xs uppercase tracking-wider text-[var(--text-muted)]">
                In stock
              </dt>
            </div>
          </dl>
        </div>
      </section>

      {/* ── Services as an editorial list ──────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="border-t border-[var(--border-default)]">
          {SERVICES.map((s, i) => (
            <Link
              key={s.key}
              href={s.href(m)}
              className="group grid gap-4 border-b border-[var(--border-default)] py-10 sm:grid-cols-[auto_1fr_auto] sm:items-baseline sm:gap-10"
            >
              <span className="text-sm tabular-nums text-[var(--text-muted)]">
                0{i + 1}
              </span>
              <div>
                <h2
                  className="text-3xl font-normal transition-colors group-hover:text-[var(--brand-700)] sm:text-4xl"
                  style={{ fontFamily: "var(--font-display-serif)" }}
                >
                  {s.title}
                </h2>
                <p className="mt-3 max-w-xl leading-relaxed text-[var(--text-secondary)]">
                  {s.blurb}
                </p>
              </div>
              <span className="text-sm font-medium text-[var(--brand-700)] transition-transform group-hover:translate-x-1">
                {s.cta} →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Inventory ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="mb-10 flex items-end justify-between gap-6">
          <h2
            className="text-4xl font-normal"
            style={{ fontFamily: "var(--font-display-serif)" }}
          >
            Available now
          </h2>
          <Link
            href={`/${m}/inventory`}
            className="whitespace-nowrap border-b border-current pb-0.5 text-sm font-medium hover:text-[var(--brand-700)]"
          >
            View all
          </Link>
        </div>

        {vehicles.length ? (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => (
              <VehicleCard key={v.id} vehicle={v} market={market} />
            ))}
          </div>
        ) : (
          <EmptyInventory market={m} />
        )}
      </section>

      {/* ── Calculator ─────────────────────────────────────────────────── */}
      <section className="border-y border-[var(--border-default)] bg-[var(--surface-1)]">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="mb-10 max-w-xl">
            <h2
              className="text-4xl font-normal"
              style={{ fontFamily: "var(--font-display-serif)" }}
            >
              Work out the payment
            </h2>
            <p className="mt-3 text-[var(--text-secondary)]">
              Before you speak to anyone. The maths here is the same maths we use
              on paper.
            </p>
          </div>
          <PaymentCalculator market={market} tone="light" />
        </div>
      </section>

      {/* ── Reasons ────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <h2
          className="mb-12 max-w-lg text-4xl font-normal leading-tight"
          style={{ fontFamily: "var(--font-display-serif)" }}
        >
          Why people buy from us twice
        </h2>
        <div className="grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {reasons(m).map((r) => (
            <div key={r.title}>
              <h3 className="font-semibold">{r.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                {r.blurb}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Referral + closing CTA ─────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="grid gap-10 rounded-[2rem] bg-[var(--brand-900)] p-10 text-white sm:p-14 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-400)]">
              Referral programme
            </p>
            <h2
              className="mt-4 text-4xl font-normal leading-tight"
              style={{ fontFamily: "var(--font-display-serif)" }}
            >
              {REFERRAL.title}
            </h2>
            <p className="mt-4 max-w-md leading-relaxed text-white/75">
              {REFERRAL.blurb}
            </p>
          </div>
          <div className="text-center lg:text-right">
            <div
              className="text-6xl font-normal text-[var(--accent-400)]"
              style={{ fontFamily: "var(--font-display-serif)" }}
            >
              {REFERRAL.rate}%
            </div>
            <p className="mt-1 text-sm text-white/60">on every completed sale</p>
            <Link
              href={`/${m}/contact?type=contact`}
              className="mt-6 inline-block rounded-full bg-white px-7 py-3 font-semibold text-[var(--brand-900)] hover:bg-white/90"
            >
              Become a partner
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export function EmptyInventory({ market }: { market: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border-default)] px-6 py-20 text-center">
      <p className="font-medium">Inventory is being loaded.</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--text-muted)]">
        Tell us what you are looking for and we will call you when it lands.
      </p>
      <Link
        href={`/${market}/contact`}
        className="mt-6 inline-block rounded-full bg-[var(--cta-bg)] px-6 py-2.5 text-sm font-semibold text-[var(--cta-fg)]"
      >
        Tell us what you want
      </Link>
    </div>
  );
}
