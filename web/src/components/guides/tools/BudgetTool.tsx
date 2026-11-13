"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
import Link from "next/link";
import { formatMoney, money, type CurrencyCode } from "@/lib/money";
import type { GuideSaleCar } from "@/content/guides/types";
import { GuideCarCard } from "../GuideCarCard";
import { budgetBucket } from "../guideMath";
import { signalScene } from "../motion/sceneKit";
import { CountUp, buzz, signalResult } from "./gameKit";

/** Cards shown under a budget; the rest are a tap away on the sale list. */
const SHOWN = 6;

/**
 * One question (what is your budget?) answered on a price line: every car in
 * stock is a mark at its price, a marker slides to the budget, the marks it
 * passes light up, the count climbs to how many fit, and those cars drive
 * in. Then the typical year and miles among them.
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
  // The odometer at the top of the page rolls to the same budget.
  useEffect(() => signalScene({ tool: "budget", major }), [major]);
  const fmt = (minor: number) => formatMoney(money(minor, currency), locale);
  const num = (n: number) => new Intl.NumberFormat(locale).format(n);
  const b = buckets.find((x) => x.major === major)!;
  const reach = `${fmt(b.budgetMinor)} or less`;
  const lowestInStock = cars.length ? Math.min(...cars.map((c) => c.priceMinor)) : null;

  // The price line runs from nothing to the dearest car or the largest budget, whichever is more.
  const top = Math.max(...cars.map((c) => c.priceMinor), ...buckets.map((x) => x.budgetMinor));
  const at = (minor: number) => (top > 0 ? Math.min(1, minor / top) : 0);

  function pick(next: number) {
    if (next === major) return;
    buzz();
    setMajor(next);
    signalResult();
  }

  return (
    <div className="gt">
      <p className="gt-ask" id={label}>
        What is your budget?
      </p>
      <div className="gt-tiles gt-tiles--3" role="group" aria-labelledby={label}>
        {buckets.map((x) => (
          <button key={x.major} type="button" className="gt-tile" aria-pressed={x.major === major} onClick={() => pick(x.major)}>
            <span className="gt-tile-n gt-tile-n--money">{fmt(x.budgetMinor)}</span>
            <span className="gt-tile-from">
              {x.count} {x.count === 1 ? "car" : "cars"}
            </span>
          </button>
        ))}
      </div>

      {/* Every car in stock at its price; the marker stops at the budget. For the eye: the count below is the fact. */}
      {cars.length > 0 && (
        <div className="gt-rail" aria-hidden="true">
          <span className="gt-rail-line" />
          {cars.map((c) => (
            <span
              key={c.slug}
              className="gt-rail-car"
              data-in={c.priceMinor <= b.budgetMinor || undefined}
              style={{ left: `${(at(c.priceMinor) * 100).toFixed(2)}%`, "--d": at(c.priceMinor).toFixed(3) } as CSSProperties}
            />
          ))}
          <span className="gt-rail-reach" style={{ "--at": at(b.budgetMinor).toFixed(4) } as CSSProperties} />
          <span className="gt-rail-mark" style={{ "--at": at(b.budgetMinor).toFixed(4) } as CSSProperties}>
            <span>{fmt(b.budgetMinor)}</span>
          </span>
          <span className="gt-rail-ends">
            <span>{fmt(0)}</span>
            <span>{fmt(top)}</span>
          </span>
        </div>
      )}

      <p className="gt-answer gt-answer--count" role="status" aria-live="polite">
        {b.count === 0 ? (
          <>
            <strong>No cars</strong> <span>at {reach} in our stock today</span>
          </>
        ) : (
          <>
            <strong>
              <CountUp value={b.count} format={String} /> {b.count === 1 ? "car" : "cars"}
            </strong>{" "}
            <span>at {reach} in our stock today</span>
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
        <dl className="gt-facts gt-facts--in" key={b.major}>
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
          {/* Keyed by the budget: its cars drive in one after another. */}
          <ul className="gd-cars gd-cars--drive" key={b.major}>
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
            {b.count > SHOWN ? `See all ${b.count} cars at ${reach}` : `See ${b.count === 1 ? "it" : "them"} on the sale list`}
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
