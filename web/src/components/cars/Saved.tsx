"use client";

import Link from "next/link";
import { useEffect } from "react";
import { MARKETS, type MarketCode } from "@/lib/market";
import { useHydrated } from "@/lib/useHydrated";
import { cardFor, type ListKind } from "./carData";
import { CarCard } from "./CarCard";
import { forgetCars, useSlugList } from "./savedStore";
import { useCars } from "./useCars";

/**
 * The "Saved" chip at the start of a list's chips: a heart, and how many
 * cars this browser has saved. It opens the list with `saved=1`.
 */
export function SavedChip({
  market,
  href,
  active,
}: {
  market: MarketCode;
  href: string;
  active: boolean;
}) {
  const count = useSlugList("saved", market).length;
  return (
    <Link
      href={href}
      scroll={false}
      className="cl-chip cl-chip--saved"
      aria-current={active ? "true" : undefined}
    >
      <i className={`${count > 0 ? "fas" : "far"} fa-heart`} aria-hidden="true" />
      Saved
      {count > 0 && <span className="cl-chip-n">{count}</span>}
    </Link>
  );
}

/** "2 saved cars", in place of the list's own count while Saved is open. */
export function SavedCount({ market }: { market: MarketCode }) {
  const count = useSlugList("saved", market).length;
  const hydrated = useHydrated();
  return <>{hydrated ? `${count} saved ${count === 1 ? "car" : "cars"}` : "Saved cars"}</>;
}

/**
 * The cars this browser has saved, as cards, where a list's own cars would
 * be. A saved car that has since sold or been unlisted is dropped from the
 * saved list, so the count on the chip is always the number of cards here.
 */
export function SavedCars({
  market: code,
  kind,
  allHref,
}: {
  market: MarketCode;
  /** The list this is on: a saved car shows that list's price when it has one. */
  kind: ListKind;
  /** The list without the Saved filter. */
  allHref: string;
}) {
  const market = MARKETS[code];
  const hydrated = useHydrated();
  const slugs = useSlugList("saved", code);
  const { cars, gone, status, retry } = useCars(code, slugs);

  const goneKey = gone.join(",");
  useEffect(() => {
    if (goneKey) forgetCars("saved", code, goneKey.split(","));
  }, [code, goneKey]);

  // The server and the first paint know nothing of this browser's list.
  if (!hydrated) {
    return (
      <>
        <p className="cl-note" role="status">
          Loading your saved cars…
        </p>
        <noscript>
          <p className="cl-note">Saved cars need JavaScript turned on in this browser.</p>
        </noscript>
      </>
    );
  }

  if (slugs.length === 0 || (status === "ready" && cars.length === 0)) {
    return (
      <div className="cl-empty">
        <i className="far fa-heart" aria-hidden="true" />
        <h2>No saved cars yet</h2>
        <p>Tap the heart on a car to keep it here.</p>
        <Link href={allHref} className="cl-btn cl-btn--primary">
          See all cars
        </Link>
      </div>
    );
  }

  if (status === "error" && cars.length === 0) {
    return (
      <div className="cl-empty" role="alert">
        <i className="fas fa-wifi" aria-hidden="true" />
        <h2>We couldn&rsquo;t load your saved cars</h2>
        <p>Check your connection, then try again.</p>
        <button type="button" className="cl-btn cl-btn--primary" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }

  if (cars.length === 0) {
    return (
      <p className="cl-note" role="status">
        Loading your saved cars…
      </p>
    );
  }

  return (
    <ul className="cc-grid" id="cars">
      {cars.map((car, i) => (
        <CarCard
          key={car.slug}
          card={cardFor(car, market, kind)}
          market={code}
          heading="h2"
          eager={i === 0}
        />
      ))}
    </ul>
  );
}
