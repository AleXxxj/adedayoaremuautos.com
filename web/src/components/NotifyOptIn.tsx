"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Turning browser notifications on, and off again.
 *
 * The permission prompt is never raised on arrival. A prompt a visitor did not
 * ask for is refused by most people and, in Chrome, refused permanently after
 * a couple of dismissals across the web — spend it on someone who has just
 * pressed a button that says what it is for, or do not spend it at all.
 *
 * On an iPhone this renders an explanation instead of a button. Apple only
 * allows web push from a site the person has added to their Home Screen, so a
 * button in Safari would open a prompt that cannot succeed. Saying why is more
 * use than a control that fails.
 */

type State =
  | "checking"
  | "unsupported"
  | "needs-install"   // iOS Safari, not yet added to the Home Screen
  | "off"
  | "on"
  | "blocked"
  | "working";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  // The VAPID key travels as URL-safe base64; PushManager wants raw bytes.
  // Backed by an explicit ArrayBuffer: PushManager's applicationServerKey is
  // typed as BufferSource, which a Uint8Array over a SharedArrayBuffer does
  // not satisfy.
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normal);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // iPadOS reports itself as a Mac; the touch points give it away.
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  // Safari's own, non-standard flag for a Home Screen app.
  (window.navigator as unknown as { standalone?: boolean }).standalone === true;

export function NotifyOptIn({ market }: { market: string }) {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Everything here reads browser APIs that do not exist during server
    // rendering, so the starting state is "checking" and the real answer
    // arrives asynchronously — which also keeps the state updates out of the
    // effect body, where React will not allow them.
    let cancelled = false;
    const settle = (next: State) => {
      if (!cancelled) setState(next);
    };

    void (async () => {
      const supported =
        "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

      if (!supported) {
        // An iPhone in a Safari tab is not "unsupported" — it is one Home
        // Screen away from working, and that is worth saying.
        settle(isIos() && !isStandalone() ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        settle("blocked");
        return;
      }

      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        settle(sub ? "on" : "off");
      } catch {
        settle("off");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setError(null);
    setState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      // register() resolves before the worker is usable; this waits for it.
      await navigator.serviceWorker.ready;

      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Notifications are not configured yet.");

      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          // Required by Chrome: every push must show something. We never send
          // a silent one anyway.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        }));

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), market }),
      });
      if (!res.ok) throw new Error("We could not save that. Please try again.");

      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setState("off");
    }
  }, [market]);

  const disable = useCallback(async () => {
    setState("working");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
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
