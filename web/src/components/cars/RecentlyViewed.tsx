"use client";

import { useEffect, useMemo } from "react";
import { MARKETS, type MarketCode } from "@/lib/market";
import { RECENT_SHOWN, cardFor, type ListKind } from "./carData";
import { CarCard } from "./CarCard";
import { forgetCars, recordView, useSlugList } from "./savedStore";
import { useCars } from "./useCars";

/**
 * "Recently viewed" at the foot of a car's page, and the thing that records
 * the visit: this car goes to the front of the browser's list, and up to
 * four of the others show as cards. Nothing shows on a first visit, or for a
 * car that has since sold.
 */
export function RecentlyViewed({
  market: code,
  slug,
  kind,
}: {
  market: MarketCode;
  /** The car this page is about: recorded, and left out of the row. */
  slug: string;
  /** Which page this is: a card shows that price when the car has one. */
  kind: ListKind;
}) {
  const market = MARKETS[code];
  const recent = useSlugList("recent", code);
  const others = useMemo(
    () => recent.filter((s) => s !== slug).slice(0, RECENT_SHOWN),
    [recent, slug],
  );
  const { cars, gone } = useCars(code, others);

  useEffect(() => {
    recordView(code, slug);
  }, [code, slug]);

  const goneKey = gone.join(",");
  useEffect(() => {
    if (goneKey) forgetCars("recent", code, goneKey.split(","));
  }, [code, goneKey]);

  if (cars.length === 0) return null;

  return (
    <section className="cd-section" aria-labelledby="cd-recent">
      <h2 className="cd-h" id="cd-recent">
        Recently viewed
      </h2>
      <ul className="cc-row cc-row--four">
        {cars.map((car) => (
          <CarCard
            key={car.slug}
            card={cardFor(car, market, kind)}
            market={code}
            sizes="(min-width: 700px) 25vw, 78vw"
          />
        ))}
      </ul>
    </section>
  );
}
