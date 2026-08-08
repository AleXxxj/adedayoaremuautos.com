import Link from "next/link";
import { notFound } from "next/navigation";
import { MARKETS, isMarketCode } from "@/lib/market";
import { listInventory, availableMakes, type SortKey } from "@/lib/repositories/vehicles";
import { VehicleCard } from "@/components/VehicleCard";

export const dynamic = "force-dynamic";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "price_asc", label: "Price: low to high" },
  { key: "price_desc", label: "Price: high to low" },
  { key: "year_desc", label: "Year: newest" },
  { key: "mileage_asc", label: "Lowest mileage" },
];

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();
  const market = MARKETS[code];

  const sp = await searchParams;
  const sort = (SORTS.find((s) => s.key === sp.sort)?.key ?? "newest") as SortKey;

  const [{ vehicles, total }, makes] = await Promise.all([
    listInventory(code, {
      make: sp.make,
      condition: sp.condition,
      query: sp.q,
      // Price bands arrive as minor units in the URL so the links stay exact.
      minPriceMinor: sp.minPrice ? Number(sp.minPrice) : undefined,
      maxPriceMinor: sp.maxPrice ? Number(sp.maxPrice) : undefined,
      sort,
    }),
    availableMakes(code),
  ]);

  const filtered = Boolean(sp.make || sp.condition || sp.q || sp.minPrice || sp.maxPrice);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          {market.code === "us" ? "Inventory — Greensboro" : "Inventory — Nigeria"}
        </h1>
        <p className="mt-2 text-[var(--text-secondary)]">
          {total === 0
            ? "No vehicles listed yet."
            : `${total} vehicle${total === 1 ? "" : "s"} available.`}
        </p>
      </header>

      {/* Filters — plain links so the page works without JavaScript and every
          filtered view is a shareable, indexable URL. */}
      <div className="mb-8 flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] pb-6">
        <FilterChip href={`/${code}/inventory`} active={!sp.condition && !sp.make}>
          All
        </FilterChip>

        {market.conditions.map((c) => (
          <FilterChip
            key={c}
            href={`/${code}/inventory?condition=${encodeURIComponent(c)}`}
            active={sp.condition === c}
          >
            {c}
          </FilterChip>
        ))}

        {makes.map((m) => (
          <FilterChip
            key={m}
            href={`/${code}/inventory?make=${encodeURIComponent(m)}`}
            active={sp.make === m}
          >
            {m}
          </FilterChip>
        ))}

        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-[var(--text-muted)]">Sort</span>
          {SORTS.slice(0, 3).map((s) => (
            <FilterChip
              key={s.key}
              href={`/${code}/inventory?${new URLSearchParams({
                ...(sp.make ? { make: sp.make } : {}),
                ...(sp.condition ? { condition: sp.condition } : {}),
                sort: s.key,
              })}`}
              active={sort === s.key}
            >
              {s.label}
            </FilterChip>
          ))}
        </div>
      </div>

      {vehicles.length === 0 ? (
        <EmptyState filtered={filtered} marketCode={code} />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => (
            <VehicleCard key={v.id} vehicle={v} market={market} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-transparent bg-[var(--cta-bg)] font-medium text-[var(--cta-fg)]"
          : "border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
      }`}
    >
      {children}
    </Link>
  );
}

function EmptyState({
  filtered,
  marketCode,
}: {
  filtered: boolean;
  marketCode: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] px-6 py-16 text-center">
      <h2 className="text-lg font-semibold">
        {filtered ? "Nothing matches those filters" : "No vehicles listed yet"}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">
        {filtered
          ? "Try widening your search — or tell us what you're looking for and we'll source it."
          : "Inventory is being loaded. Tell us what you're looking for and we'll contact you as soon as something matches."}
      </p>
      <div className="mt-6 flex justify-center gap-3">
        {filtered && (
          <Link
            href={`/${marketCode}/inventory`}
            className="rounded-lg border border-[var(--border-strong)] px-5 py-2.5 text-sm font-medium hover:bg-[var(--surface-2)]"
          >
            Clear filters
          </Link>
        )}
        <Link
          href={`/${marketCode}/contact`}
          className="rounded-lg bg-[var(--cta-bg)] px-5 py-2.5 text-sm font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)]"
        >
          Tell us what you want
        </Link>
      </div>
    </div>
  );
}
