"use client";

import { useCallback, useEffect, useState } from "react";
import {
  detectPushState,
  subscribeBrowser,
  unsubscribeBrowser,
  type PushState,
} from "@/lib/push/client";

/**
 * Turning browser notifications on, and off again.
 *
 * The permanent control, beside the mailing list. The prompt that appears
 * after a visitor has looked around is NotifyPrompt; both go through
 * lib/push/client so they can never disagree about what state a browser is in.
 *
 * This one never raises the permission box on its own — only when the button
 * is pressed, by somebody who has just read what it is for.
 */

type State = PushState;

export function NotifyOptIn({ market }: { market: string }) {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Browser APIs that do not exist during server rendering, so the starting
    // state is "checking" and the answer arrives asynchronously — which also
    // keeps the state update out of the effect body, where React forbids it.
    let cancelled = false;
    void detectPushState().then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setError(null);
    setState("working");
    try {
      await subscribeBrowser(market);
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setState("off");
    }
  }, [market]);

  const disable = useCallback(async () => {
    setState("working");
    try {
      await unsubscribeBrowser();
      setState("off");
    } catch {
      setState("on");
    }
  }, []);

  if (state === "checking" || state === "unsupported") return null;

  return (
    <div className="notify-optin">
      {state === "needs-install" && (
        <p className="notify-optin-note">
          <i className="fas fa-mobile-screen" aria-hidden="true" />
          <span>
            To get alerts on an iPhone, tap <strong>Share</strong> then{" "}
            <strong>Add to Home Screen</strong>, and open the site from there.
            Apple only allows notifications that way.
          </span>
        </p>
      )}

      {state === "blocked" && (
        <p className="notify-optin-note">
          <i className="fas fa-bell-slash" aria-hidden="true" />
          <span>
            Notifications are blocked for this site in your browser settings.
            You will need to allow them there first.
          </span>
        </p>
      )}

      {(state === "off" || state === "working") && (
        <button
          type="button"
          className="notify-optin-btn"
          onClick={enable}
          disabled={state === "working"}
        >
          <i className="fas fa-bell" aria-hidden="true" />
          {state === "working" ? "Just a moment…" : "Notify me about new cars & offers"}
        </button>
      )}

      {state === "on" && (
        <div className="notify-optin-on">
          <p>
            <i className="fas fa-circle-check" aria-hidden="true" />
            You will hear about new arrivals and offers.
          </p>
          <button type="button" onClick={disable}>
            Turn off
          </button>
        </div>
      )}

      {error && <p className="notify-optin-error">{error}</p>}
    </div>
  );
}
