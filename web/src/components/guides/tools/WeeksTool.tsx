"use client";

import { useId, useState, type CSSProperties } from "react";
import Link from "next/link";
import { formatMoney, money, type CurrencyCode } from "@/lib/money";
import type { GuideRentCar } from "@/content/guides/types";
import { WEEK_CHOICES, cheapestRental, fleetForDays } from "../guideMath";
import { FleetHero, FleetRows } from "./FleetRows";
import { buzz, signalResult } from "./gameKit";

/** Rows shown before "Show all": the answer is the car above them, so a few are enough. */
const FIRST = 4;

/** The longest length offered: the strip of weeks has this many blocks. */
const MOST = Math.max(...WEEK_CHOICES);

/**
 * One question, four big answers: how long do you need a car? The tap is
 * answered by a picture, not a table. The strip of weeks fills to the length,
 * the lowest-cost car for that long rolls in with its total counting up, and
 * the rest of the fleet follows as bars that grow to their share of the
 * highest total.
 *
 * Each total is quoteRental's, the function the booking form charges with:
 * the lowest mix of the car's daily, weekly and monthly rates that covers
 * the days. The mix is printed under the total ("1 × $1,200 a month"), so
 * nobody has to trust the number. The deposit is the renter's own money and
 * is shown on a line of its own, never added in.
 *
 * Only tariffs, names and photos reach the browser: what the rental list
 * already shows.
 */
export function WeeksTool({
  cars,
  currency,
  locale,
}: {
  cars: GuideRentCar[];
  currency: CurrencyCode;
  locale: string;
}) {
  const [weeks, setWeeks] = useState<number>(WEEK_CHOICES[0]);
  const label = useId();
  const fmt = (minor: number) => formatMoney(money(minor, currency), locale);
  const days = weeks * 7;
  const rows = fleetForDays(cars, days);
  const priced = rows.filter((r) => r.cost);
  const span = `${weeks} ${weeks === 1 ? "week" : "weeks"}`;

  if (cars.length === 0) {
    return (
      <div className="gt">
        <p className="gt-empty">
          No cars are listed to rent today.{" "}
          <Link href="/us/contact?type=rental" className="gd-a">
            Ask about a rental
          </Link>
        </p>
      </div>
    );
  }

  const best = priced[0]?.cost ? { car: priced[0].car, cost: priced[0].cost } : null;
  const lowest = best?.cost.rentMinor ?? null;
  const highest = priced.length ? priced[priced.length - 1].cost!.rentMinor : null;
  // The answer is the car in the frame; the rows are the rest of the fleet.
  const others = best ? rows.filter((r) => r.car.slug !== best.car.slug) : rows;

  function pick(w: number) {
    if (w === weeks) return;
    buzz();
    setWeeks(w);
    // Now there is an answer worth sending: the share button under the tool says so once.
    signalResult();
  }

  return (
    <div className="gt">
      <p className="gt-ask" id={label}>
        How long do you need a car?
      </p>
      <div className="gt-tiles gt-tiles--4" role="group" aria-labelledby={label}>
        {WEEK_CHOICES.map((w) => {
          const from = cheapestRental(cars, w * 7);
          return (
            <button key={w} type="button" className="gt-tile" aria-pressed={w === weeks} onClick={() => pick(w)}>
              <span className="gt-tile-n">{w}</span>
              <span className="gt-tile-unit">{w === 1 ? "week" : "weeks"}</span>
              <span className="gt-tile-from">{from ? `from ${fmt(from.cost.rentMinor)}` : "not offered"}</span>
            </button>
          );
        })}
      </div>

      {/* The weeks themselves: one block each, lit up to the length chosen. */}
      <div className="gt-span" aria-hidden="true">
        {Array.from({ length: MOST }, (_, i) => (
          <span key={i} data-on={i < weeks || undefined} style={{ "--i": i } as CSSProperties} />
        ))}
      </div>

      {/* Drawn again for each length, so the car rolls in and the total counts up each time. */}
      <div className="gt-stage" key={weeks}>
        {best ? (
          <FleetHero row={best} span={span} fmt={fmt} />
        ) : (
          <p className="gt-notice">
            <i className="fas fa-circle-info" aria-hidden="true" />
            No car is rented for {span}. Pick a shorter time.
          </p>
        )}
      </div>

      {/* Short, so a screen reader hears the answer and not the whole list. */}
      <p className="gt-answer gt-answer--small" role="status" aria-live="polite">
        {lowest == null ? (
          <>No car is rented for {span}.</>
        ) : (
          <>
            <strong>{lowest === highest ? fmt(lowest) : `${fmt(lowest)} to ${fmt(highest!)}`}</strong>{" "}
            <span>
              for {span} · {priced.length} {priced.length === 1 ? "car" : "cars"}
            </span>
          </>
        )}
      </p>

      {others.length > 0 && <FleetRows rows={others} days={days} fmt={fmt} first={FIRST} />}
    </div>
  );
}
