"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { canResize } from "@/lib/photo";
import type { RentalQuoteLine } from "@/lib/rental";
import type { GuideRentCar } from "@/content/guides/types";
import type { RentCost } from "../guideMath";
import { barScales } from "../motion/sceneMath";
import { CountUp } from "./gameKit";

const PER: Record<RentalQuoteLine["tier"], string> = {
  monthly: "a month",
  weekly: "a week",
  daily: "a day",
};

export interface FleetRow {
  car: GuideRentCar;
  cost: RentCost | null;
}

/** "1 × $1,200 a month + 2 × $350 a week": what the total is made of. */
export const mixLine = (cost: RentCost, fmt: (minor: number) => string) =>
  cost.lines.map((l) => `${l.quantity} × ${fmt(l.unitMinor)} ${PER[l.tier]}`).join(" + ");

/**
 * The lowest-cost car for a length of time, shown as the answer: its photo
 * rolls in along a road line and its total counts up to the real figure.
 *
 * The frame has its height from the start and is drawn again for each new
 * length (the caller keys it), so the car drives in each time and nothing
 * under it moves.
 */
export function FleetHero({
  row,
  span,
  fmt,
}: {
  row: { car: GuideRentCar; cost: RentCost };
  /** "2 weeks", "3 days" */
  span: string;
  fmt: (minor: number) => string;
}) {
  const { car, cost } = row;
  return (
    <Link href={`/us/rentals/${car.slug}`} className="gt-hero">
      <span className="gt-hero-road" aria-hidden="true">
        <span className="gt-hero-car">
          {car.image ? (
            <Image src={car.image} alt="" fill sizes="200px" loading="eager" unoptimized={!canResize(car.image)} />
          ) : (
            <i className="fas fa-car-side" />
          )}
        </span>
      </span>
      <span className="gt-hero-text">
        <span className="gt-hero-kicker">Lowest for {span}</span>
        <strong className="gt-hero-total">
          {/* Counted in whole dollars, so no cents flicker on the way up. */}
          <CountUp value={cost.rentMinor / 100} format={(n) => fmt(Math.round(n * 100))} />
        </strong>
        <span className="gt-hero-name">{car.name}</span>
        <span className="gt-hero-mix">
          {mixLine(cost, fmt)}
          {cost.depositMinor > 0 && <> · + {fmt(cost.depositMinor)} deposit</>}
        </span>
      </span>
    </Link>
  );
}

/**
 * Every car with what it costs for a length of time, lowest first. A bar
 * under each row grows to its share of the highest total, so the fleet reads
 * as a picture before it reads as a table. The bars are for the eye: the
 * figure beside each is the fact.
 *
 * @param first rows shown before "Show all": a phone screen's worth
 */
export function FleetRows({
  rows,
  days,
  fmt,
  first,
}: {
  rows: FleetRow[];
  days: number;
  fmt: (minor: number) => string;
  first: number;
}) {
  const [all, setAll] = useState(false);
  const scales = barScales(rows.map((r) => r.cost?.rentMinor ?? null));
  return (
    <>
      {/* Keyed by the length: the new totals arrive one row after another. */}
      <ol className="gt-rows gt-rows--in" key={days}>
        {rows.map(({ car, cost }, i) => (
          <li key={car.slug} hidden={!all && i >= first}>
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
                    <span className="gt-row-mix">{mixLine(cost, fmt)}</span>
                    {cost.depositMinor > 0 && <span className="gt-row-deposit">+ {fmt(cost.depositMinor)} deposit</span>}
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
              {cost && (
                <span className="gt-row-bar" aria-hidden="true">
                  <span style={{ "--w": scales[i].toFixed(3), "--i": Math.min(i, first) } as CSSProperties} />
                </span>
              )}
            </Link>
          </li>
        ))}
      </ol>

      {rows.length > first && (
        <button type="button" className="gt-more" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${rows.length} cars`}
          <i className={`fas ${all ? "fa-chevron-up" : "fa-chevron-down"}`} aria-hidden="true" />
        </button>
      )}
    </>
  );
}
