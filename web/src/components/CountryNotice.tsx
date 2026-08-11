"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

const DISMISSED_KEY = "aaa.market-notice.dismissed";

/** Nothing else writes this key, so there is no external change to subscribe to. */
const subscribeToNothing = () => () => {};

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) !== null;
  } catch {
    // Private browsing can throw on access. Someone who cannot be remembered
    // should still see the offer, not crash the page.
    return false;
  }
}

/**
 * "We noticed you're visiting from X."
 *
 * Ported from the legacy site, which had the markup and the styling but no
 * geolocation behind it — the element shipped with `style="display: none"` and
 * nothing ever set the country.
 *
 * It suggests; it never redirects. A visitor lands on the market the link
 * pointed at, and this offers to move them:
 *
 *  - A US link shared into Lagos still opens the page it promised. Silent
 *    geo-redirects break every shared link, every ad destination and every
 *    QR code the moment the reader is in the other country.
 *  - Googlebot crawls predominantly from the United States. Redirecting on
 *    country would hide the Nigerian market from the index entirely.
 *  - A VPN, a traveller or a diaspora customer is never trapped in a market
 *    they did not choose.
 *
 * The dismissal is remembered, because being asked the same question on every
 * page is worse than not being asked at all.
 */
export function CountryNotice({
  currentMarket,
  suggested,
}: {
  currentMarket: string;
  /** Resolved on the server from the edge geo header. Null when it matches. */
  suggested: { code: string; country: string; currency: string } | null;
}) {
  const router = useRouter();
  const [dismissedNow, setDismissedNow] = useState(false);

  // localStorage is an external store, so it is read through the hook built
  // for that rather than copied into state from an effect — which would cost a
  // second render and, with the React Compiler on, refuse to compile.
  //
  // The server snapshot is `true` — treat it as dismissed. Rendering nothing
  // on the server and letting the client decide means the notice can never
  // appear in the HTML and then vanish on hydration.
  const previouslyDismissed = useSyncExternalStore(
    subscribeToNothing,
    readDismissed,
    () => true,
  );

  if (!suggested || previouslyDismissed || dismissedNow) return null;

  const remember = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* Nothing to do; the notice simply reappears next time. */
    }
  };

  const dismiss = () => {
    remember();
    setDismissedNow(true);
  };

  const accept = () => {
    remember();
    setDismissedNow(true);
    router.push(`/${suggested.code}`);
  };

  return (
    <div className="country-notification" role="dialog" aria-label="Change market">
      <div className="notification-content">
        <i className="fas fa-globe" aria-hidden="true" />

        <div className="notification-text">
          <strong>We noticed you&rsquo;re visiting from {suggested.country}</strong>
          <p>
            You are seeing the {currentMarket.toUpperCase()} site. Switch for
            local stock and prices in {suggested.currency}?
          </p>
        </div>

        <div className="notification-buttons">
          <button type="button" className="btn-notification yes" onClick={accept}>
            Switch to {suggested.country}
          </button>
          <button type="button" className="btn-notification no" onClick={dismiss}>
            Stay here
          </button>
        </div>

        <button
          type="button"
          className="notification-close"
          onClick={dismiss}
          aria-label="Dismiss"
        >
          <i className="fas fa-times" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
