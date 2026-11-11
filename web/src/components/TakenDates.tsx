"use client";

import { useSyncExternalStore } from "react";

export interface TakenWindow {
  /** "Nov 20 – Nov 27", formatted on the server. */
  label: string;
  /**
   * When a reservation's hold ends, as an ISO string. Null for a confirmed or
   * active hire, which stays taken whatever the clock says.
   */
  heldUntil: string | null;
}

/*
 * The moment this page came alive in the browser.
 *
 * Cached, because useSyncExternalStore asks for it on every render and must
 * get the same answer each time; a fresh Date.now() per call would never
 * settle. On the server there is no "now" worth trusting — the page is
 * cached and may be served hours later — so the server snapshot is 0, which
 * means "list everything".
 */
let loadedAt = 0;
const subscribeNothing = () => () => {};
const browserNow = () => (loadedAt ||= Date.now());
const serverNow = () => 0;

/**
 * Dates that are gone, with reservations that have run out left off.
 *
 * The vehicle page is cached for five minutes and refreshed when a booking
 * changes — but a hold mostly ends by the clock, with no change to trigger a
 * refresh. Listed on the server alone, a hold that lapsed in the night would
 * still read "These dates are taken" to the next visitor, who might well pick
 * other dates or leave. So the server sends each hold's end with it and the
 * browser drops the ones already over.
 */
export function TakenDates({ windows }: { windows: TakenWindow[] }) {
  const now = useSyncExternalStore(subscribeNothing, browserNow, serverNow);
  const shown = now
    ? windows.filter((w) => !w.heldUntil || Date.parse(w.heldUntil) > now)
    : windows;

  if (shown.length === 0) return null;

  return (
    <section className="rental-block">
      <h2>Already booked</h2>
      <p className="rental-block-lead">These dates are taken. Anything else is open.</p>
      <ul className="rental-taken">
        {shown.map((w, i) => (
          <li key={i}>
            <i className="fas fa-calendar-xmark" aria-hidden="true" />
            {w.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
