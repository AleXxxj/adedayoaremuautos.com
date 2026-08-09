import Link from "next/link";
import { notFound } from "next/navigation";
import { MARKETS, isMarketCode } from "@/lib/market";
import { listInventory } from "@/lib/repositories/vehicles";
import { listLocations, formatPhone, summariseHours, type OpeningHour } from "@/lib/repositories/locations";
import { getSiteStats, formatMilestone } from "@/lib/stats";
import { articlesFor } from "@/content/articles";
import { formatMoney, money } from "@/lib/money";
import { Icon, IconBadge, type IconName } from "@/components/Icon";
import { VehicleShowcase } from "@/components/VehicleShowcase";

export const dynamic = "force-dynamic";

const MARQUES = [
  "Toyota", "Lexus", "Mercedes-Benz", "Honda", "BMW",
  "Nissan", "Land Rover", "Audi", "Ford", "Hyundai",
];

const WHY_ICONS: IconName[] = ["shield", "check", "wallet", "truck", "document", "headset"];

export default async function MarketHome({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();

  const market = MARKETS[code];
  const [{ vehicles, total }, stats, sites] = await Promise.all([
    listInventory(code, { limit: 5 }),
    getSiteStats(code),
    listLocations(code),
  ]);

  const site = sites[0];
  const articles = articlesFor(code).slice(0, 3);
  const [feature, ...rest] = vehicles;
  const lowest = vehicles
    .map((v) => v.priceMinor)
    .filter((p): p is number => p != null)
    .sort((a, b) => a - b)[0];

  const why = [
    { title: "Inspected before listing", body: code === "us" ? "Every vehicle is checked over before it reaches the site." : "Every vehicle is inspected before it is listed." },
    { title: code === "us" ? "History you can read" : "Documentation handled", body: code === "us" ? "The vehicle history report comes with the car, not on request." : "Customs papers and transfer of ownership sorted for you." },
    { title: "Financing in-house", body: code === "us" ? "You deal with us directly rather than being passed around." : "Instalment plans arranged in-house over 6 to 24 months." },
    { title: code === "us" ? "Serving the Triad" : "Nationwide delivery", body: code === "us" ? "Greensboro based, dealing locally and face to face." : "Delivered anywhere in the country, insured in transit." },
    { title: "Clear figures", body: "Price, fees and monthly payment set out in full before you commit." },
    { title: "After the sale", body: "We stay reachable once you have driven away." },
  ];

  return (
    <>
      {/* ══ HERO ═══════════════════════════════════════════════════════════ */}
      <section className="relative isolate grain flex min-h-[94svh] items-end overflow-hidden">
        <div className="absolute inset-0 -z-30 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/hero-benz.png" alt="" className="ken-burns h-full w-full object-cover" fetchPriority="high" />
        </div>
        <div className="absolute inset-0 -z-20" style={{ background: "var(--hero-scrim)" }} />
        <div className="vignette absolute inset-0 -z-20" />
        {/* Brand-tinted bloom in the corner stops the frame reading as grey. */}
        <div
          className="pointer-events-none absolute -left-40 top-1/4 -z-10 size-[36rem] rounded-full opacity-45 blur-[110px]"
          style={{ background: "radial-gradient(circle, var(--brand-700), transparent 65%)" }}
        />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-64" style={{ background: "linear-gradient(to top, var(--surface-0), transparent)" }} />

        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 pb-16 pt-40 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow reveal mb-7 flex items-center gap-3 text-[var(--accent-400)]">
              <span className="inline-block h-px w-12 bg-[var(--accent-500)]" />
              {code === "us" ? "Greensboro · North Carolina" : "Lagos · Nigeria"}
            </p>

            <h1 className="display reveal-up max-w-[16ch] text-[length:var(--display-xl)]">
              The car you want,
              <br />
              <span className="text-[var(--brand-400)]">without the theatre.</span>
            </h1>

            <p className="prose-body reveal-up mt-8 max-w-md text-lg text-[var(--text-secondary)]">
              {code === "us"
                ? "Inspected vehicles, history you can read for yourself, and financing decided in-house."
                : "Verified vehicles, documentation handled end to end, and instalment plans arranged in-house."}
            </p>

            <div className="reveal-up mt-10 flex flex-wrap items-center gap-3">
              <Link
                href={`/${code}/inventory`}
                className="arrow-slide inline-flex items-center gap-2.5 rounded-full bg-[var(--cta-bg)] px-7 py-3.5 font-semibold text-[var(--cta-fg)] shadow-[var(--shadow-lg)] transition-colors hover:bg-[var(--cta-bg-hover)]"
              >
                Browse inventory <Icon name="arrow" className="arrow size-4" />
              </Link>
              {/* Falls back to the contact page where a market has no location
                  on file — the hero should never render a lone button. */}
              {site?.phone ? (
                <a
                  href={`tel:${site.phone}`}
                  className="inline-flex items-center gap-2.5 rounded-full border border-white/20 bg-white/5 px-7 py-3.5 font-medium backdrop-blur-md transition-colors hover:bg-white/10"
                >
                  <Icon name="phone" className="size-4" />
                  {formatPhone(site.phone)}
                </a>
              ) : (
                <Link
                  href={`/${code}/contact`}
                  className="inline-flex items-center gap-2.5 rounded-full border border-white/20 bg-white/5 px-7 py-3.5 font-medium backdrop-blur-md transition-colors hover:bg-white/10"
                >
                  <Icon name="phone" className="size-4" />
                  Talk to us
                </Link>
              )}
            </div>
          </div>

          {/* Floating glass panel — gives the hero a second plane and puts a
              real number in front of the visitor immediately. */}
          <div className="reveal-scale hidden w-72 rounded-2xl border border-white/12 bg-white/[0.06] p-6 backdrop-blur-xl lg:block">
            <p className="eyebrow text-white/45">In stock now</p>
            <p className="display-sans mt-2 text-5xl tnum">{stats.available}</p>
            <div className="my-5 h-px bg-white/12" />
            {lowest != null ? (
              <>
                <p className="text-sm text-white/55">Starting from</p>
                <p className="mt-1 text-2xl font-bold tnum">
                  {formatMoney(money(lowest, market.currency), market.locale)}
                </p>
              </>
            ) : (
              <p className="text-sm text-white/55">New stock arriving weekly</p>
            )}
            <Link
              href={`/${code}/inventory`}
              className="arrow-slide mt-5 inline-flex items-center gap-2 text-sm font-medium text-[var(--brand-400)]"
            >
              See the collection <Icon name="arrow" className="arrow size-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ══ FEATURED VEHICLES — straight after the hero ════════════════════ */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="reveal mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow mb-3 flex items-center gap-2.5 text-[var(--text-muted)]">
              <Icon name="star" className="size-3.5 text-[var(--accent-500)]" /> The collection
            </p>
            <h2 className="display text-[length:var(--display-lg)]">Available now</h2>
          </div>
          {total > 0 && (
            <Link href={`/${code}/inventory`} className="arrow-slide inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] px-5 py-2.5 text-sm font-medium hover:bg-[var(--surface-2)]">
              View all {total} <Icon name="arrow" className="arrow size-4" />
            </Link>
          )}
        </div>

        {vehicles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-default)] px-6 py-20 text-center">
            <p className="display text-2xl">Inventory arriving shortly</p>
            <p className="mx-auto mt-3 max-w-sm text-sm text-[var(--text-muted)]">
              Tell us what you are looking for and we will source it before it reaches the site.
            </p>
            <Link href={`/${code}/contact`} className="mt-8 inline-block rounded-full bg-[var(--cta-bg)] px-7 py-3 text-sm font-semibold text-[var(--cta-fg)]">
              Tell us what you want
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-12">
            {feature && <VehicleShowcase v={feature} market={market} index={1} size="feature" />}
            {rest.slice(0, 2).map((v, i) => (
              <VehicleShowcase key={v.id} v={v} market={market} index={i + 2} />
            ))}
          </div>
        )}
      </section>

      {/* ══ MARQUEE ════════════════════════════════════════════════════════ */}
      <section className="marquee overflow-hidden border-y border-[var(--border-subtle)] py-6">
        <div className="marquee-track gap-12 pr-12">
          {[...MARQUES, ...MARQUES].map((m, i) => (
            <span key={i} className="display-sans shrink-0 text-xl text-[var(--text-muted)]/35" aria-hidden={i >= MARQUES.length}>
              {m}
            </span>
          ))}
        </div>
      </section>

      {/* ══ SERVICES ═══════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <p className="eyebrow reveal mb-3 text-[var(--text-muted)]">What we do</p>
        <h2 className="display reveal-up mb-14 max-w-2xl text-[length:var(--display-lg)]">
          Three ways to put you in the right car.
        </h2>

        <div className="stagger grid gap-5 md:grid-cols-3">
          {([
            { icon: "car", n: "01", t: "Buy", href: `/${code}/inventory`, cta: "Browse inventory",
              b: code === "us" ? "Inspected stock with the history report attached, priced with tax and fees shown before you commit." : "Verified foreign-used and Nigerian-used vehicles, with customs papers and transfer handled for you." },
            { icon: "key", n: "02", t: "Rent", href: `/${code}/rentals`, cta: "See the fleet",
              b: "Daily, weekly and monthly hire. Longer bookings are priced on the better rate automatically." },
            { icon: "wallet", n: "03", t: "Finance", href: `/${code}/financing`, cta: "Work out a payment",
              b: code === "us" ? "Arranged in-house, so you deal with us directly. Work out a payment before you speak to anyone." : "Instalment plans from 6 to 24 months. Work out a payment before you speak to anyone." },
          ] as const).map((s) => (
            <Link
              key={s.n}
              href={s.href}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-7 transition-all duration-500 hover:-translate-y-1.5 hover:border-[var(--brand-500)]/40 hover:bg-[var(--surface-2)]"
            >
              <span className="display-sans absolute right-6 top-5 text-5xl text-[var(--brand-500)]/12 tnum">{s.n}</span>
              <IconBadge name={s.icon} />
              <h3 className="display mt-5 text-2xl">{s.t}</h3>
              <p className="prose-body mt-3 flex-1 text-sm text-[var(--text-secondary)]">{s.b}</p>
              <span className="arrow-slide mt-6 inline-flex items-center gap-2 text-sm font-medium text-[var(--link)]">
                {s.cta} <Icon name="arrow" className="arrow size-4" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ══ FIGURES ════════════════════════════════════════════════════════ */}
      <section className="border-y border-[var(--border-subtle)] bg-[var(--surface-1)]">
        <dl className="stagger mx-auto grid max-w-6xl grid-cols-2 gap-px bg-[var(--border-subtle)] md:grid-cols-4">
          {[
            { v: formatMilestone(stats.vehiclesSold, market.locale), l: "Vehicles sold" },
            { v: String(stats.available), l: "Available now" },
            { v: code === "us" ? "In-house" : "6–24 mo", l: "Financing" },
            { v: code === "us" ? "The Triad" : "Nationwide", l: "We deliver" },
          ].map((f) => (
            <div key={f.l} className="bg-[var(--surface-1)] px-6 py-11">
              <dd className="display-sans text-4xl tracking-tight tnum sm:text-5xl">{f.v}</dd>
              <dt className="eyebrow mt-2.5 text-[var(--text-muted)]">{f.l}</dt>
            </div>
          ))}
        </dl>
      </section>

      {/* ══ FOUNDER ════════════════════════════════════════════════════════ */}
      <section className="relative isolate grain overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 lg:grid-cols-[440px_1fr]">
          <div className="reveal-scale relative overflow-hidden rounded-2xl border border-[var(--border-subtle)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/ceo.png" alt="Adedayo Aremu, Founder and CEO" className="aspect-[4/5] w-full object-cover" loading="lazy" />
            <div className="vignette absolute inset-0" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-6 pt-16">
              <p className="text-lg font-semibold text-white">Adedayo Aremu</p>
              <p className="text-sm text-white/60">Founder &amp; Chief Executive</p>
            </div>
          </div>

          <div className="reveal-up">
            <p className="eyebrow mb-6 text-[var(--text-muted)]">The founder</p>
            <blockquote className="display text-[length:var(--display-md)] leading-[1.12]">
              <span className="text-[var(--brand-400)]">&ldquo;</span>Rather than
              simply facilitating vehicle transactions, we deliver solutions that
              align with what the customer actually needs — and what they can
              actually afford.<span className="text-[var(--brand-400)]">&rdquo;</span>
            </blockquote>
            <div className="rule-fade my-9" />
            <p className="prose-body max-w-xl text-[var(--text-secondary)]">
              Adedayo Aremu Autos was built around transparency, quality assurance
              and long-term client relationships — a dealership run on
              professionalism rather than pressure.
            </p>
            <Link href={`/${code}/about`} className="arrow-slide mt-7 inline-flex items-center gap-2 text-sm font-medium text-[var(--link)]">
              Read the full story <Icon name="arrow" className="arrow size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ══ WHY US ═════════════════════════════════════════════════════════ */}
      <section className="border-y border-[var(--border-subtle)] bg-[var(--surface-1)]">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="display reveal-up mb-14 max-w-xl text-[length:var(--display-lg)]">
            Why people buy from us twice.
          </h2>
          <div className="stagger grid gap-x-10 gap-y-11 sm:grid-cols-2 lg:grid-cols-3">
            {why.map((w, i) => (
              <div key={w.title} className="flex gap-4">
                <IconBadge name={WHY_ICONS[i]} />
                <div>
                  <h3 className="font-semibold leading-snug">{w.title}</h3>
                  <p className="prose-body mt-1.5 text-sm text-[var(--text-secondary)]">{w.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ GUIDES ═════════════════════════════════════════════════════════ */}
      {articles.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="reveal mb-10 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="eyebrow mb-3 text-[var(--text-muted)]">Guides</p>
              <h2 className="display text-[length:var(--display-lg)]">Worth reading first</h2>
            </div>
            <Link href={`/${code}/blog`} className="arrow-slide inline-flex items-center gap-2 text-sm font-medium text-[var(--link)]">
              All guides <Icon name="arrow" className="arrow size-4" />
            </Link>
          </div>

          <div className="stagger grid gap-5 md:grid-cols-3">
            {articles.map((a) => (
              <Link
                key={a.slug}
                href={`/${code}/blog/${a.slug}`}
                className="group flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-7 transition-all duration-500 hover:-translate-y-1.5 hover:border-[var(--brand-500)]/40"
              >
                <span className="eyebrow text-[var(--accent-400)]">{a.category}</span>
                <h3 className="mt-3 text-lg font-semibold leading-snug group-hover:text-[var(--link)]">{a.title}</h3>
                <p className="prose-body mt-3 flex-1 text-sm text-[var(--text-secondary)]">
                  {a.excerpt.slice(0, 120)}…
                </p>
                <span className="mt-5 inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <Icon name="clock" className="size-3.5" /> {a.readMinutes} min read
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ══ CLOSING ════════════════════════════════════════════════════════ */}
      <section className="bloom grain relative isolate overflow-hidden border-t border-[var(--border-subtle)]">
        <div className="mx-auto max-w-5xl px-6 py-28">
          <div className="grid gap-12 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <h2 className="display reveal-up text-[length:var(--display-lg)]">
                Come and see the car in person.
              </h2>
              <p className="prose-body reveal-up mt-6 max-w-md text-[var(--text-secondary)]">
                Call ahead and we will have it out front, cleaned and ready to drive.
              </p>
              <div className="reveal-up mt-9 flex flex-wrap gap-3">
                <Link href={`/${code}/contact`} className="arrow-slide inline-flex items-center gap-2.5 rounded-full bg-[var(--cta-bg)] px-8 py-4 font-semibold text-[var(--cta-fg)] shadow-[var(--shadow-lg)] hover:bg-[var(--cta-bg-hover)]">
                  Book a viewing <Icon name="arrow" className="arrow size-4" />
                </Link>
                {site?.phone && (
                  <a href={`tel:${site.phone}`} className="inline-flex items-center gap-2.5 rounded-full border border-[var(--border-strong)] px-8 py-4 font-medium hover:bg-[var(--surface-2)]">
                    <Icon name="phone" className="size-4" /> {formatPhone(site.phone)}
                  </a>
                )}
              </div>
            </div>

            {site && (
              <address className="reveal not-italic">
                <p className="eyebrow mb-4 text-[var(--text-muted)]">Where to find us</p>
                <p className="flex items-start gap-2.5 text-[var(--text-secondary)]">
                  <Icon name="pin" className="mt-0.5 size-4 shrink-0 text-[var(--brand-400)]" />
                  <span>
                    {site.addressLine1}
                    <br />
                    {site.city}
                    {site.region && <>, {site.region}</>} {site.postalCode}
                  </span>
                </p>
                {summariseHours(site.hours as OpeningHour[] | null, market.locale) && (
                  <p className="mt-3 flex items-center gap-2.5 text-sm text-[var(--text-muted)]">
                    <Icon name="clock" className="size-4 shrink-0 text-[var(--brand-400)]" />
                    {summariseHours(site.hours as OpeningHour[] | null, market.locale)}
                  </p>
                )}
              </address>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
