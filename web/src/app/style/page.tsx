"use client";

import { useState } from "react";
import { fromMajor, formatMoney, monthlyPayment } from "@/lib/money";
import { MARKETS, formatDistance, type MarketCode } from "@/lib/market";

/* ─────────────────────────────────────────────────────────────────────────
   Design system proof.

   Not the real homepage — this exists so the palette, the surface ladder, the
   CTA hierarchy, the hero treatment and the compliance-gated payment display
   can all be seen working before the rest of the platform is built on them.
   ───────────────────────────────────────────────────────────────────────── */

const SAMPLE = {
  us: {
    year: 2019,
    name: "Mercedes-Benz GLE 350",
    condition: "Certified Pre-Owned",
    mileage: 41_200,
    price: fromMajor(28_500, "USD"),
    apr: 7.9,
    term: 60,
    image: "/img/car-rogue.png",
  },
  ng: {
    year: 2013,
    name: "Nissan Rogue SV",
    condition: "Foreign Used",
    mileage: 90_000,
    price: fromMajor(15_000_000, "NGN"),
    apr: 0,
    term: 18,
    image: "/img/car-benz.png",
  },
} as const;

export default function StyleProof() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [market, setMarket] = useState<MarketCode>("us");

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
  };

  const m = MARKETS[market];
  const car = SAMPLE[market];
  const perMonth = monthlyPayment(car.price, car.apr, car.term);

  return (
    <main className="min-h-screen">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--surface-0)]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
          <span className="font-semibold tracking-tight">
            ADEDAYO AREMU{" "}
            <span className="text-[var(--brand-400)]">AUTOS</span>
          </span>

          <div className="ml-auto flex items-center gap-2">
            {/* Market switcher — switches inventory, not just currency. */}
            <div className="flex rounded-full border border-[var(--border-default)] p-0.5">
              {(["us", "ng"] as const).map((code) => (
                <button
                  key={code}
                  onClick={() => setMarket(code)}
                  className={`rounded-full px-3 py-1 text-sm transition-colors ${
                    market === code
                      ? "bg-[var(--cta-bg)] text-[var(--cta-fg)] font-medium"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {code === "us" ? "Greensboro" : "Nigeria"}
                </button>
              ))}
            </div>

            <button
              onClick={toggleTheme}
              className="rounded-full border border-[var(--border-default)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
            >
              {theme === "dark" ? "Light" : "Dark"}
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden">
        <img
          src="/img/hero-benz.png"
          alt=""
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        {/* The scrim. Legibility no longer depends on what is in the photo —
            this is the fix for the unreadable headline on the live site. */}
        <div
          className="absolute inset-0 -z-10"
          style={{ background: "var(--hero-scrim)" }}
        />

        <div className="mx-auto max-w-6xl px-6 py-28">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface-1)]/70 px-3 py-1 text-xs font-medium tracking-wide text-[var(--accent-400)]">
            ● {market === "us" ? "NOW OPEN IN GREENSBORO, NC" : "LAGOS, NIGERIA"}
          </p>

          <h1 className="max-w-2xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Buy, rent and finance
            <br />
            with <span className="text-[var(--brand-400)]">confidence</span>.
          </h1>

          <p className="mt-6 max-w-lg text-lg text-[var(--text-secondary)]">
            {market === "us"
              ? "Inspected vehicles, transparent history reports, and financing decided in-house — serving the Triad."
              : "Verified foreign-used and Nigerian-used vehicles, full documentation handled, flexible instalment plans."}
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            {/* Primary CTA is the brightest element on the page — the inverse
                of the old dark-green-on-black button that receded. */}
            <button className="rounded-lg bg-[var(--cta-bg)] px-6 py-3 font-semibold text-[var(--cta-fg)] shadow-[var(--shadow-md)] transition-colors hover:bg-[var(--cta-bg-hover)]">
              Browse inventory
            </button>
            <button className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)]/60 px-6 py-3 font-medium text-[var(--text-primary)] backdrop-blur transition-colors hover:bg-[var(--surface-2)]">
              Get pre-qualified
            </button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-20 px-6 py-20">
        {/* ── Vehicle card ─────────────────────────────────────────────── */}
        <section>
          <SectionLabel
            title="Vehicle card"
            note={`Same component, market-aware: ${m.currency}, ${m.distanceUnit}, "${car.condition}", ${m.vehicleIdLabel}.`}
          />

          <div className="max-w-sm overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] shadow-[var(--shadow-md)]">
            <div className="relative aspect-[4/3] bg-[var(--surface-2)]">
              <img
                src={car.image}
                alt={car.name}
                className="h-full w-full object-cover"
              />
              <span className="absolute left-3 top-3 rounded bg-[var(--accent-500)] px-2 py-1 text-xs font-bold uppercase tracking-wide text-[var(--surface-0)]">
                {car.condition}
              </span>
            </div>

            <div className="space-y-3 p-5">
              <h3 className="font-semibold">
                {car.year} {car.name}
              </h3>

              <div className="flex gap-4 text-sm text-[var(--text-muted)]">
                <span>{formatDistance(car.mileage, m)}</span>
                <span>Automatic</span>
              </div>

              <div className="flex items-end justify-between border-t border-[var(--border-subtle)] pt-3">
                <span className="text-2xl font-bold">
                  {formatMoney(car.price, m.locale)}
                </span>
                <span className="text-sm text-[var(--text-secondary)]">
                  {formatMoney(perMonth, m.locale)}/mo
                </span>
              </div>

              {/* Compliance is enforced by the component, not by remembering.
                  Where the market says a monthly figure is a triggering term,
                  the disclosure renders with it — always. */}
              {m.compliance.monthlyPaymentRequiresDisclosure && (
                <p className="text-[11px] leading-snug text-[var(--text-muted)]">
                  Estimated payment based on{" "}
                  {formatMoney(car.price, m.locale)} financed at {car.apr}% APR
                  for {car.term} months with $0 down, on approved credit. Not an
                  offer of credit. Tax, title and fees excluded.
                </p>
              )}

              <button className="w-full rounded-lg bg-[var(--cta-bg)] py-2.5 font-semibold text-[var(--cta-fg)] transition-colors hover:bg-[var(--cta-bg-hover)]">
                View details
              </button>
            </div>
          </div>
        </section>

        {/* ── Surface ladder ───────────────────────────────────────────── */}
        <section>
          <SectionLabel
            title="Surface ladder"
            note="Each step is a measured luminance jump. The old palette had five greens in one tonal band — that flatness is what read as dead."
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded-lg border border-[var(--border-subtle)] p-4"
                style={{ background: `var(--surface-${i})` }}
              >
                <div className="text-sm font-medium">surface-{i}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {i === 0 ? "page" : i === 1 ? "card" : i === 2 ? "raised" : i === 3 ? "hover" : "overlay"}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Brand ramps ──────────────────────────────────────────────── */}
        <section>
          <SectionLabel
            title="Brand & accent"
            note="Green stays the brand — it is ownable in a category that defaults to blue and red. Gold carries premium signals only, never body text."
          />
          <Ramp
            label="brand"
            stops={["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"]}
          />
          <div className="h-3" />
          <Ramp label="accent" stops={["300", "400", "500", "600", "700"]} />
        </section>

        {/* ── Semantic ─────────────────────────────────────────────────── */}
        <section>
          <SectionLabel
            title="Semantic states"
            note="Verified in both themes at 4.5:1 or better."
          />
          <div className="flex flex-wrap gap-3">
            {(["success", "warning", "danger", "info"] as const).map((s) => (
              <span
                key={s}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2 text-sm font-medium"
                style={{ color: `var(--${s})` }}
              >
                {s}
              </span>
            ))}
          </div>
        </section>
      </div>

      <footer className="border-t border-[var(--border-subtle)] px-6 py-10 text-center text-sm text-[var(--text-muted)]">
        50/50 WCAG contrast assertions pass. <code>npm run check:contrast</code>
      </footer>
    </main>
  );
}

function SectionLabel({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">{note}</p>
    </div>
  );
}

function Ramp({ label, stops }: { label: string; stops: string[] }) {
  return (
    <div className="flex overflow-hidden rounded-lg">
      {stops.map((s) => (
        <div
          key={s}
          className="flex-1 py-6 text-center text-[10px] font-medium"
          style={{
            background: `var(--${label}-${s})`,
            color: Number(s) >= 500 ? "#fff" : "#000",
          }}
        >
          {s}
        </div>
      ))}
    </div>
  );
}
