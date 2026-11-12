"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { canResize } from "@/lib/photo";
import { ShareButton } from "@/components/guides/ShareButton";
import {
  MAX_COMPARE,
  MIN_COMPARE,
  compareHref,
  withCarAt,
  withoutCar,
  type BodyGroup,
  type CompareRow,
} from "./compareData";

/** A chosen car, as its column head and the buttons under it need it. */
export interface BoardCar {
  slug: string;
  name: string;
  short: string;
  image: string | null;
  /** "$5,700", or "$350 a week" for a car that is only for rent. */
  price: string;
  /** The car's page. */
  href: string;
  /** The second button under the car: its label and where it goes. */
  next: { label: string; href: string };
  /** Its rental page, when every car in the comparison can be rented. */
  rentHref: string | null;
}

/** A car in the picker. */
export interface PickCar {
  slug: string;
  short: string;
  image: string | null;
  price: string;
  /** "or rent from $350 a week" */
  sub: string | null;
  group: BodyGroup | null;
  rental: boolean;
}

/** Features listed for a car before "N more". */
const FEATURES_SHOWN = 5;

const GROUP_LABEL: Record<BodyGroup, string> = {
  SUV: "SUVs",
  Truck: "Trucks",
  Van: "Vans",
  Wagon: "Wagons",
  Hatchback: "Hatchbacks",
  Coupe: "Coupes",
  Convertible: "Convertibles",
  Sedan: "Sedans",
};

function Photo({ src, sizes }: { src: string | null; sizes: string }) {
  return src ? (
    <Image src={src} alt="" fill sizes={sizes} unoptimized={!canResize(src)} />
  ) : (
    <span className="cmp-nophoto">
      <i className="fas fa-camera" aria-hidden="true" />
    </span>
  );
}

/**
 * Compare's whole interactive surface: the chosen cars, the picker, and the
 * side-by-side table.
 *
 * NOTHING IS TYPED TO CHOOSE A CAR. A car is picked by tapping its photo in
 * a sheet, and every choice in that sheet is a real link to
 * `?cars=slug,slug`, so the comparison lives in the address: it can be
 * shared, bookmarked and reloaded, and Back undoes a pick. The search box in
 * the sheet only narrows the photos; it is never needed.
 *
 * The table itself (rows, which value is better, the one-line differences)
 * is worked out on the server by compareData.ts and arrives as plain text.
 * On a phone each fact's name sits above its values, so two or three cars
 * fit side by side at 320px without scrolling sideways; from 900px the names
 * move to a column on the left. Either way it is exposed as a table, with
 * the cars as column headers that stay in view while the rows scroll.
 */
export function CompareBoard({
  market,
  chosen,
  rows,
  lines,
  features,
  cars,
  recallsHref,
}: {
  market: string;
  chosen: BoardCar[];
  rows: CompareRow[];
  /** One list of short sentences for each chosen car. */
  lines: string[][];
  /** What each listing has that the others don't list, or null with none. */
  features: string[][] | null;
  /** Every car that can be picked. */
  cars: PickCar[];
  /** The free car check, where the market has one. */
  recallsHref: string | null;
}) {
  const slugs = chosen.map((c) => c.slug);
  // The column being picked for, or null with the sheet closed.
  const [slot, setSlot] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BodyGroup | "rent" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  // A native dialog: the browser traps focus in it, closes it on Escape,
  // makes the page behind it inert and gives focus back to the button that
  // opened it. The page is kept from scrolling under the sheet.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (slot != null && !el.open) {
      el.showModal();
      // Start at Close, not in the search box: focusing a text field on a
      // phone raises the keyboard over the photos.
      el.querySelector<HTMLButtonElement>(".cmp-sheet-x")?.focus();
    }
    if (slot == null && el.open) el.close();
    if (slot == null) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [slot]);

  function open(at: number) {
    setQuery("");
    setFilter(null);
    setSlot(at);
  }
  const close = () => setSlot(null);

  const comparing = chosen.length >= MIN_COMPARE;
  const canAdd = chosen.length < MAX_COMPARE;
  const replacing = slot != null && slot < chosen.length ? chosen[slot] : null;

  // The picker's chips: only kinds of car that are in stock.
  const groups = [...new Set(cars.flatMap((c) => (c.group ? [c.group] : [])))].sort();
  const rentCount = cars.filter((c) => c.rental).length;
  const q = query.trim().toLowerCase();
  const shown = cars.filter(
    (c) =>
      (!q || c.short.toLowerCase().includes(q)) &&
      (filter == null || (filter === "rent" ? c.rental : c.group === filter)),
  );

  const title = chosen.map((c) => c.short).join(" vs ");

  return (
    <>
      {!comparing ? (
        /* ── Nothing to compare yet: two places to put a car ─────────────── */
        <div className="cmp-start">
          <div className="cmp-slots">
            {[0, 1].map((i) => {
              const car = chosen[i];
              return car ? (
                <button key={car.slug} type="button" className="cmp-slot" onClick={() => open(i)}>
                  <span className="cmp-slot-photo">
                    <Photo src={car.image} sizes="(min-width: 700px) 320px, 46vw" />
                  </span>
                  <span className="cmp-slot-name">{car.short}</span>
                  <span className="cmp-slot-price">{car.price}</span>
                  <span className="cmp-slot-change">
                    <i className="fas fa-arrows-rotate" aria-hidden="true" /> Change
                  </span>
                </button>
              ) : (
                <button
                  key={`empty-${i}`}
                  type="button"
                  className="cmp-slot cmp-slot--empty"
                  onClick={() => open(chosen.length)}
                >
                  <span className="cmp-slot-plus">
                    <i className="fas fa-plus" aria-hidden="true" />
                  </span>
                  <span className="cmp-slot-name">{i === 0 ? "First car" : "Second car"}</span>
                  <span className="cmp-slot-change">Tap to pick</span>
                </button>
              );
            })}
          </div>
          {cars.length >= MIN_COMPARE ? (
            <button type="button" className="cmp-btn cmp-btn--primary" onClick={() => open(chosen.length)}>
              <i className="fas fa-images" aria-hidden="true" />
              {chosen.length === 0 ? "Pick a car" : "Pick the second car"}
            </button>
          ) : (
            <p className="cmp-none">
              There aren&rsquo;t two cars in stock to compare right now.{" "}
              <Link href={`/${market}/contact`}>Tell us what you want</Link>
            </p>
          )}
        </div>
      ) : (
        /* ── The comparison ──────────────────────────────────────────────── */
        <>
          <ul className="cmp-lines">
            {chosen.map((car, i) => (
              <li key={car.slug}>
                <span className="cmp-lines-name">{car.short}</span>
                <span className="cmp-lines-text">
                  {lines[i]?.length ? lines[i].join(" ") : "Not enough on the listings to compare. See the car."}
                </span>
              </li>
            ))}
          </ul>

          <div className="cmp-bar">
            <ShareButton title={`${title}: side by side`} label="Send this comparison" />
            {canAdd && cars.length > chosen.length && (
              <button type="button" className="cmp-btn" onClick={() => open(chosen.length)}>
                <i className="fas fa-plus" aria-hidden="true" />
                Add a third car
              </button>
            )}
          </div>

          <p className="cmp-hint">Tap a car to change it.</p>

          <div
            className="cmp-table"
            role="table"
            aria-label={`${title}, side by side`}
            style={{ "--n": chosen.length } as CSSProperties}
          >
            <div className="cmp-heads" role="row">
              <div className="cmp-corner" role="columnheader">
                <span className="gd-sr">Fact</span>
              </div>
              {chosen.map((car, i) => (
                <div className="cmp-headcell" role="columnheader" key={car.slug}>
                  <button
                    type="button"
                    className="cmp-head"
                    onClick={() => open(i)}
                    aria-label={`${car.name}, ${car.price}. Change this car`}
                  >
                    <span className="cmp-head-photo">
                      <Photo src={car.image} sizes="(min-width: 900px) 280px, 46vw" />
                    </span>
                    <span className="cmp-head-name">{car.short}</span>
                    <span className="cmp-head-price">{car.price}</span>
                  </button>
                </div>
              ))}
            </div>

            {rows.map((row) => (
              <div className="cmp-row" role="row" key={row.key}>
                <div className="cmp-label" role="rowheader">
                  <i className={`fas ${row.icon}`} aria-hidden="true" />
                  {row.label}
                </div>
                {row.cells.map((cell, i) => (
                  <div
                    className={`cmp-cell${cell.better ? " is-better" : ""}${cell.missing ? " is-missing" : ""}`}
                    role="cell"
                    key={chosen[i].slug}
                  >
                    <span className="cmp-value">{cell.text}</span>
                    {cell.better && (
                      <span className="cmp-tag">
                        <i className="fas fa-check" aria-hidden="true" />
                        {cell.better}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}

            {features && (
              <div className="cmp-row" role="row">
                <div className="cmp-label" role="rowheader">
                  <i className="fas fa-list-ul" aria-hidden="true" />
                  Only on this one
                </div>
                {features.map((list, i) => (
                  <div className={`cmp-cell${list.length ? "" : " is-missing"}`} role="cell" key={chosen[i].slug}>
                    {list.length ? (
                      <>
                        <ul className="cmp-features">
                          {list.slice(0, FEATURES_SHOWN).map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                        {/* One listing can carry twenty features; in a narrow
                            column that is a screen of its own. */}
                        {list.length > FEATURES_SHOWN && (
                          <details className="cmp-more">
                            <summary>{list.length - FEATURES_SHOWN} more</summary>
                            <ul className="cmp-features">
                              {list.slice(FEATURES_SHOWN).map((x) => (
                                <li key={x}>{x}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </>
                    ) : (
                      <span className="cmp-value">Nothing more listed</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="cmp-row cmp-row--actions" role="row">
              <div className="cmp-label" role="rowheader">
                <i className="fas fa-arrow-right" aria-hidden="true" />
                Next step
              </div>
              {chosen.map((car) => (
                <div className="cmp-cell cmp-actions" role="cell" key={car.slug}>
                  <Link href={car.href} className="cmp-btn cmp-btn--primary" aria-label={`See the ${car.name}`}>
                    See this car
                  </Link>
                  <Link href={car.next.href} className="cmp-btn" aria-label={`${car.next.label}: ${car.name}`}>
                    {car.next.label}
                  </Link>
                  {car.rentHref && (
                    <Link href={car.rentHref} className="cmp-textlink" aria-label={`Rent the ${car.name}`}>
                      Rent it
                    </Link>
                  )}
                  {recallsHref && (
                    <Link href={recallsHref} className="cmp-textlink" aria-label={`Check the ${car.name}'s recalls`}>
                      Check its recalls
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>

          <p className="cmp-fine">
            <i className="fas fa-check" aria-hidden="true" /> marks a lower price, rent or deposit, a newer
            year, fewer miles or more seats. Facts and features are as each listing records them. See the
            car to confirm anything that matters to you.
          </p>
        </>
      )}

      {/* ── The picker ──────────────────────────────────────────────────── */}
      <dialog
        ref={dialog}
        className="cmp-sheet"
        aria-labelledby="cmp-sheet-h"
        onClose={close}
        onClick={(e) => {
          // A tap on the dimmed page behind the sheet closes it.
          if (e.target === e.currentTarget) close();
        }}
      >
        {slot != null && (
          <div className="cmp-sheet-in">
            <div className="cmp-sheet-top">
              <h2 className="cmp-sheet-h" id="cmp-sheet-h">
                {replacing ? "Change this car" : chosen.length === 0 ? "Pick a car" : "Pick another car"}
              </h2>
              <button type="button" className="cmp-sheet-x" onClick={close} aria-label="Close">
                <i className="fas fa-xmark" aria-hidden="true" />
              </button>
            </div>

            {replacing && (
              <div className="cmp-sheet-now">
                <span>
                  Now: <strong>{replacing.short}</strong>
                </span>
                {chosen.length > MIN_COMPARE && (
                  <Link
                    href={compareHref(market, withoutCar(slugs, replacing.slug))}
                    className="cmp-textlink"
                    onClick={close}
                  >
                    Remove it
                  </Link>
                )}
              </div>
            )}

            <div className="cmp-sheet-tools">
              <div className="cmp-chips" role="group" aria-label="Show">
                <button type="button" className="cmp-chip" aria-pressed={filter == null} onClick={() => setFilter(null)}>
                  All {cars.length}
                </button>
                {groups.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className="cmp-chip"
                    aria-pressed={filter === g}
                    onClick={() => setFilter(filter === g ? null : g)}
                  >
                    {GROUP_LABEL[g]} {cars.filter((c) => c.group === g).length}
                  </button>
                ))}
                {rentCount > 0 && rentCount < cars.length && (
                  <button
                    type="button"
                    className="cmp-chip"
                    aria-pressed={filter === "rent"}
                    onClick={() => setFilter(filter === "rent" ? null : "rent")}
                  >
                    For rent {rentCount}
                  </button>
                )}
              </div>
              <label className="cmp-search">
                <i className="fas fa-magnifying-glass" aria-hidden="true" />
                <span className="gd-sr">Search by make or model</span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search (optional)"
                  autoComplete="off"
                  enterKeyHint="search"
                />
              </label>
            </div>

            <p className="gd-sr" role="status" aria-live="polite">
              {shown.length} {shown.length === 1 ? "car" : "cars"} shown
            </p>

            {shown.length === 0 ? (
              <p className="cmp-sheet-none">No car matches. Clear the search or tap All.</p>
            ) : (
              <ul className="cmp-picks">
                {shown.map((car) => {
                  const taken = slugs.includes(car.slug);
                  const body = (
                    <>
                      <span className="cmp-pick-photo">
                        <Photo src={car.image} sizes="(min-width: 700px) 220px, 46vw" />
                        {taken && <span className="cmp-pick-tag">Already picked</span>}
                      </span>
                      <span className="cmp-pick-name">{car.short}</span>
                      <span className="cmp-pick-price">{car.price}</span>
                      {car.sub && <span className="cmp-pick-sub">{car.sub}</span>}
                    </>
                  );
                  return (
                    <li key={car.slug}>
                      {taken ? (
                        <span className="cmp-pick is-taken" aria-disabled="true">
                          {body}
                        </span>
                      ) : (
                        <Link
                          href={compareHref(market, withCarAt(slugs, slot, car.slug))}
                          className="cmp-pick"
                          onClick={close}
                          // The comparison is where the tap happened; don't jump to the top.
                          scroll={false}
                        >
                          {body}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
