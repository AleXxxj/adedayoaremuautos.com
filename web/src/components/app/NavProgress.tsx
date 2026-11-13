"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A thin line along the top of the screen from the tap on a link until the
 * next page is showing.
 *
 * A page that needs the database takes a moment to arrive, and until it does
 * the old page stays put. Without this, a tap looks like nothing happened and
 * people tap again.
 *
 * It starts on a click on any same-site link that leads somewhere else, and
 * finishes when the address has changed. It is drawn by setting an attribute
 * on one element, so starting it never re-renders anything. Styles are in
 * app-shell.css; under reduced motion it is a still line.
 */
export function NavProgress() {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let giveUp: ReturnType<typeof setTimeout> | undefined;

    function onClick(e: MouseEvent) {
      // Not "was it canceled": the framework's links cancel every click and
      // then load the page themselves, so a canceled click is the usual case.
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      let to: URL;
      try {
        to = new URL(link.href);
      } catch {
        return;
      }
      if (to.origin !== window.location.origin) return;
      // The same page (or a jump within it): nothing will load.
      if (to.pathname === window.location.pathname && to.search === window.location.search) return;
      const el = bar.current;
      if (!el) return;
      el.dataset.state = "loading";
      clearTimeout(giveUp);
      // A download, or a page that never arrives: don't leave it running.
      giveUp = setTimeout(() => {
        el.dataset.state = "idle";
      }, 12000);
    }

    // On the way down (capture), so it runs before anything on the page can
    // stop the click from reaching the document.
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimeout(giveUp);
    };
  }, []);

  return (
    <>
      <div ref={bar} className="nav-progress" data-state="idle" aria-hidden="true" />
      {/* useSearchParams needs a Suspense boundary on prerendered pages. */}
      <Suspense fallback={null}>
        <Arrived bar={bar} />
      </Suspense>
    </>
  );
}

/** Finishes the bar when the address changes. */
function Arrived({ bar }: { bar: React.RefObject<HTMLDivElement | null> }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    const el = bar.current;
    if (!el || el.dataset.state !== "loading") return;
    el.dataset.state = "done";
    const t = setTimeout(() => {
      if (el.dataset.state === "done") el.dataset.state = "idle";
    }, 420);
    return () => clearTimeout(t);
  }, [bar, pathname, search]);

  return null;
}
