import Link from "next/link";
import Image from "next/image";
import { spaceGrotesk, inter } from "@/lib/fonts";
import { SERVICES, reasons, REFERRAL } from "@/lib/content";
import { PaymentCalculator } from "@/components/PaymentCalculator";
import { VehicleCard } from "@/components/VehicleCard";
import { formatMilestone, type SiteStats } from "@/lib/stats";
import { EmptyInventory } from "./Showroom";
import type { MarketConfig } from "@/lib/market";
import type { Vehicle } from "@/db/schema";

/**
 * DIRECTION B — "Night Drive"
 *
 * Dark, but properly built this time. The old site's problem was not darkness —
 * it was that everything sat in one flat tonal band with no chroma. Here the
 * surface ladder does real work, there is a saturated accent, and the type is a
 * technical geometric sans that reads engineered rather than generic.
 *
 * Reference points: car configurators and instrument clusters.
 */
export function NightDrive({
  market,
  stats,
  vehicles,
}: {
  market: MarketConfig;
  stats: SiteStats;
  vehicles: (Vehicle & { primaryImage?: string | null })[];
}) {
  const m = market.code;

  return (
    <div
      data-theme="dark"
      className={`${spaceGrotesk.variable} ${inter.variable} bg-[var(--surface-0)] text-[var(--text-primary)]`}
      style={{ fontFamily: "var(--font-body)" }}
    >
      {/* ── Hero: full-bleed with a hard vertical scrim ─────────────────── */}
      <section className="relative isolate min-h-[88vh] overflow-hidden">
        <Image
          src="/img/hero-benz.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover"
        />
        {/* Two-layer treatment: a linear scrim for legibility plus a radial
            brand glow, so the image is composed rather than merely darkened. */}
        <div
          className="absolute inset-0 -z-10"
          style={{ background: "var(--hero-scrim)" }}
        />
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(120% 80% at 15% 110%, rgb(21 150 79 / 0.35) 0%, transparent 60%)",
          }}
        />

        <div className="mx-auto flex min-h-[88vh] max-w-7xl flex-col justify-end px-6 pb-20 pt-32">
          <div className="mb-6 flex items-center gap-3">
            <span className="size-2 animate-pulse rounded-full bg-[var(--brand-400)]" />
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
              {m === "us" ? "Greensboro, NC" : "Nigeria"} · Open Mon–Sat
            </span>
          </div>

          <h1
            className="max-w-4xl text-[clamp(2.5rem,7vw,5.5rem)] font-bold uppercase leading-[0.92] tracking-[-0.03em]"
            style={{ fontFamily: "var(--font-display-technical)" }}
          >
            Drive it
            <br />
            <span className="text-[var(--brand-400)]">before</span> you
            <br />
            commit to it.
          </h1>

          <p className="mt-8 max-w-md text-lg text-[var(--text-secondary)]">
            {m === "us"
              ? "Every vehicle inspected, every history report in the open, every payment worked out before you sign."
              : "Foreign-used and Nigerian-used, verified and documented, on instalment plans that make sense."}
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href={`/${m}/inventory`}
              className="rounded-lg bg-[var(--cta-bg)] px-7 py-3.5 font-semibold text-[var(--cta-fg)] shadow-[var(--shadow-lg)] transition-colors hover:bg-[var(--cta-bg-hover)]"
            >
              Browse inventory
            </Link>
            <Link
              href={`/${m}/contact?type=test_drive`}
              className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)]/50 px-7 py-3.5 font-medium backdrop-blur transition-colors hover:bg-[var(--surface-2)]"
            >
              Book a test drive
            </Link>
          </div>
        </div>
      </section>

      {/* ── Instrument-cluster stat strip ──────────────────────────────── */}
      <section className="border-y border-[var(--border-subtle)] bg-[var(--surface-1)]">
        <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-[var(--border-subtle)] sm:grid-cols-4">
          {[
            [formatMilestone(stats.vehiclesSold, market.locale), "Vehicles sold"],
            [String(stats.available), "Available now"],
            [market.currency, "Priced in"],
            [m === "us" ? "Mon–Sat 6–6" : "Mon–Sat", "Opening hours"],
          ].map(([value, label]) => (
            <div key={label} className="bg-[var(--surface-1)] px-6 py-8">
              <dd
                className="text-3xl font-bold tabular-nums tracking-tight"
                style={{ fontFamily: "var(--font-display-technical)" }}
              >
                {value}
              </dd>
              <dt className="mt-1 text-[11px] font-medium uppercase tracking-[0.15em] text-[var(--text-muted)]">
                {label}
              </dt>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Services as glass cards ────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <h2
          className="mb-12 text-3xl font-bold uppercase tracking-tight sm:text-4xl"
          style={{ fontFamily: "var(--font-display-technical)" }}
        >
          Three ways in
        </h2>
        <div className="grid gap-5 lg:grid-cols-3">
          {SERVICES.map((s, i) => (
            <Link
              key={s.key}
              href={s.href(m)}
              className="group relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-8 transition-colors hover:border-[var(--brand-700)] hover:bg-[var(--surface-2)]"
            >
              <span
                className="absolute right-6 top-6 text-5xl font-bold text-[var(--surface-3)] transition-colors group-hover:text-[var(--brand-800)]"
                style={{ fontFamily: "var(--font-display-technical)" }}
              >
                0{i + 1}
              </span>
              <h3
                className="text-2xl font-bold uppercase tracking-tight"
                style={{ fontFamily: "var(--font-display-technical)" }}
              >
                {s.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                {s.blurb}
              </p>
              <span className="mt-6 inline-block text-sm font-semibold text-[var(--brand-400)]">
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
            className="text-3xl font-bold uppercase tracking-tight sm:text-4xl"
            style={{ fontFamily: "var(--font-display-technical)" }}
          >
            In stock
          </h2>
          <Link
            href={`/${m}/inventory`}
            className="whitespace-nowrap text-sm font-semibold text-[var(--brand-400)] hover:underline"
          >
            View all →
          </Link>
        </div>
        {vehicles.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => (
              <VehicleCard key={v.id} vehicle={v} market={market} />
            ))}
          </div>
        ) : (
          <EmptyInventory market={m} />
        )}
      </section>

      {/* ── Calculator ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <h2
          className="mb-3 text-3xl font-bold uppercase tracking-tight sm:text-4xl"
          style={{ fontFamily: "var(--font-display-technical)" }}
        >
          Run the numbers
        </h2>
        <p className="mb-10 max-w-lg text-[var(--text-secondary)]">
          Same amortisation our sales desk uses. Nothing rounded for effect.
        </p>
        <PaymentCalculator market={market} />
      </section>

      {/* ── Reasons ────────────────────────────────────────────────────── */}
      <section className="border-t border-[var(--border-subtle)] bg-[var(--surface-1)]">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <h2
            className="mb-12 text-3xl font-bold uppercase tracking-tight sm:text-4xl"
            style={{ fontFamily: "var(--font-display-technical)" }}
          >
            Why us
          </h2>
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {reasons(m).map((r, i) => (
              <div
                key={r.title}
                className="border-l-2 border-[var(--brand-700)] pl-5"
              >
                <span className="text-xs tabular-nums text-[var(--text-muted)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-1 font-semibold">{r.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {r.blurb}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Referral ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="relative overflow-hidden rounded-2xl border border-[var(--accent-700)] bg-[var(--surface-1)] p-10 sm:p-14">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(90% 120% at 100% 0%, rgb(245 179 36 / 0.12) 0%, transparent 55%)",
            }}
          />
          <div className="relative grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-400)]">
                Referral programme
              </p>
              <h2
                className="mt-4 text-3xl font-bold uppercase tracking-tight sm:text-4xl"
                style={{ fontFamily: "var(--font-display-technical)" }}
              >
                {REFERRAL.title}
              </h2>
              <p className="mt-4 max-w-md text-[var(--text-secondary)]">
                {REFERRAL.blurb}
              </p>
            </div>
            <div className="lg:text-right">
              <div
                className="text-6xl font-bold text-[var(--accent-400)]"
                style={{ fontFamily: "var(--font-display-technical)" }}
              >
                {REFERRAL.rate}%
              </div>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                on every completed sale
              </p>
              <Link
                href={`/${m}/contact`}
                className="mt-6 inline-block rounded-lg bg-[var(--accent-500)] px-7 py-3 font-semibold text-[var(--surface-0)] hover:bg-[var(--accent-400)]"
              >
                Become a partner
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
