"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { formatMoney, money, type CurrencyCode } from "@/lib/money";
import type { GuideSaleCar } from "@/content/guides/types";
import { GuideCarCard } from "../GuideCarCard";
import { budgetBucket } from "../guideMath";

/** Cards shown under a budget; the rest are a tap away on the sale list. */
const SHOWN = 6;

/**
 * Tap a budget, see what it buys from the cars in stock: how many fit, the
 * typical year and miles among them, and the cars themselves.
 *
 * "Typical" is the middle value, counted from the cars for sale today and
 * nothing else, so the words say "in our stock today". Few of the listings
 * carry their miles, so the miles figure says how many it was counted from.
 * A budget that buys two cars or fewer says stock is thin; one that buys
 * none says so and names the lowest price.
 */
export function BudgetTool({
  cars,
  budgets,
  currency,
  locale,
  distanceUnit,
}: {
  /** Cars for sale with a price. */
  cars: GuideSaleCar[];
  /** Whole dollars. */
  budgets: readonly number[];
  currency: CurrencyCode;
  locale: string;
  distanceUnit: "mi" | "km";
}) {
  const buckets = budgets.map((major) => ({ major, ...budgetBucket(cars, major * 100) }));
  // Open on the first budget that buys something.
  const [major, setMajor] = useState(() => (buckets.find((b) => b.count > 0) ?? buckets[0]).major);
  const label = useId();
  const fmt = (minor: number) => formatMoney(money(minor, currency), locale);
  const num = (n: number) => new Intl.NumberFormat(locale).format(n);
  const b = buckets.find((x) => x.major === major)!;
  const at = `${fmt(b.budgetMinor)} or less`;
  const lowestInStock = cars.length ? Math.min(...cars.map((c) => c.priceMinor)) : null;

  return (
    <div className="gt">
      <p className="gt-ask" id={label}>
        What is your budget?
      </p>
      <div className="gt-chips" role="group" aria-labelledby={label}>
        {buckets.map((x) => (
          <button
            key={x.major}
            type="button"
            className="gt-chip"
            aria-pressed={x.major === major}
            onClick={() => setMajor(x.major)}
          >
            {fmt(x.budgetMinor)}
            <span className="gt-chip-count">
              {x.count}
              <span className="gd-sr"> {x.count === 1 ? "car" : "cars"}</span>
            </span>
          </button>
        ))}
      </div>

      <p className="gt-answer gt-answer--count" role="status" aria-live="polite">
        {b.count === 0 ? (
          <>
            <strong>No cars</strong> <span>at {at} in our stock today</span>
          </>
        ) : (
          <>
            <strong>
              {b.count} {b.count === 1 ? "car" : "cars"}
            </strong>{" "}
            <span>at {at} in our stock today</span>
          </>
        )}
      </p>

      {b.count === 0 && lowestInStock != null && (
        <p className="gt-notice">
          <i className="fas fa-circle-info" aria-hidden="true" />
          The lowest price in our stock today is {fmt(lowestInStock)}.
        </p>
      )}
      {b.thin && (
        <p className="gt-notice">
          <i className="fas fa-circle-info" aria-hidden="true" />
          Stock is thin at this budget. Ask us what is coming in.
        </p>
      )}

      {b.count > 0 && (
        <dl className="gt-facts">
          <div>
            <dt>Typical year</dt>
            <dd>{b.typicalYear}</dd>
          </div>
          <div>
            <dt>Typical miles</dt>
            <dd>
              {b.typicalMiles != null ? num(b.typicalMiles) : "Not listed"}
              {b.typicalMiles != null && (
                <span className="gt-facts-note">
                  from {b.milesListed} of {b.count} {b.count === 1 ? "listing" : "listings"}
                </span>
              )}
              {b.typicalMiles == null && <span className="gt-facts-note">ask us</span>}
            </dd>
          </div>
          <div>
            <dt>Prices</dt>
            <dd>
              {b.lowestMinor === b.highestMinor
                ? fmt(b.lowestMinor!)
                : `${fmt(b.lowestMinor!)} to ${fmt(b.highestMinor!)}`}
            </dd>
          </div>
        </dl>
      )}

      {b.count > 0 && (
        <>
          <ul className="gd-cars">
            {b.cars.slice(0, SHOWN).map((c) => (
              <GuideCarCard
                key={c.slug}
                href={`/us/inventory/${c.slug}`}
                image={c.image}
                name={c.name}
                price={fmt(c.priceMinor)}
                meta={
                  [c.mileage != null && `${num(c.mileage)} ${distanceUnit}`, c.transmission]
                    .filter(Boolean)
                    .join(" · ") || null
                }
                badge={c.pending ? "Sale pending" : null}
              />
            ))}
          </ul>
          <Link href={`/us/inventory?price=0-${b.major}`} className="gt-all">
            {b.count > SHOWN ? `See all ${b.count} cars at ${at}` : `See ${b.count === 1 ? "it" : "them"} on the sale list`}
            <i className="fas fa-arrow-right" aria-hidden="true" />
          </Link>
        </>
      )}
      {b.count === 0 && (
        <Link href="/us/inventory" className="gt-all">
          See every car for sale
          <i className="fas fa-arrow-right" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
