import Link from "next/link";
import { notFound } from "next/navigation";
import { MARKETS, isMarketCode, type MarketCode } from "@/lib/market";
import { listInventory, availableMakes } from "@/lib/repositories/vehicles";
import { getSiteStats } from "@/lib/stats";
import { listLocations, formatPhone } from "@/lib/repositories/locations";
import { Showroom } from "@/components/directions/Showroom";
import { NightDrive } from "@/components/directions/NightDrive";
import { Marketplace } from "@/components/directions/Marketplace";
import { sampleVehicles, sampleMakes } from "@/lib/sampleVehicles";

export const dynamic = "force-dynamic";

const VARIANTS = {
  showroom: { name: "A · Showroom", note: "Light, editorial, generous. Serif headlines." },
  night: { name: "B · Night Drive", note: "Dark done properly. Technical sans, real depth." },
  marketplace: { name: "C · Marketplace", note: "Search-first, dense, function forward." },
} as const;

type VariantKey = keyof typeof VARIANTS;

const isVariant = (v: string): v is VariantKey =>
  Object.prototype.hasOwnProperty.call(VARIANTS, v);

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ variant: string }>;
  searchParams: Promise<{ market?: string }>;
}) {
  const { variant } = await params;
  if (!isVariant(variant)) notFound();

  const { market: marketParam } = await searchParams;
  const code: MarketCode =
    marketParam && isMarketCode(marketParam) ? marketParam : "us";
  const market = MARKETS[code];

  const [{ vehicles }, stats, makes, sites] = await Promise.all([
    listInventory(code, { limit: 3 }),
    getSiteStats(),
    availableMakes(code),
    listLocations(code),
  ]);

  const phone = sites[0] ? formatPhone(sites[0].phone) : null;

  // With no real inventory the car grids would be empty and the designs
  // unjudgeable. Fall back to in-memory placeholders — never written to the
  // database, so nothing here can be published by accident.
  const usingSamples = vehicles.length === 0;
  const shownVehicles = usingSamples ? sampleVehicles(code) : vehicles;
  const shownMakes = usingSamples ? sampleMakes(code) : makes;
  const shownStats = usingSamples
    ? { ...stats, available: sampleVehicles(code).length }
    : stats;

  return (
    <>
      {/* Comparison bar. Not part of any direction — just scaffolding so you can
          flip between them and between markets without losing your place. */}
      <div className="sticky top-0 z-[100] border-b border-[var(--border-strong)] bg-[var(--surface-0)] text-[var(--text-primary)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2 text-sm">
          <span className="mr-1 font-semibold">Compare:</span>
          {(Object.keys(VARIANTS) as VariantKey[]).map((k) => (
            <Link
              key={k}
              href={`/preview/${k}?market=${code}`}
              className={`rounded-full px-3 py-1 transition-colors ${
                k === variant
                  ? "bg-[var(--cta-bg)] font-semibold text-[var(--cta-fg)]"
                  : "border border-[var(--border-default)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {VARIANTS[k].name}
            </Link>
          ))}

          <span className="ml-auto flex items-center gap-2">
            {(["us", "ng"] as const).map((c) => (
              <Link
                key={c}
                href={`/preview/${variant}?market=${c}`}
                className={`rounded-full px-3 py-1 transition-colors ${
                  c === code
                    ? "bg-[var(--surface-3)] font-semibold"
                    : "border border-[var(--border-default)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {c === "us" ? "Greensboro" : "Nigeria"}
              </Link>
            ))}
          </span>
        </div>
        <p className="mx-auto max-w-7xl px-4 pb-2 text-xs text-[var(--text-muted)]">
          {VARIANTS[variant].note}
          {usingSamples && (
            <span className="ml-2 text-[var(--warning)]">
              · Cars shown are placeholders — your database is empty. Not saved
              anywhere.
            </span>
          )}
        </p>
      </div>

      {variant === "showroom" && (
        <Showroom market={market} stats={shownStats} vehicles={shownVehicles} phone={phone} />
      )}
      {variant === "night" && (
        <NightDrive market={market} stats={shownStats} vehicles={shownVehicles} />
      )}
      {variant === "marketplace" && (
        <Marketplace market={market} stats={shownStats} vehicles={shownVehicles} makes={shownMakes} />
      )}
    </>
  );
}
