"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface ListFilter {
  /** The query-string key: "make", "type". */
  key: string;
  label: string;
  /** The "no filter" choice: "Any make". */
  anyLabel: string;
  options: { value: string; label: string }[];
}

/**
 * Count, filter and sort for a list of cars, in one row.
 *
 * Filters used to sit above the cars as a stack of dropdowns, which on a
 * phone pushed the first car off the screen. Most people never filter a list
 * this size, so they are folded behind one button and the cars come first.
 *
 * Driven by the URL: each choice applies at once, and every filtered view is
 * a link someone can send. `resetPage` drops the page number on any change,
 * so a filter never lands on page 4 of a shorter list.
 */
export function ListToolbar({
  count,
  filters,
  sort,
  resetPage = false,
}: {
  /** "11 cars", "1–12 of 30 cars". */
  count: string;
  filters: ListFilter[];
  sort: { options: { value: string; label: string }[]; defaultValue: string };
  resetPage?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (next: URLSearchParams) => {
    if (resetPage) next.delete("page");
    router.push(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    go(next);
  };

  const clear = () => {
    const next = new URLSearchParams(params.toString());
    for (const f of filters) next.delete(f.key);
    go(next);
  };

  // A filter with one choice or none filters nothing.
  const useful = filters.filter((f) => f.options.length > 1);
  const active = useful.filter((f) => params.has(f.key)).length;

  return (
    <div className="cl-tools">
      <p className="cl-count" aria-live="polite">
        {count}
      </p>

      {useful.length > 0 && (
        <details className="cl-filter">
          <summary>
            <i className="fas fa-sliders-h" aria-hidden="true" /> Filter
            {active > 0 && <span className="cl-filter-n">{active}</span>}
          </summary>
          <div className="cl-filter-panel">
            {useful.map((f) => (
              <label key={f.key}>
                {f.label}
                <select value={params.get(f.key) ?? "all"} onChange={(e) => set(f.key, e.target.value)}>
                  <option value="all">{f.anyLabel}</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {active > 0 && (
              <button type="button" className="cl-filter-clear" onClick={clear}>
                Clear filters
              </button>
            )}
          </div>
        </details>
      )}

      <select
        className="cl-sort"
        aria-label="Sort cars"
        value={params.get("sort") ?? sort.defaultValue}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value === sort.defaultValue) next.delete("sort");
          else next.set("sort", e.target.value);
          go(next);
        }}
      >
        {sort.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
