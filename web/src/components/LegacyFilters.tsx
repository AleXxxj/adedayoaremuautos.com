"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

/**
 * The original filter bar, reproduced with its class names — but driven by the
 * URL rather than by client-side array filtering.
 *
 * The legacy version filtered a hardcoded array in the browser, so a filtered
 * view could not be linked, bookmarked or indexed. Pushing the state into the
 * query string means /inventory?make=Toyota is a real, shareable, crawlable
 * page, and the filtering happens against the whole database rather than the
 * handful of vehicles that happened to be in the payload.
 */
export interface FilterOptions {
  makes: string[];
  years: number[];
  conditions: readonly string[];
  transmissions: string[];
  fuels: string[];
  priceBands: { label: string; value: string }[];
}

export function LegacyFilters({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    // A filter change should start from page one, not keep the old offset.
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const current = (key: string) => params.get(key) ?? "all";

  return (
    <div className="filters-section">
      <div className="filters-container">
        <div className="filters-grid">
          <div className="filter-group">
            <label htmlFor="brandFilter">Brand</label>
            <select
              id="brandFilter"
              value={current("make")}
              onChange={(e) => set("make", e.target.value)}
            >
              <option value="all">All Brands</option>
              {options.makes.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="yearFilter">Year</label>
            <select
              id="yearFilter"
              value={current("year")}
              onChange={(e) => set("year", e.target.value)}
            >
              <option value="all">All Years</option>
              {options.years.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="priceFilter">Price Range</label>
            <select
              id="priceFilter"
              value={current("price")}
              onChange={(e) => set("price", e.target.value)}
            >
              <option value="all">Any Price</option>
              {options.priceBands.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="conditionFilter">Condition</label>
            <select
              id="conditionFilter"
              value={current("condition")}
              onChange={(e) => set("condition", e.target.value)}
            >
              <option value="all">All</option>
              {options.conditions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="transmissionFilter">Transmission</label>
            <select
              id="transmissionFilter"
              value={current("transmission")}
              onChange={(e) => set("transmission", e.target.value)}
            >
              <option value="all">All</option>
              {options.transmissions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="sortFilter">Sort By</label>
            <select
              id="sortFilter"
              value={params.get("sort") ?? "newest"}
              onChange={(e) => set("sort", e.target.value)}
            >
              <option value="newest">Newest First</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="year_desc">Year: Newest</option>
              <option value="mileage_asc">Lowest Mileage</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Chips for whatever is currently applied, with a clear-all. */
export function ActiveFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const labels: Record<string, string> = {
    make: "Brand", year: "Year", price: "Price",
    condition: "Condition", transmission: "Transmission", q: "Search",
  };

  const active = [...params.entries()].filter(([k]) => k in labels);
  if (active.length === 0) return null;

  const remove = (key: string) => {
    const next = new URLSearchParams(params.toString());
    next.delete(key);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="active-filters">
      {active.map(([k, v]) => (
        <span className="filter-tag" key={k}>
          {labels[k]}: {v}
          <button type="button" onClick={() => remove(k)} aria-label={`Remove ${labels[k]} filter`}>
            <i className="fas fa-times" />
          </button>
        </span>
      ))}
      <button type="button" className="clear-filters" onClick={() => router.push(pathname)}>
        Clear All
      </button>
    </div>
  );
}
