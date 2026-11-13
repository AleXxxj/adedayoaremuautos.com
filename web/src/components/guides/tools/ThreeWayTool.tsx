"use client";

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { formatMoney, money, type CurrencyCode } from "@/lib/money";
import type { OwnershipTier } from "@/lib/rentToOwn";
import type { GuideRentCar } from "@/content/guides/types";
import { LENGTHS, type LengthKey, type Way } from "../guideMath";
import { threeWay, verdict } from "../threeWay";
import { signalScene } from "../motion/sceneKit";
import { barScales } from "../motion/sceneMath";
import { CountUp, buzz, signalResult } from "./gameKit";

/**
 * One question (how long do you need a car?) answered by three lanes: renting
 * that long, buying, and rent to own, each a bar that runs to its real figure
 * beside the other two, the same race as the scene at the top of the page.
 * The lowest takes its mark, one sentence says why, and the working for each
 * lane opens one at a time under it.
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
  // The three bars keep the figures' proportions: the longest is the dearest.
  const [rentBar, buyBar, ownBar] = barScales([f.rent?.cost.rentMinor ?? null, buy?.lowestMinor ?? null, f.own?.paidMinor ?? null]);
  // The working opens on the lowest lane; the reader may open another.
  const open: Way | null = f.lowest[0] ?? null;

  function pick(next: LengthKey) {
    if (next === key) return;
    buzz();
    setKey(next);
    signalResult();
  }

  const lane = (way: Way, icon: string, name: string, bar: number, figure: ReactNode, sub: string) => (
    <div className={`gt-lane${lowest(way) ? " is-lowest" : ""}`}>
      <span className="gt-lane-label">
        <i className={`fas ${icon}`} aria-hidden="true" /> {name}
      </span>
      <strong className="gt-lane-figure">{figure}</strong>
      <span className="gt-lane-track" aria-hidden="true">
        <span style={{ "--w": bar.toFixed(3) } as CSSProperties} />
      </span>
      <span className="gt-lane-sub">
        {sub}
        {/* Keyed by the length, so the mark lands again each time it moves. */}
        {lowest(way) && (
          <span className="gt-tag" key={key}>
            Lowest
          </span>
        )}
      </span>
    </div>
  );

  return (
    <div className="gt">
      <p className="gt-ask" id={label}>
        How long do you need a car?
      </p>
      <div className="gt-tiles gt-tiles--5" role="group" aria-labelledby={label}>
        {LENGTHS.map((l) => {
          const [n, unit] = l.label.split(" ");
          return (
            <button key={l.key} type="button" className="gt-tile" aria-pressed={l.key === key} onClick={() => pick(l.key)}>
              <span className="gt-tile-n">{n}</span>
              <span className="gt-tile-unit">{unit}</span>
            </button>
          );
        })}
      </div>

      <div className="gt-lanes">
        {lane(
          "rent",
          "fa-key",
          "Rent",
          rentBar,
          f.rent ? counted(f.rent.cost.rentMinor) : "—",
          f.rent ? `for ${length.phrase}` : "Not that long",
        )}
        {lane("buy", "fa-car", "Buy", buyBar, buy ? fmt(buy.lowestMinor) : "—", buy ? "paid once" : "None in stock")}
        {lane(
          "own",
          "fa-hand-holding-heart",
          "Rent to own",
          ownBar,
          f.own ? counted(f.own.paidMinor) : "—",
          f.own ? (f.own.owned ? "and it's yours" : `of ${fmt(f.own.totalMinor)}`) : "Not offered",
        )}
      </div>

      <p className="gt-verdict" role="status" aria-live="polite">
        {/* Keyed by the length: each new sentence arrives, it doesn't swap. */}
        <span className="gm-in" key={key}>
          {verdict(f, length.phrase, { currency, locale })}
        </span>
      </p>

      {/* The working, one lane at a time: opening one closes the others. */}
      <div className="gt-math">
        {f.rent && (
          <details name="gt-math" open={open === "rent"}>
            <summary>
              <span>
                <i className="fas fa-key" aria-hidden="true" /> How the rent adds up
              </span>
              <i className="fas fa-plus" aria-hidden="true" />
            </summary>
            <div className="gt-math-body">
              <p>
                <strong>{fmt(f.rent.cost.rentMinor)}</strong> for {length.phrase} in the {f.rent.car.name}, our
                lowest-cost car for that long.
                {f.rent.cost.depositMinor > 0 && (
                  <> Plus a {fmt(f.rent.cost.depositMinor)} deposit, refunded when you bring it back.</>
                )}
              </p>
              <Link href={`/us/rentals/${f.rent.car.slug}`} className="gd-a">
                See this car
              </Link>
            </div>
          </details>
        )}
        {buy && (
          <details name="gt-math" open={open === "buy"}>
            <summary>
              <span>
                <i className="fas fa-car" aria-hidden="true" /> What buying costs
              </span>
              <i className="fas fa-plus" aria-hidden="true" />
            </summary>
            <div className="gt-math-body">
              <p>
                <strong>{fmt(buy.lowestMinor)}</strong> is the lowest price in stock today, for the {buy.lowName}. The
                middle price of our {buy.count} {buy.count === 1 ? "car" : "cars"} is{" "}
                <strong>{fmt(buy.middleMinor)}</strong>. Tax, title and registration are extra.
              </p>
              <Link href="/us/inventory" className="gd-a">
                See cars for sale
              </Link>
            </div>
          </details>
        )}
        {f.own && tier && (
          <details name="gt-math" open={open === "own"}>
            <summary>
              <span>
                <i className="fas fa-hand-holding-heart" aria-hidden="true" /> How rent to own gets there
              </span>
              <i className="fas fa-plus" aria-hidden="true" />
            </summary>
            <div className="gt-math-body">
              <p>
                {f.own.owned ? (
                  <>
                    In the {tier.name} category the car is yours once your rent reaches{" "}
                    <strong>{fmt(f.own.totalMinor)}</strong>: about {weeksToOwn} weeks of continuous rental.
                  </>
                ) : (
                  <>
                    In the {tier.name} category, {length.phrase} of rent is <strong>{fmt(f.own.paidMinor)}</strong> of
                    the {fmt(f.own.totalMinor)} total. The car is yours after about {weeksToOwn} weeks of continuous
                    rental.
                  </>
                )}
              </p>
              <Link href="/us/rent-to-own" className="gd-a">
                See rent to own
              </Link>
            </div>
          </details>
        )}
      </div>

      {/* The rent-to-own page's own disclosure, always in view beside the figure it qualifies. */}
      {f.own && tier && (
        <div className="gt-fine" role="note">
          {tierLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {disclosure.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}

      <p className="gt-aside">
        Want to pay for a car over time?{" "}
        <Link href="/us/financing" className="gd-a">
          See financing
        </Link>
      </p>
    </div>
  );
}
