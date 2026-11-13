"use client";

import { useId, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatMoney, money, type CurrencyCode } from "@/lib/money";
import { canResize } from "@/lib/photo";
import type { RentalQuoteLine } from "@/lib/rental";
import type { GuideRentCar } from "@/content/guides/types";
import { WEEK_CHOICES, fleetForDays } from "../guideMath";

/** Rows shown before "Show all": a phone screen's worth. */
const FIRST = 6;

const PER: Record<RentalQuoteLine["tier"], string> = {
  monthly: "a month",
  weekly: "a week",
  daily: "a day",
};

/**
 * Tap how long, see what every car in the fleet costs for that long.
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
  const [all, setAll] = useState(false);
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

  const lowest = priced[0]?.cost?.rentMinor ?? null;
  const highest = priced.length ? priced[priced.length - 1].cost!.rentMinor : null;

  return (
    <div className="gt">
      <p className="gt-ask" id={label}>
        How long do you need a car?
      </p>
      <div className="gt-chips" role="group" aria-labelledby={label}>
        {WEEK_CHOICES.map((w) => (
          <button
            key={w}
            type="button"
            className="gt-chip"
            aria-pressed={w === weeks}
            onClick={() => setWeeks(w)}
          >
            {w} {w === 1 ? "week" : "weeks"}
          </button>
        ))}
      </div>

      {/* Short, so a screen reader hears the answer and not the whole list. */}
      <p className="gt-answer" role="status" aria-live="polite">
        {lowest == null ? (
          <>No car is rented for {span}. Pick a shorter time.</>
        ) : (
          <>
            <strong>{lowest === highest ? fmt(lowest) : `${fmt(lowest)} to ${fmt(highest!)}`}</strong>{" "}
            <span>
              for {span} · {priced.length} {priced.length === 1 ? "car" : "cars"}
            </span>
          </>
        )}
      </p>

      {/* Keyed by the length: the new totals arrive one row after another. */}
      <ol className="gt-rows gt-rows--in" key={weeks}>
        {rows.map(({ car, cost }, i) => (
          <li key={car.slug} hidden={!all && i >= FIRST}>
            <Link href={`/us/rentals/${car.slug}`} className="gt-row">
              <span className="gt-row-photo">
                {car.image ? (
                  <Image src={car.image} alt="" fill sizes="72px" unoptimized={!canResize(car.image)} />
                ) : (
                  <i className="fas fa-camera" aria-hidden="true" />
                )}
              </span>
              <span className="gt-row-text">
                <span className="gt-row-name">{car.name}</span>
                {cost ? (
                  <>
                    <span className="gt-row-mix">
                      {cost.lines.map((l) => `${l.quantity} × ${fmt(l.unitMinor)} ${PER[l.tier]}`).join(" + ")}
                    </span>
                    {cost.depositMinor > 0 && (
                      <span className="gt-row-deposit">+ {fmt(cost.depositMinor)} deposit</span>
                    )}
                  </>
                ) : (
                  <span className="gt-row-mix">
                    {car.tariff.maxDays && days > car.tariff.maxDays
                      ? `Rents for up to ${car.tariff.maxDays} days`
                      : `Rents for ${car.tariff.minDays} days or more`}
                  </span>
                )}
              </span>
              <span className="gt-row-total">
                {cost ? <strong>{fmt(cost.rentMinor)}</strong> : <span aria-hidden="true">—</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>

      {rows.length > FIRST && (
        <button type="button" className="gt-more" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${rows.length} cars`}
          <i className={`fas ${all ? "fa-chevron-up" : "fa-chevron-down"}`} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
