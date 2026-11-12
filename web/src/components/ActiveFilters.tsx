import Link from "next/link";

export interface ActiveFilter {
  /** "Toyota", "Up to $10,000", "Search: camry". */
  label: string;
  /** The list without this filter. */
  href: string;
}

/**
 * The filters in force on a list, each a chip that takes itself off, with
 * one link that clears them all. Plain links, so they work before the page's
 * scripts arrive and without them.
 *
 * The page builds the chips from the address it was asked for, so a filter
 * from an older link (a year, a transmission) shows here and can be removed
 * even though the menus no longer offer it.
 */
export function ActiveFilters({
  filters,
  clearHref,
}: {
  filters: ActiveFilter[];
  clearHref: string;
}) {
  if (filters.length === 0) return null;
  return (
    <ul className="cl-active" aria-label="Filters in use">
      {filters.map((f) => (
        <li key={f.label}>
          <Link href={f.href} scroll={false} className="cl-active-chip">
            <span className="cl-sr">Remove filter: </span>
            {f.label}
            <i className="fas fa-xmark" aria-hidden="true" />
          </Link>
        </li>
      ))}
      <li>
        <Link href={clearHref} scroll={false} className="cl-active-clear">
          Clear filters
        </Link>
      </li>
    </ul>
  );
}
