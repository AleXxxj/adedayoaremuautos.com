"use client";

import { useCallback, useEffect, useState } from "react";
import {
  detectPushState,
  subscribeBrowser,
  isIos,
  isStandalone,
  type PushState,
} from "@/lib/push/client";

/**
 * Asks, in our own words, before the browser asks in its.
 *
 * The browser's permission box can only be raised once per visitor in any
 * meaningful sense: Chrome counts dismissals across every site a person
 * visits and, past a threshold, stops showing the prompt on this one
 * permanently. Firing it on arrival spends that single chance on somebody who
 * has seen one page and has no reason yet to want anything.
 *
 * So this is a card of our own. Refusing it costs nothing — the real
 * permission box has not been opened and remains available later — while
 * accepting it means the browser's prompt is shown to someone who has already
 * said yes, which is the only way to get a good answer out of it.
 *
 * Every rule below exists to stop it becoming the thing the owner was right to
 * worry about:
 *
 *  - Not on a first page view. Two pages is the cheapest honest signal that
 *    somebody is actually looking rather than passing through.
 *  - Once. Dismissed, it stays away for two months; accepted, forever.
 *  - Never while the country notice is on screen, because two cards stacked
 *    over the content of a page is exactly how this earns its reputation.
 *  - Never on top of a form somebody is filling in.
 */

const DISMISSED_KEY = "aaa.notify-prompt.dismissed";
const VIEWS_KEY = "aaa.notify-prompt.views";
const QUIET_DAYS = 60;

/** Page views in this session, counted before deciding to interrupt anybody. */
function bumpViews(): number {
  try {
    const n = Number(window.sessionStorage.getItem(VIEWS_KEY) ?? "0") + 1;
    window.sessionStorage.setItem(VIEWS_KEY, String(n));
    return n;
  } catch {
    // Private browsing can throw. Someone who cannot be counted is treated as
    // a first-time visitor, which errs towards not interrupting.
    return 1;
  }
}

function recentlyDismissed(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISSED_KEY) ?? "0");
    if (!at) return false;
    return Date.now() - at < QUIET_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function remember(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    /* Nothing to do; it may ask again next time. */
  }
}

export function NotifyPrompt({ market }: { market: string }) {
  const [show, setShow] = useState(false);
  const [state, setState] = useState<PushState>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const views = bumpViews();
      if (views < 2 || recentlyDismissed()) return;

      const current = await detectPushState();
      if (cancelled) return;

      // Already on, already refused at browser level, or nothing we can do —
      // in every case there is nothing worth asking.
      if (current === "on" || current === "blocked" || current === "unsupported") return;

      // An iPhone that has not been installed can be told how, but it is a
      // longer ask, so it waits until somebody is clearly engaged.
      if (current === "needs-install" && views < 3) return;

      // Let the country notice finish its business first. Both are fixed cards
      // over the page and two at once is an ambush.
      if (document.querySelector(".country-notification")) return;

      // A breath after the page settles, so it does not arrive mid-paint.
      const timer = window.setTimeout(() => {
        if (!cancelled) {
          setState(current);
          setShow(true);
        }
      }, 2500);
      return () => window.clearTimeout(timer);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    remember();
    setShow(false);
  }, []);

  const accept = useCallback(async () => {
    setError(null);
    setState("working");
    try {
      await subscribeBrowser(market);
      remember();
      setState("on");
      // Left up for a moment so the answer is visible, then out of the way.
      window.setTimeout(() => setShow(false), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setState("off");
    }
  }, [market]);

  if (!show) return null;

  const installing = state === "needs-install" || (isIos() && !isStandalone());

  return (
    <div className="notify-prompt" role="dialog" aria-label="Notifications">
      <button
        type="button"
        className="notify-prompt-close"
        onClick={dismiss}
        aria-label="No thanks"
      >
        <i className="fas fa-times" aria-hidden="true" />
      </button>

      <div className="notify-prompt-body">
        <i className="fas fa-bell notify-prompt-icon" aria-hidden="true" />

        {state === "on" ? (
          <div>
            <strong>You&rsquo;re all set.</strong>
            <p>We&rsquo;ll let you know when something new arrives.</p>
          </div>
        ) : installing ? (
          <div>
            <strong>Get new arrivals on your iPhone</strong>
            <p>
              Tap <i className="fas fa-arrow-up-from-bracket" aria-hidden="true" />{" "}
              <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
              Open the site from there and we can send you alerts — Apple only
              allows it that way.
            </p>
            <div className="notify-prompt-actions">
              <button type="button" className="notify-prompt-no" onClick={dismiss}>
                Got it
              </button>
            </div>
          </div>
        ) : (
          <div>
            <strong>Want to know when a car arrives?</strong>
            <p>
              We&rsquo;ll alert you about new stock and offers. No email needed,
              and you can turn it off whenever you like.
            </p>
            {error && <p className="notify-prompt-error">{error}</p>}
            <div className="notify-prompt-actions">
              <button
                type="button"
                className="notify-prompt-yes"
                onClick={accept}
                disabled={state === "working"}
              >
                {state === "working" ? "Just a moment…" : "Yes, notify me"}
              </button>
              <button type="button" className="notify-prompt-no" onClick={dismiss}>
                No thanks
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
