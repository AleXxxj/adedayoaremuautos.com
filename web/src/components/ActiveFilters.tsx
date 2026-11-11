"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

/**
 * Chips for whatever filters are applied on the sale list, with a clear-all.
 * The filters themselves are folded behind one button (ListToolbar), so these
 * are what show, at a glance, that the list is narrowed.
 */
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
