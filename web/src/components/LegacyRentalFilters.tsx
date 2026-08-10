"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export interface RentalFilterOptions {
  types: string[];
  transmissions: string[];
  priceBands: { label: string; value: string }[];
}

/**
 * The original rental filter bar, reproduced with its class names — but driven
 * by the URL instead of filtering a hardcoded array in the browser.
 *
 * The original's Apply button was doing nothing a change event could not do,
 * so each control applies immediately; Reset stays, because clearing five
 * selects one at a time is a chore. That keeps /rentals?type=SUV linkable and
 * indexable, which the client-side version could never be.
 */
export function LegacyRentalFilters({ options }: { options: RentalFilterOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    router.push(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const current = (key: string) => params.get(key) ?? "all";
  const hasAny = ["type", "duration", "price", "transmission", "sort"].some((k) =>
    params.has(k),
  );

  return (
    <div className="filters-section">
      <div className="filters-container">
        <div className="filters-grid">
          <div className="filter-group">
            <label htmlFor="typeFilter">Car Type</label>
            <select
              id="typeFilter"
              value={current("type")}
              onChange={(e) => set("type", e.target.value)}
            >
              <option value="all">All Types</option>
              {options.types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="durationFilter">Rental Duration</label>
            <select
              id="durationFilter"
              value={current("duration")}
              onChange={(e) => set("duration", e.target.value)}
            >
              <option value="all">Any Duration</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="priceFilter">Price Range (per day)</label>
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

          <div className="filter-actions">
            <button
              type="button"
              className="btn-reset"
              onClick={() => router.push(pathname, { scroll: false })}
              disabled={!hasAny}
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The original's results bar: a count on the left, sort on the right. */
export function RentalResultsBar({
  showing,
  total,
}: {
  showing: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === "default") next.delete("sort");
    else next.set("sort", value);
    router.push(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  return (
    <div className="results-bar">
      <div className="results-count">
        Showing <span>{showing}</span> of <span>{total}</span> vehicles
      </div>
      <div className="sort-dropdown">
        <label htmlFor="sortFilter">Sort by:</label>
        <select
          id="sortFilter"
          value={params.get("sort") ?? "default"}
          onChange={(e) => set(e.target.value)}
        >
          <option value="default">Default</option>
          <option value="price-low">Price: Low to High</option>
          <option value="price-high">Price: High to Low</option>
          <option value="name">Name: A to Z</option>
        </select>
      </div>
    </div>
  );
}
