import Link from "next/link";
import { notFound } from "next/navigation";
import { MARKETS, isMarketCode, formatDistance } from "@/lib/market";
import { listInventory } from "@/lib/repositories/vehicles";
import { listLocations, formatPhone } from "@/lib/repositories/locations";
import { getSiteStats, formatMilestone } from "@/lib/stats";
import { WHY_US } from "@/content/site";
import { formatMoney, money } from "@/lib/money";
import { mediaUrl } from "@/lib/media";

export const dynamic = "force-dynamic";

/** Marques we deal in. Carried over from the legacy footer. */
const MARQUES = [
  "Toyota", "Lexus", "Mercedes-Benz", "Honda", "BMW",
  "Nissan", "Land Rover", "Audi", "Ford", "Hyundai",
];

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
  const fmt = (m: number) => formatMoney(money(m, market.currency), market.locale);
  const [lead, ...rest] = vehicles;

  return (
    <>
      {/* ══ HERO ═══════════════════════════════════════════════════════════ */}
      <section className="relative isolate grain flex min-h-[92svh] items-end overflow-hidden">
        <div className="absolute inset-0 -z-20 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/img/hero-benz.png"
            alt=""
            className="ken-burns h-full w-full object-cover"
            fetchPriority="high"
          />
        </div>

        {/* Two scrims rather than one: a directional wash for text legibility,
            and a vignette so the frame reads as a photograph. */}
        <div className="absolute inset-0 -z-10" style={{ background: "var(--hero-scrim)" }} />
        <div className="vignette absolute inset-0 -z-10" />
        <div
          className="absolute inset-x-0 bottom-0 -z-10 h-52"
          style={{ background: "linear-gradient(to top, var(--surface-0), transparent)" }}
        />

        <div className="mx-auto w-full max-w-6xl px-6 pb-20 pt-40">
          <p className="eyebrow reveal mb-6 flex items-center gap-3 text-[var(--accent-400)]">
            <span className="inline-block h-px w-10 bg-[var(--accent-500)]" />
            {code === "us" ? "Greensboro · North Carolina" : "Nigeria"}
          </p>

          <h1 className="display reveal-up max-w-4xl text-[length:var(--display-xl)]">
            The car you want,
            <br />
            <span className="text-[var(--brand-400)]">without the theatre.</span>
          </h1>

          <p className="prose-body reveal-up mt-8 max-w-lg text-lg text-[var(--text-secondary)]">
            {code === "us"
              ? "Inspected vehicles, history you can read for yourself, and financing decided in-house. No runaround, no surprises at signing."
              : "Verified vehicles, documentation handled end to end, and instalment plans arranged in-house. No runaround, no surprises at signing."}
          </p>

          <div className="reveal-up mt-10 flex flex-wrap items-center gap-4">
            <Link
              href={`/${code}/inventory`}
              className="arrow-slide group inline-flex items-center gap-2 rounded-full bg-[var(--cta-bg)] px-7 py-3.5 font-semibold text-[var(--cta-fg)] shadow-[var(--shadow-lg)] transition-colors hover:bg-[var(--cta-bg-hover)]"
            >
              Browse inventory
              <span className="arrow">→</span>
            </Link>
            {site?.phone && (
              <a
                href={`tel:${site.phone}`}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface-1)]/50 px-7 py-3.5 font-medium backdrop-blur transition-colors hover:bg-[var(--surface-2)]"
              >
                Call {formatPhone(site.phone)}
              </a>
            )}
          </div>
        </div>

        <span className="eyebrow absolute bottom-8 right-6 hidden text-[var(--text-muted)] md:block">
          Scroll ↓
        </span>
      </section>

      {/* ══ FIGURES ════════════════════════════════════════════════════════ */}
      <section className="border-y border-[var(--border-subtle)] bg-[var(--surface-1)]">
        <dl className="stagger mx-auto grid max-w-6xl grid-cols-2 gap-px bg-[var(--border-subtle)] md:grid-cols-4">
          <Figure value={formatMilestone(stats.vehiclesSold, market.locale)} label="Vehicles sold" />
          <Figure value={String(stats.available)} label="Available now" />
          <Figure value={market.currency === "USD" ? "In-house" : "6–24 mo"} label="Financing" />
          <Figure value={code === "us" ? "The Triad" : "Nationwide"} label="We deliver" />
        </dl>
      </section>

      {/* ══ MARQUEE ════════════════════════════════════════════════════════ */}
      <section className="marquee overflow-hidden border-b border-[var(--border-subtle)] py-7">
        <div className="marquee-track gap-14 pr-14">
          {[...MARQUES, ...MARQUES].map((m, i) => (
            <span
              key={i}
              className="display-sans shrink-0 text-2xl text-[var(--text-muted)]/45"
              aria-hidden={i >= MARQUES.length}
            >
              {m}
            </span>
          ))}
        </div>
      </section>

      {/* ══ THE COLLECTION ═════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="reveal mb-12 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow mb-3 text-[var(--text-muted)]">The collection</p>
            <h2 className="display text-[length:var(--display-lg)]">Available now</h2>
          </div>
          {total > 0 && (
            <Link
              href={`/${code}/inventory`}
              className="arrow-slide group inline-flex items-center gap-2 text-sm font-medium text-[var(--link)]"
            >
              View all {total} <span className="arrow">→</span>
            </Link>
          )}
        </div>

        {vehicles.length === 0 ? (
          <div className="rule-fade-wrap rounded-2xl border border-dashed border-[var(--border-default)] px-6 py-20 text-center">
            <p className="display text-2xl">Inventory arriving shortly</p>
            <p className="mx-auto mt-3 max-w-sm text-sm text-[var(--text-muted)]">
              Tell us what you are looking for and we will source it before it
              reaches the site.
            </p>
            <Link
              href={`/${code}/contact`}
              className="mt-8 inline-block rounded-full bg-[var(--cta-bg)] px-7 py-3 text-sm font-semibold text-[var(--cta-fg)]"
            >
              Tell us what you want
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Hero listing gets the room it deserves rather than being one
                of three identical boxes. */}
            {lead && (
              <Showcase code={code} v={lead} fmt={fmt} market={market} index={1} feature />
            )}
            <div className="grid gap-6 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1">
              {rest.slice(0, 2).map((v, i) => (
                <Showcase key={v.id} code={code} v={v} fmt={fmt} market={market} index={i + 2} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ══ SERVICES ═══════════════════════════════════════════════════════ */}
      <section className="border-y border-[var(--border-subtle)] bg-[var(--surface-1)]">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <p className="eyebrow reveal mb-3 text-[var(--text-muted)]">What we do</p>
          <h2 className="display reveal-up mb-14 max-w-2xl text-[length:var(--display-lg)]">
            Three ways to put you in the right car.
          </h2>

          <div className="stagger divide-y divide-[var(--border-subtle)]">
            <ServiceRow
              n="01"
              title="Buy"
              body={
                code === "us"
                  ? "Inspected stock with the history report attached, priced with tax and fees shown before you commit."
                  : "Verified foreign-used and Nigerian-used vehicles, with customs papers and transfer handled for you."
              }
              href={`/${code}/inventory`}
              cta="Browse inventory"
            />
            <ServiceRow
              n="02"
              title="Rent"
              body="Daily, weekly and monthly hire. Longer bookings are priced on the better rate automatically — you are never charged more than the days you take."
              href={`/${code}/rentals`}
              cta="See the fleet"
            />
            <ServiceRow
              n="03"
              title="Finance"
              body={
                code === "us"
                  ? "Arranged in-house, so you deal with us directly. Work out a payment before you speak to anyone."
                  : "Instalment plans from 6 to 24 months, arranged in-house. Work out a payment before you speak to anyone."
              }
              href={`/${code}/financing`}
              cta="Work out a payment"
            />
          </div>
        </div>
      </section>

      {/* ══ FOUNDER ════════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[420px_1fr]">
          <div className="reveal-scale zoom-media relative overflow-hidden rounded-2xl border border-[var(--border-subtle)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/img/ceo.png"
              alt="Adedayo Aremu, Founder and CEO"
              className="aspect-[4/5] w-full object-cover"
              loading="lazy"
            />
            <div className="vignette absolute inset-0" />
          </div>

          <div className="reveal-up">
            <p className="eyebrow mb-5 text-[var(--text-muted)]">The founder</p>
            <blockquote className="display text-[length:var(--display-md)] leading-[1.15]">
              &ldquo;Rather than simply facilitating vehicle transactions, we
              deliver solutions that align with what the customer actually
              needs — and what they can actually afford.&rdquo;
            </blockquote>
            <p className="mt-6 font-semibold">Adedayo Aremu</p>
            <p className="text-sm text-[var(--text-muted)]">Founder &amp; Chief Executive</p>

            <div className="rule-fade my-8" />

            <p className="prose-body max-w-xl text-[var(--text-secondary)]">
              Adedayo Aremu Autos was built around transparency, quality
              assurance and long-term client relationships — a dealership run on
              professionalism rather than pressure.
            </p>
            <Link
              href={`/${code}/about`}
              className="arrow-slide mt-6 inline-flex items-center gap-2 text-sm font-medium text-[var(--link)]"
            >
              Read the full story <span className="arrow">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ══ WHY US ═════════════════════════════════════════════════════════ */}
      <section className="border-t border-[var(--border-subtle)] bg-[var(--surface-1)]">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="display reveal-up mb-14 max-w-xl text-[length:var(--display-lg)]">
            Why people buy from us twice.
          </h2>
          <div className="stagger grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {WHY_US[code].map((w, i) => (
              <div key={w.title}>
                <span className="display-sans text-3xl text-[var(--brand-500)]/35 tnum">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 text-lg font-semibold">{w.title}</h3>
                <p className="prose-body mt-1.5 text-sm text-[var(--text-secondary)]">{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CLOSING ════════════════════════════════════════════════════════ */}
      <section className="bloom grain relative isolate overflow-hidden border-t border-[var(--border-subtle)]">
        <div className="mx-auto max-w-4xl px-6 py-28 text-center">
          <h2 className="display reveal-up text-[length:var(--display-lg)]">
            Come and see the car in person.
          </h2>
          <p className="prose-body reveal-up mx-auto mt-6 max-w-md text-[var(--text-secondary)]">
            {site
              ? `We are at ${site.addressLine1}, ${site.city}. Call ahead and we will have it ready and warm.`
              : "Tell us what you are after and we will arrange a viewing."}
          </p>
          <div className="reveal-up mt-10 flex flex-wrap justify-center gap-4">
            <Link
              href={`/${code}/contact`}
              className="arrow-slide inline-flex items-center gap-2 rounded-full bg-[var(--cta-bg)] px-8 py-4 font-semibold text-[var(--cta-fg)] shadow-[var(--shadow-lg)] hover:bg-[var(--cta-bg-hover)]"
            >
              Book a viewing <span className="arrow">→</span>
            </Link>
            {site?.phone && (
              <a
                href={`tel:${site.phone}`}
                className="inline-flex items-center rounded-full border border-[var(--border-strong)] px-8 py-4 font-medium hover:bg-[var(--surface-2)]"
              >
                {formatPhone(site.phone)}
              </a>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-[var(--surface-1)] px-6 py-10">
      <dd className="display-sans text-3xl tracking-tight sm:text-4xl">{value}</dd>
      <dt className="eyebrow mt-2 text-[var(--text-muted)]">{label}</dt>
    </div>
  );
}

function ServiceRow({
  n,
  title,
  body,
  href,
  cta,
}: {
  n: string;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="group grid gap-4 py-9 md:grid-cols-[80px_1fr_auto] md:items-baseline md:gap-10">
      <span className="display-sans text-2xl text-[var(--brand-500)]/40 tnum">{n}</span>
      <div>
        <h3 className="display text-2xl">{title}</h3>
        <p className="prose-body mt-2 max-w-xl text-[var(--text-secondary)]">{body}</p>
      </div>
      <Link
        href={href}
        className="arrow-slide inline-flex shrink-0 items-center gap-2 text-sm font-medium text-[var(--link)]"
      >
        {cta} <span className="arrow">→</span>
      </Link>
    </div>
  );
}

function Showcase({
  code,
  v,
  fmt,
  market,
  index,
  feature = false,
}: {
  code: string;
  v: { id: string; slug: string; year: number; make: string; model: string; trim: string | null; condition: string; mileage: number | null; transmission: string | null; priceMinor: number | null; primaryImage?: string | null };
  fmt: (m: number) => string;
  market: (typeof MARKETS)[keyof typeof MARKETS];
  index: number;
  feature?: boolean;
}) {
  const title = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");

  return (
    <article
      className={`reveal-scale lift zoom-media group relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] ${
        feature ? "lg:col-span-7" : ""
      }`}
    >
      <Link href={`/${code}/inventory/${v.slug}`} className="block">
        <div
          className={`vignette relative overflow-hidden bg-[var(--surface-2)] ${
            feature ? "aspect-[16/11]" : "aspect-[16/10]"
          }`}
        >
          {v.primaryImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={mediaUrl(v.primaryImage)}
              alt={title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
              Photography coming soon
            </div>
          )}

          <span className="display-sans absolute left-5 top-4 text-4xl text-white/25 tnum">
            {String(index).padStart(2, "0")}
          </span>
          <span className="absolute right-4 top-4 rounded-full bg-[var(--surface-0)]/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide backdrop-blur">
            {v.condition}
          </span>

          {/* Details sit over the image so the card stays mostly photograph. */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-5 pt-14">
            <h3 className={`font-semibold leading-tight ${feature ? "text-2xl" : "text-lg"}`}>
              {title}
            </h3>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <div className="flex gap-4 text-sm text-white/65">
                {v.mileage != null && <span className="tnum">{formatDistance(v.mileage, market)}</span>}
                {v.transmission && <span>{v.transmission}</span>}
              </div>
              {v.priceMinor != null && (
                <span className={`font-bold tnum ${feature ? "text-2xl" : "text-lg"}`}>
                  {fmt(v.priceMinor)}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}
