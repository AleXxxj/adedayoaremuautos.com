"use client";

import { useEffect, useState } from "react";

/**
 * Back to the top of the page, on phones.
 *
 * The public pages are long on a narrow screen — the homepage stacks nine
 * sections into roughly twenty screens of scrolling — and the only way back
 * up was to swipe repeatedly. The header is fixed, so navigating elsewhere was
 * never the problem; returning to where you started was.
 *
 * It sits on the left because the right is taken: the assistant launcher is
 * fixed at right: 20px, bottom: 20px, and a second control stacked on top of
 * it would either overlap the chat panel when that opens or crowd the thumb.
 * Left and right as a pair reads as deliberate rather than as two things that
 * happen to float.
 */
export function BackToTop() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // One screen's worth. Appearing sooner puts a control over content the
    // reader can still see the top of, which is just clutter.
    //
    // No requestAnimationFrame to coalesce this. It is tempting, but rAF is
    // suspended while a tab is in the background, so the button's state would
    // depend on whether the page happened to be on screen — and the work here
    // is one comparison. Passing an unchanged value to a state setter is a
    // no-op in React, so a scroll that crosses nothing costs no render.
    const onScroll = () => setShown(window.scrollY > window.innerHeight);

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toTop = () => {
    // Honour a reader who has asked the system for less movement — a long page
    // smooth-scrolled from the bottom is a lot of motion.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      onClick={toTop}
      className={`back-to-top${shown ? " is-shown" : ""}`}
      aria-label="Back to top"
      // Kept out of the tab order and the accessibility tree while hidden, so
      // it is never a stop for a keyboard or a screen reader on a page where
      // it is not visible.
      aria-hidden={!shown}
      tabIndex={shown ? 0 : -1}
    >
      <i className="fas fa-arrow-up" aria-hidden="true" />
    </button>
  );
}
