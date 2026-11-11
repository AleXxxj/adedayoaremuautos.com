"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface RentalFilterOptions {
  types: string[];
  transmissions: string[];
  priceBands: { label: string; value: string }[];
}

const FILTERS = ["type", "duration", "price", "transmission"] as const;

/**
 * Count, filter and sort for the rental list, in one row.
 *
 * The four filters used to sit above the cars as four stacked dropdowns,
 * which on a phone pushed the first car off the screen. With a dozen cars
 * most people never filter at all, so they are folded behind one button and
 * the cars come first.
 *
 * Still driven by the URL: each choice applies at once, and every filtered
 * view is a link someone can send.
 */
export function RentalToolbar({
  options,
  showing,
  total,
}: {
  options: RentalFilterOptions;
  showing: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (next: URLSearchParams) =>
    router.push(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    go(next);
  };

  const clear = () => {
    const next = new URLSearchParams(params.toString());
    for (const k of FILTERS) next.delete(k);
    go(next);
  };

  const current = (key: string) => params.get(key) ?? "all";
  const active = FILTERS.filter((k) => params.has(k)).length;

  return (
    <div className="rent-tools">
      <p className="rent-count" aria-live="polite">
        {showing === total ? `${total} cars` : `${showing} of ${total} cars`}
      </p>

      <details className="rent-filter">
        <summary>
          <i className="fas fa-sliders-h" aria-hidden="true" /> Filter
          {active > 0 && <span className="rent-filter-n">{active}</span>}
        </summary>
        <div className="rent-filter-panel">
          <label>
            Type
            <select value={current("type")} onChange={(e) => set("type", e.target.value)}>
              <option value="all">Any type</option>
              {options.types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rent by
            <select value={current("duration")} onChange={(e) => set("duration", e.target.value)}>
              <option value="all">Day, week or month</option>
              <option value="weekly">The week</option>
              <option value="monthly">The month</option>
            </select>
          </label>
          {options.priceBands.length > 0 && (
            <label>
              Price a day
              <select value={current("price")} onChange={(e) => set("price", e.target.value)}>
                <option value="all">Any price</option>
                {options.priceBands.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {options.transmissions.length > 1 && (
            <label>
              Transmission
              <select
                value={current("transmission")}
                onChange={(e) => set("transmission", e.target.value)}
              >
                <option value="all">Any</option>
                {options.transmissions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          )}
          {active > 0 && (
            <button type="button" className="rent-filter-clear" onClick={clear}>
              Clear filters
            </button>
          )}
        </div>
      </details>

      <select
        className="rent-sort"
        aria-label="Sort cars"
        value={params.get("sort") ?? "price-low"}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value === "price-low") next.delete("sort");
          else next.set("sort", e.target.value);
          go(next);
        }}
      >
        <option value="price-low">Lowest price</option>
        <option value="price-high">Highest price</option>
        <option value="name">Name</option>
      </select>
    </div>
  );
}
