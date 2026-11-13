"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (public/sw.js) on every visit.
 *
 * It used to be registered only when someone turned notifications on. The
 * worker now also shows the "You're offline" page when a page can't be
 * reached, and that has to be in place before the connection drops.
 *
 * After the page has loaded, so it never competes with the first screen.
 * Not in development: a worker left behind by `next dev` answers for
 * localhost long after the server has stopped.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Private windows and old browsers refuse. The site works without it. */
      });
    };
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
