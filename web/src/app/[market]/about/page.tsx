import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode } from "@/lib/market";
import { FOUNDER_STORY, MISSION, VISION, VALUES, WHY_US } from "@/content/site";
import { getSiteStats, formatMilestone } from "@/lib/stats";
import { listLocations, summariseHours, formatPhone, type OpeningHour } from "@/lib/repositories/locations";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  return {
    title: "About — Adedayo Aremu Autos",
    description:
      "The story behind Adedayo Aremu Autos, and how we work.",
    alternates: {
      canonical: `/${market}/about`,
      languages: { "en-US": "/us/about", "en-NG": "/ng/about" },
    },
  };
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();
  const market = MARKETS[code];

  const [stats, sites] = await Promise.all([getSiteStats(code), listLocations(code)]);
  const site = sites[0];

  return (
    <div>
      <header className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight">
            Built on transparency, quality and long-term relationships.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-[var(--text-secondary)]">
            {code === "us"
              ? "Adedayo Aremu Autos sells, hires and finances vehicles from Greensboro, North Carolina."
              : "Adedayo Aremu Autos sells, hires and finances vehicles across Nigeria."}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-14">
        {/* ── Founder ──────────────────────────────────────────────────── */}
        <section className="mb-16 grid gap-10 lg:grid-cols-[280px_1fr]">
          <div>
            <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/img/ceo.png"
                alt="Adedayo Aremu, Founder and CEO"
                className="aspect-[4/5] w-full object-cover"
              />
            </div>
            <p className="mt-3 font-semibold">Adedayo Aremu</p>
            <p className="text-sm text-[var(--text-muted)]">Founder &amp; CEO</p>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight">The founder&rsquo;s story</h2>
            <div className="mt-5 space-y-4 leading-relaxed text-[var(--text-secondary)]">
              {FOUNDER_STORY.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        </section>

        {/* ── Live figures ─────────────────────────────────────────────── */}
        <section className="mb-16 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Figure
            value={formatMilestone(stats.vehiclesSold, market.locale)}
            label="Vehicles sold"
            note="Counted live as each sale completes"
          />
          <Figure
            value={String(stats.available)}
            label="Available now"
            note={`In ${market.name}`}
          />
          <Figure
            value={code === "us" ? "Greensboro, NC" : "Nigeria"}
            label="Where we are"
            note={site ? site.addressLine1 : "Contact us for an appointment"}
          />
        </section>

        {/* ── Mission & vision ─────────────────────────────────────────── */}
        <section className="mb-16 grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-7">
            <h2 className="text-lg font-bold tracking-tight">Mission</h2>
            <p className="mt-3 leading-relaxed text-[var(--text-secondary)]">{MISSION}</p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-7">
            <h2 className="text-lg font-bold tracking-tight">Vision</h2>
            <p className="mt-3 leading-relaxed text-[var(--text-secondary)]">{VISION}</p>
          </div>
        </section>

        {/* ── Values ───────────────────────────────────────────────────── */}
        <section className="mb-16">
          <h2 className="mb-2 text-2xl font-bold tracking-tight">Our values</h2>
          <p className="mb-7 text-[var(--text-secondary)]">
            The principles that guide everything we do.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map((v) => (
              <div
                key={v.title}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5"
              >
                <h3 className="font-semibold text-[var(--brand-400)]">{v.title}</h3>
                <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{v.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Why us ───────────────────────────────────────────────────── */}
        <section className="mb-16">
          <h2 className="mb-7 text-2xl font-bold tracking-tight">How we work</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WHY_US[code].map((w) => (
              <div
                key={w.title}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5"
              >
                <h3 className="font-semibold">{w.title}</h3>
                <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{w.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Visit ────────────────────────────────────────────────────── */}
        {site && (
          <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-8">
            <h2 className="text-xl font-bold tracking-tight">Come and see us</h2>
            <address className="mt-3 not-italic text-[var(--text-secondary)]">
              {site.addressLine1}
              <br />
              {site.city}
              {site.region && <>, {site.region}</>} {site.postalCode}
            </address>
            {summariseHours(site.hours as OpeningHour[] | null, market.locale) && (
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {summariseHours(site.hours as OpeningHour[] | null, market.locale)}
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              {site.phone && (
                <a
                  href={`tel:${site.phone}`}
                  className="rounded-lg bg-[var(--cta-bg)] px-6 py-3 font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)]"
                >
                  Call {formatPhone(site.phone)}
                </a>
              )}
              <Link
                href={`/${code}/contact`}
                className="rounded-lg border border-[var(--border-strong)] px-6 py-3 font-medium hover:bg-[var(--surface-2)]"
              >
                Send a message
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Figure({ value, label, note }: { value: string; label: string; note: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-5 py-6">
      <div className="text-2xl font-bold tracking-tight sm:text-3xl">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className="mt-2 text-xs text-[var(--text-muted)]">{note}</div>
    </div>
  );
}
