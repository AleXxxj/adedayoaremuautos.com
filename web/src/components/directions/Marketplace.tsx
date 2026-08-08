import Link from "next/link";
import Image from "next/image";
import { jakarta, inter } from "@/lib/fonts";
import { SERVICES, reasons, REFERRAL } from "@/lib/content";
import { PaymentCalculator } from "@/components/PaymentCalculator";
import { VehicleCard } from "@/components/VehicleCard";
import { formatMilestone, type SiteStats } from "@/lib/stats";
import { EmptyInventory } from "./Showroom";
import type { MarketConfig } from "@/lib/market";
import type { Vehicle } from "@/db/schema";

/**
 * DIRECTION C — "Marketplace"
 *
 * Function-first. The page opens with a working search rather than a slogan,
 * because someone arriving at a dealership site usually already knows roughly
 * what they want. Denser, more utility per screen, closer to how people
 * actually shop for cars online.
 *
 * The search and filter chips are real: they submit to /inventory with query
 * parameters, so every one is a shareable, indexable URL.
 */
export function Marketplace({
  market,
  stats,
  vehicles,
  makes,
}: {
  market: MarketConfig;
  stats: SiteStats;
  vehicles: (Vehicle & { primaryImage?: string | null })[];
  makes: string[];
}) {
  const m = market.code;
  const priceBands =
    market.currency === "USD"
      ? [
          { label: "Under $15k", max: 1_500_000 },
          { label: "$15k–30k", min: 1_500_000, max: 3_000_000 },
          { label: "$30k+", min: 3_000_000 },
        ]
      : [
          { label: "Under ₦10m", max: 1_000_000_000 },
          { label: "₦10m–25m", min: 1_000_000_000, max: 2_500_000_000 },
          { label: "₦25m+", min: 2_500_000_000 },
        ];

  return (
    <div
      data-theme="light"
      className={`${jakarta.variable} ${inter.variable} bg-[var(--surface-0)] text-[var(--text-primary)]`}
      style={{ fontFamily: "var(--font-body)" }}
    >
      {/* ── Search-first hero ──────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden border-b border-[var(--border-default)] bg-[var(--brand-900)]">
        <Image
          src="/img/hero-wide.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover opacity-25"
        />
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
          <h1
            className="max-w-3xl text-[clamp(2rem,4.5vw,3.25rem)] font-extrabold leading-[1.05] tracking-[-0.025em] text-white"
            style={{ fontFamily: "var(--font-display-commercial)" }}
          >
            {stats.available > 0
              ? `${stats.available} vehicle${stats.available === 1 ? "" : "s"} ready to drive`
              : "Find your next vehicle"}
            <span className="text-[var(--accent-400)]">.</span>
          </h1>
          <p className="mt-3 max-w-xl text-white/70">
            {m === "us"
              ? "Buy, rent or finance in Greensboro. Inspected, documented, priced in USD."
              : "Buy, rent or finance across Nigeria. Verified, documented, priced in Naira."}
          </p>

          {/* Real search. GET, so results are linkable. */}
          <form
            action={`/${m}/inventory`}
            className="mt-8 flex flex-col gap-2 rounded-2xl bg-white p-2 shadow-[var(--shadow-lg)] sm:flex-row"
          >
            <input
              name="q"
              placeholder="Make or model — e.g. Toyota, GLE, Camry"
              className="flex-1 rounded-xl px-4 py-3 text-[var(--text-primary)] outline-none placeholder:text-neutral-400"
              aria-label="Search make or model"
            />
            <select
              name="condition"
              className="rounded-xl px-4 py-3 text-[var(--text-primary)] outline-none sm:w-52"
              aria-label="Condition"
              defaultValue=""
            >
              <option value="">Any condition</option>
              {market.conditions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-xl bg-[var(--cta-bg)] px-8 py-3 font-bold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)]"
            >
              Search
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-white/50">
              Popular
            </span>
            {priceBands.map((b) => {
              const qs = new URLSearchParams();
              if (b.min) qs.set("minPrice", String(b.min));
              if (b.max) qs.set("maxPrice", String(b.max));
              return (
                <Link
                  key={b.label}
                  href={`/${m}/inventory?${qs}`}
                  className="rounded-full border border-white/25 px-3 py-1 text-sm text-white/85 hover:bg-white/10"
                >
                  {b.label}
                </Link>
              );
            })}
            {makes.slice(0, 4).map((mk) => (
              <Link
                key={mk}
                href={`/${m}/inventory?make=${encodeURIComponent(mk)}`}
                className="rounded-full border border-white/25 px-3 py-1 text-sm text-white/85 hover:bg-white/10"
              >
                {mk}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust bar ──────────────────────────────────────────────────── */}
      <section className="border-b border-[var(--border-default)] bg-[var(--surface-1)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-6 py-5 text-sm">
          <Trust value={formatMilestone(stats.vehiclesSold, market.locale)} label="vehicles sold" />
          <Trust value="Inspected" label="before every listing" />
          <Trust value={market.code === "us" ? "In-house" : "6–24 mo"} label="financing" />
          <Trust value="Same day" label="response during hours" />
        </div>
      </section>

      {/* ── Inventory immediately ──────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className="mb-6 flex items-end justify-between gap-6">
          <div>
            <h2
              className="text-2xl font-extrabold tracking-tight"
              style={{ fontFamily: "var(--font-display-commercial)" }}
            >
              Latest arrivals
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Updated the moment a vehicle is listed.
            </p>
          </div>
          <Link
            href={`/${m}/inventory`}
            className="whitespace-nowrap rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface-2)]"
          >
            All inventory
          </Link>
        </div>
        {vehicles.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => (
              <VehicleCard key={v.id} vehicle={v} market={market} />
            ))}
          </div>
        ) : (
          <EmptyInventory market={m} />
        )}
      </section>

      {/* ── Calculator, framed as a tool ───────────────────────────────── */}
      <section className="border-y border-[var(--border-default)] bg-[var(--surface-1)]">
        <div className="mx-auto max-w-7xl px-6 py-14">
          <div className="mb-6">
            <h2
              className="text-2xl font-extrabold tracking-tight"
              style={{ fontFamily: "var(--font-display-commercial)" }}
            >
              Payment calculator
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Set your budget, then send it to us with one click.
            </p>
          </div>
          <PaymentCalculator market={market} tone="light" />
        </div>
      </section>

      {/* ── Services, compact ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-4 sm:grid-cols-3">
          {SERVICES.map((s) => (
            <Link
              key={s.key}
              href={s.href(m)}
              className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-1)] p-6 transition-shadow hover:shadow-[var(--shadow-md)]"
            >
              <h3
                className="text-lg font-extrabold tracking-tight"
                style={{ fontFamily: "var(--font-display-commercial)" }}
              >
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                {s.blurb}
              </p>
              <span className="mt-4 inline-block text-sm font-semibold text-[var(--link)]">
                {s.cta} →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Reasons, tight two-column ──────────────────────────────────── */}
      <section className="border-t border-[var(--border-default)]">
        <div className="mx-auto max-w-7xl px-6 py-14">
          <h2
            className="mb-8 text-2xl font-extrabold tracking-tight"
            style={{ fontFamily: "var(--font-display-commercial)" }}
          >
            What you get
          </h2>
          <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {reasons(m).map((r) => (
              <div key={r.title} className="flex gap-3">
                <span className="mt-1 shrink-0 text-[var(--success)]">✓</span>
                <div>
                  <h3 className="font-bold">{r.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                    {r.blurb}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Referral ───────────────────────────────────────────────────── */}
      <section className="bg-[var(--brand-900)]">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-6 py-12 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <h2
              className="text-2xl font-extrabold tracking-tight text-white"
              style={{ fontFamily: "var(--font-display-commercial)" }}
            >
              {REFERRAL.title} — {REFERRAL.rate}%
            </h2>
            <p className="mt-1 max-w-xl text-sm text-white/70">{REFERRAL.blurb}</p>
          </div>
          <Link
            href={`/${m}/contact`}
            className="shrink-0 rounded-xl bg-[var(--accent-500)] px-7 py-3 font-bold text-[var(--brand-900)] hover:bg-[var(--accent-400)]"
          >
            Become a partner
          </Link>
        </div>
      </section>
    </div>
  );
}

function Trust({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-extrabold">{value}</span>
      <span className="text-[var(--text-muted)]">{label}</span>
    </div>
  );
}
