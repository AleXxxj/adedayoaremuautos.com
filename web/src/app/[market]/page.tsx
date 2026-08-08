import Link from "next/link";
import { notFound } from "next/navigation";
import { MARKETS, isMarketCode } from "@/lib/market";
import { listInventory } from "@/lib/repositories/vehicles";
import { VehicleCard } from "@/components/VehicleCard";
import { getSiteStats, formatMilestone } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function MarketHome({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();

  const market = MARKETS[code];
  const [{ vehicles, total }, stats] = await Promise.all([
    listInventory(code, { limit: 3 }),
    getSiteStats(),
  ]);

  return (
    <>
      <section className="relative isolate overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/img/hero-benz.png"
          alt=""
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        <div
          className="absolute inset-0 -z-10"
          style={{ background: "var(--hero-scrim)" }}
        />

        <div className="mx-auto max-w-6xl px-6 py-28">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface-1)]/70 px-3 py-1 text-xs font-medium tracking-wide text-[var(--accent-400)]">
            ● {code === "us" ? "GREENSBORO, NORTH CAROLINA" : "NIGERIA"}
          </p>

          <h1 className="max-w-2xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Buy, rent and finance
            <br />
            with <span className="text-[var(--brand-400)]">confidence</span>.
          </h1>

          <p className="mt-6 max-w-lg text-lg text-[var(--text-secondary)]">
            {code === "us"
              ? "Inspected vehicles with transparent history, and financing decided in-house — serving Greensboro and the Triad."
              : "Verified foreign-used and Nigerian-used vehicles, full documentation handled, flexible instalment plans."}
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href={`/${code}/inventory`}
              className="rounded-lg bg-[var(--cta-bg)] px-6 py-3 font-semibold text-[var(--cta-fg)] shadow-[var(--shadow-md)] hover:bg-[var(--cta-bg-hover)]"
            >
              Browse inventory
            </Link>
            <Link
              href={`/${code}/contact`}
              className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)]/60 px-6 py-3 font-medium backdrop-blur hover:bg-[var(--surface-2)]"
            >
              Talk to us
            </Link>
          </div>
        </div>
      </section>

      {/* Live figures. Nothing here is a static marketing claim: the sold count
          is the owner's historical figure plus every sale the platform has
          recorded, and availability comes straight from inventory. */}
      <section className="border-y border-[var(--border-subtle)] bg-[var(--surface-1)]">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-[var(--border-subtle)] px-6 sm:grid-cols-3">
          <Stat
            value={formatMilestone(stats.vehiclesSold, market.locale)}
            label="Vehicles sold"
          />
          <Stat
            value={String(stats.available)}
            label="Available now"
          />
          <Stat
            value={code === "us" ? "Greensboro, NC" : "Nigeria"}
            label="Where we are"
            wide
          />
        </dl>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Available now
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Priced in {market.currency}. {market.name} inventory.
            </p>
          </div>
          {total > 3 && (
            <Link
              href={`/${code}/inventory`}
              className="text-sm font-medium text-[var(--link)] hover:underline"
            >
              View all {total} →
            </Link>
          )}
        </div>

        {vehicles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] px-6 py-14 text-center">
            <p className="font-medium">Inventory is being loaded.</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">
              Vehicles added through the admin panel appear here immediately.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => (
              <VehicleCard key={v.id} vehicle={v} market={market} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function Stat({
  value,
  label,
  wide,
}: {
  value: string;
  label: string;
  wide?: boolean;
}) {
  return (
    <div className={`px-2 py-8 text-center ${wide ? "col-span-2 sm:col-span-1" : ""}`}>
      <dd className="text-2xl font-bold tracking-tight sm:text-3xl">{value}</dd>
      <dt className="mt-1 text-xs uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </dt>
    </div>
  );
}
