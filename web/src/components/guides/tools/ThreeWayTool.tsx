"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { formatMoney, money, type CurrencyCode } from "@/lib/money";
import type { OwnershipTier } from "@/lib/rentToOwn";
import type { GuideRentCar } from "@/content/guides/types";
import { LENGTHS, type LengthKey, type Way } from "../guideMath";
import { threeWay, verdict } from "../threeWay";
import { signalScene } from "../motion/sceneKit";
import { CountUp } from "./gameKit";

/**
 * Tap how long you need a car, see three figures side by side: renting that
 * long, buying, and rent to own.
 *
 *   Rent         the lowest-cost car in the fleet for that many days, priced
 *                by the booking engine (quoteRental), deposit shown apart.
 *   Buy          the lowest sale price in stock, with the middle price
 *                beside it. Paid once, whatever the length.
 *   Rent to own  the rent paid by then in the category with the lowest
 *                total, from the same categories /us/rent-to-own lists,
 *                with that page's disclosure word for word under it.
 *
 * The line under them says which figure is lowest and why. That is
 * arithmetic on three different cars, and the note under the tool says so.
 *
 * NO CREDIT TERMS HERE. No payment on a loan, no rate, no approval language:
 * financing is a link to its own page. See content/guides/rentBuyOwn.ts.
 */
export function ThreeWayTool({
  rent,
  buy,
  tier,
  tierLines,
  disclosure,
  currency,
  locale,
}: {
  rent: GuideRentCar[];
  buy: { count: number; lowestMinor: number; middleMinor: number; lowName: string } | null;
  /** The rent-to-own category with the lowest total, or null. */
  tier: OwnershipTier | null;
  /** Each owning category's line of the disclosure, lowest total first. */
  tierLines: string[];
  /** The rent-to-own page's disclosure sentences, word for word. */
  disclosure: readonly string[];
  currency: CurrencyCode;
  locale: string;
}) {
  const [key, setKey] = useState<LengthKey>("3m");
  const label = useId();
  // The three lanes at the top of the page run to the same figures.
  useEffect(() => signalScene({ tool: "three-way", key }), [key]);
  const fmt = (minor: number) => formatMoney(money(minor, currency), locale);
  // Counted in whole dollars: the figure climbs to the real one and stops on it.
  const counted = (minor: number) => <CountUp value={minor / 100} format={(n) => fmt(Math.round(n * 100))} />;
  const length = LENGTHS.find((l) => l.key === key)!;
  const f = threeWay({ rent, buyLowestMinor: buy?.lowestMinor ?? null, tier }, length.days);
  const lowest = (way: Way) => f.lowest.length === 1 && f.lowest[0] === way;
  const weeksToOwn = f.own ? Math.round(f.own.ownDays / 7) : null;

  return (
    <div className="gt">
      <p className="gt-ask" id={label}>
        How long do you need a car?
      </p>
      <div className="gt-chips" role="group" aria-labelledby={label}>
        {LENGTHS.map((l) => (
          <button
            key={l.key}
            type="button"
            className="gt-chip"
            aria-pressed={l.key === key}
            onClick={() => setKey(l.key)}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="gt-three">
        <div className={`gt-way${lowest("rent") ? " is-lowest" : ""}`}>
          <span className="gt-way-label">
            <i className="fas fa-key" aria-hidden="true" /> Rent
          </span>
          <strong className="gt-way-figure">{f.rent ? counted(f.rent.cost.rentMinor) : "—"}</strong>
          <span className="gt-way-sub">{f.rent ? `for ${length.phrase}` : "Not that long"}</span>
          {lowest("rent") && <span className="gt-tag">Lowest</span>}
        </div>
        <div className={`gt-way${lowest("buy") ? " is-lowest" : ""}`}>
          <span className="gt-way-label">
            <i className="fas fa-car" aria-hidden="true" /> Buy
          </span>
          <strong className="gt-way-figure">{buy ? fmt(buy.lowestMinor) : "—"}</strong>
          <span className="gt-way-sub">{buy ? "paid once" : "None in stock"}</span>
          {lowest("buy") && <span className="gt-tag">Lowest</span>}
        </div>
        <div className={`gt-way${lowest("own") ? " is-lowest" : ""}`}>
          <span className="gt-way-label">
            <i className="fas fa-hand-holding-heart" aria-hidden="true" /> Rent to own
          </span>
          <strong className="gt-way-figure">{f.own ? counted(f.own.paidMinor) : "—"}</strong>
          <span className="gt-way-sub">
            {f.own ? (f.own.owned ? "and it's yours" : `of ${fmt(f.own.totalMinor)}`) : "Not offered"}
          </span>
          {lowest("own") && <span className="gt-tag">Lowest</span>}
        </div>
      </div>

      <p className="gt-verdict" role="status" aria-live="polite">
        {verdict(f, length.phrase, { currency, locale })}
      </p>

      <ul className="gt-details">
        {f.rent && (
          <li>
            <h3 className="gt-detail-h">
              <i className="fas fa-key" aria-hidden="true" /> Rent
            </h3>
            <p>
              <strong>{fmt(f.rent.cost.rentMinor)}</strong> for {length.phrase} in the {f.rent.car.name},
              our lowest-cost car for that long.
              {f.rent.cost.depositMinor > 0 && (
                <> Plus a {fmt(f.rent.cost.depositMinor)} deposit, refunded when you bring it back.</>
              )}
            </p>
            <Link href={`/us/rentals/${f.rent.car.slug}`} className="gd-a">
              See this car
            </Link>
          </li>
        )}
        {buy && (
          <li>
            <h3 className="gt-detail-h">
              <i className="fas fa-car" aria-hidden="true" /> Buy
            </h3>
            <p>
              <strong>{fmt(buy.lowestMinor)}</strong> is the lowest price in stock today, for the{" "}
              {buy.lowName}. The middle price of our {buy.count} {buy.count === 1 ? "car" : "cars"} is{" "}
              <strong>{fmt(buy.middleMinor)}</strong>. Tax, title and registration are extra.
            </p>
            <Link href="/us/inventory" className="gd-a">
              See cars for sale
            </Link>
          </li>
        )}
        {f.own && tier && (
          <li>
            <h3 className="gt-detail-h">
              <i className="fas fa-hand-holding-heart" aria-hidden="true" /> Rent to own
            </h3>
            <p>
              {f.own.owned ? (
                <>
                  In the {tier.name} category the car is yours once your rent reaches{" "}
                  <strong>{fmt(f.own.totalMinor)}</strong>: about {weeksToOwn} weeks of continuous rental.
                </>
              ) : (
                <>
                  In the {tier.name} category, {length.phrase} of rent is{" "}
                  <strong>{fmt(f.own.paidMinor)}</strong> of the {fmt(f.own.totalMinor)} total. The car is
                  yours after about {weeksToOwn} weeks of continuous rental.
                </>
              )}
            </p>
            {/* The rent-to-own page's own disclosure, beside the figure it qualifies. */}
            <div className="gt-fine" role="note">
              {tierLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              {disclosure.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <Link href="/us/rent-to-own" className="gd-a">
              See rent to own
            </Link>
          </li>
        )}
      </ul>

      <p className="gt-aside">
        Want to pay for a car over time?{" "}
        <Link href="/us/financing" className="gd-a">
          See financing
        </Link>
      </p>
    </div>
  );
}
