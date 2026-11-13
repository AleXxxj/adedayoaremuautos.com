"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatMoney, money, type CurrencyCode } from "@/lib/money";
import { canResize } from "@/lib/photo";
import { TRIP_MILEAGE_NOTE, tripShareText, type TripPlace } from "@/content/guides/roadTrip";
import type { GuideRentCar } from "@/content/guides/types";
import { ShareButton } from "../ShareButton";
import { TRIP_DAYS, roundTripMiles, tripCost } from "../gameMath";
import { signalScene } from "../motion/sceneKit";
import { CountUp, FriendNote, useHash, useStepFocus } from "./gameKit";

/** Cars shown before "Show all". */
const FIRST = 5;

const PER = { monthly: "a month", weekly: "a week", daily: "a day" } as const;

/** "#trip=asheville-2": a place and a number of days, both checked against the tool's own lists. */
function parseTrip(hash: string, places: TripPlace[]): { place: string; days: number } | null {
  const m = /^#trip=([a-z-]{1,40})-(\d{1,2})$/.exec(hash);
  if (!m) return null;
  const days = Number(m[2]);
  return places.some((p) => p.id === m[1]) && (TRIP_DAYS as readonly number[]).includes(days)
    ? { place: m[1], days }
    : null;
}

/**
 * Pick a place, pick the days, and see what each rental car costs for the
 * trip: the rent worked out by quoteRental (the booking form's own pricing),
 * the deposit apart.
 *
 * The miles are approximate road miles, one way, and say so. The line about
 * the mileage allowance is the rental policy's own sentence: the policy
 * names no number, so neither does this. No fuel or time is estimated.
 *
 * Nothing is typed, stored or sent. A shared link carries a place and a
 * number of days after the #, and opens on that trip.
 */
export function RoadTripTool({
  places,
  cars,
  currency,
  locale,
  path,
}: {
  places: TripPlace[];
  cars: GuideRentCar[];
  currency: CurrencyCode;
  locale: string;
  path: string;
}) {
  const shared = parseTrip(useHash(), places);
  const [pickedPlace, setPickedPlace] = useState<string | null>(null);
  const [pickedDays, setPickedDays] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const placeId = pickedPlace ?? shared?.place ?? null;
  const days = pickedDays ?? shared?.days ?? TRIP_DAYS[0];
  const { ref, moved } = useStepFocus<HTMLHeadingElement>(placeId);
  // The map at the top of the page drives to the same place.
  useEffect(() => signalScene({ tool: "road-trip", place: placeId }), [placeId]);

  const fmt = (minor: number) => formatMoney(money(minor, currency), locale);
  const num = (n: number) => new Intl.NumberFormat(locale).format(n);
  const place = places.find((p) => p.id === placeId) ?? null;
  const farthest = Math.max(...places.map((p) => p.miles));
  const trip = tripCost(cars, days);
  const priced = trip.rows.filter((r) => r.cost);
  const span = `${days} ${days === 1 ? "day" : "days"}`;

  return (
    <div className="gt gm">
      {shared && pickedPlace == null && (
        <FriendNote>Your friend picked this trip. Tap another place to plan your own.</FriendNote>
      )}
      <p className="gt-ask" id="gm-trip-ask">
        Where to?
      </p>
      <div className="gm-places" role="group" aria-labelledby="gm-trip-ask">
        {places.map((p) => (
          <button
            key={p.id}
            type="button"
            className="gm-place"
            aria-pressed={p.id === placeId}
            onClick={() => {
              moved();
              setPickedPlace(p.id);
            }}
          >
            <span className="gm-place-kind">
              <i className={`fas ${p.icon}`} aria-hidden="true" />
              {p.kind}
            </span>
            <span className="gm-place-name">{p.name}</span>
            <span className="gm-place-miles">about {num(p.miles)} mi</span>
          </button>
        ))}
      </div>

      {!place ? (
        <p className="gm-hint">
          <i className="fas fa-hand-pointer" aria-hidden="true" />
          Tap a place to see the miles and what each car costs.
        </p>
      ) : (
        <section className="gm-trip" aria-labelledby="gm-trip-h">
          <h3 className="gm-ask" id="gm-trip-h" tabIndex={-1} ref={ref}>
            Greensboro to {place.name}
          </h3>
          <p className="gm-sub">{place.line}</p>

          <div className="gm-road" aria-hidden="true">
            {/* Scaled, not resized: the road runs out to the place without a layout. */}
            <span className="gm-road-line" style={{ "--far": (place.miles / farthest).toFixed(3) } as CSSProperties}>
              <span />
              <i />
            </span>
          </div>
          <dl className="gt-facts gm-miles">
            <div>
              <dt>One way</dt>
              <dd>
                about <CountUp value={place.miles} format={num} /> mi
              </dd>
            </div>
            <div>
              <dt>There and back</dt>
              <dd>
                about <CountUp value={roundTripMiles(place.miles)} format={num} /> mi
              </dd>
            </div>
          </dl>

          <p className="gt-ask" id="gm-trip-days">
            How many days?
          </p>
          <div className="gt-chips" role="group" aria-labelledby="gm-trip-days">
            {TRIP_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                className="gt-chip"
                aria-pressed={d === days}
                onClick={() => setPickedDays(d)}
              >
                {d} {d === 1 ? "day" : "days"}
              </button>
            ))}
          </div>

          {cars.length === 0 ? (
            <p className="gt-empty">
              No cars are listed to rent today.{" "}
              <Link href="/us/contact?type=rental" className="gd-a">
                Ask about a rental
              </Link>
            </p>
          ) : (
            <>
              {/* Short, so a screen reader hears the answer and not the whole list. */}
              <p className="gt-answer" role="status" aria-live="polite">
                {trip.fromMinor == null ? (
                  <>No car is rented for {span}. Pick another length.</>
                ) : (
                  <>
                    <strong>From {fmt(trip.fromMinor)}</strong>{" "}
                    <span>
                      for {span} to {place.name} and back · {priced.length} {priced.length === 1 ? "car" : "cars"}
                    </span>
                  </>
                )}
              </p>

              <ol className="gt-rows gt-rows--in" key={days}>
                {trip.rows.map(({ car, cost }, i) => (
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
              {trip.rows.length > FIRST && (
                <button type="button" className="gt-more" aria-expanded={all} onClick={() => setAll(!all)}>
                  {all ? "Show fewer" : `Show all ${trip.rows.length} cars`}
                  <i className={`fas ${all ? "fa-chevron-up" : "fa-chevron-down"}`} aria-hidden="true" />
                </button>
              )}
            </>
          )}

          <p className="gt-notice">
            <i className="fas fa-circle-info" aria-hidden="true" />
            {TRIP_MILEAGE_NOTE}
          </p>

          <ShareButton
            title={`Greensboro to ${place.name}`}
            text={tripShareText(place, days, trip.fromMinor != null ? fmt(trip.fromMinor) : null)}
            path={`${path}#trip=${place.id}-${days}`}
            label="Send this trip to a friend"
            withText
          />
          <Link href="/us/rentals" className="gd-btn gd-btn--primary">
            <i className="fas fa-key" aria-hidden="true" />
            See cars to rent
          </Link>
        </section>
      )}
    </div>
  );
}
