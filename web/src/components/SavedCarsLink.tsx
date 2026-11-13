"use client";

import Link from "next/link";
import { useSlugList } from "@/components/cars/savedStore";

/**
 * The heart in the header: the way to the cars this browser has saved.
 *
 * The list lives in localStorage (savedStore.ts), so the server renders the
 * heart with no count and the badge appears once the page has hydrated. It
 * updates as soon as a car is saved or removed anywhere on the page, or in
 * another tab. The count is in the link's name, so the badge itself is not
 * read out a second time.
 */
export function SavedCarsLink({ market }: { market: string }) {
  const count = useSlugList("saved", market).length;
  const label = count > 0 ? `Saved cars, ${count}` : "Saved cars";

  return (
    <Link href={`/${market}/inventory?saved=1`} className="saved-link" aria-label={label} title="Saved cars">
      <i className={`${count > 0 ? "fas" : "far"} fa-heart`} aria-hidden="true" />
      {count > 0 && (
        <span className="saved-link-count" aria-hidden="true">
          {count}
        </span>
      )}
    </Link>
  );
}
