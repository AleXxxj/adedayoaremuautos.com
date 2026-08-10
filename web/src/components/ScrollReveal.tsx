"use client";

import { useEffect } from "react";

/**
 * Reveals sections as they enter the viewport.
 *
 * Mounted once in the layout and applied by selector rather than by wrapping
 * every section, so the ported markup stays untouched and a page added later
 * gets the behaviour for free.
 *
 * Progressive enhancement, in that order deliberately:
 *
 *  1. Nothing is hidden by the stylesheet. The initial state is written as an
 *     inline style by this component after it mounts, and removed to reveal.
 *     If the script never runs, no style is ever applied and every section
 *     renders visible — content is never lost to an animation that did not
 *     fire. Inline also sidesteps the cascade entirely, which matters on a
 *     page carrying eight thousand lines of ported CSS.
 *  2. Anything already on screen at load is shown immediately without a
 *     transition, so the first paint is not a page of empty boxes fading in.
 *  3. Reduced-motion is honoured by leaving entirely.
 *  4. A plain scroll listener rather than IntersectionObserver. The observer
 *     is the usual choice, but it does not fire while a document is not being
 *     rendered — a backgrounded tab, an offscreen frame — and a section that
 *     was hidden on mount then stays hidden. A rect check on a passive,
 *     rAF-throttled scroll handler cannot get stuck that way, and on a page of
 *     this size costs nothing measurable.
 */
const SECTIONS = [
  ".services",
  ".featured",
  ".about-section",
  ".blog-section",
  ".features",
  ".contact-section",
  ".rental-types",
  ".terms-section",
  ".steps-section",
  ".eligibility-section",
  ".plans-section",
  ".calculator-section",
  ".application-section",
  ".intro-section",
  ".section",
  ".how-we-work",
  ".blog-grid-section",
  ".featured-post",
  ".newsletter-section",
  ".map-section",
].join(",");

export function ScrollReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const targets = Array.from(document.querySelectorAll<HTMLElement>(SECTIONS));
    if (targets.length === 0) return;

    let pending: HTMLElement[] = [];

    for (const el of targets) {
      // Above the fold at load: left alone. A page that fades itself in on
      // arrival reads as slow, not as considered.
      if (el.getBoundingClientRect().top < window.innerHeight * 0.9) continue;
      el.style.opacity = "0";
      el.style.transform = "translate3d(0, 22px, 0)";
      el.style.willChange = "opacity, transform";
      pending.push(el);
    }

    if (pending.length === 0) return;

    const clear = (el: HTMLElement) => {
      el.style.opacity = "";
      el.style.transform = "";
      el.style.willChange = "";
      el.style.transition = "";
    };

    const show = (el: HTMLElement) => {
      el.style.transition =
        "opacity 0.7s cubic-bezier(0.2,0.7,0.3,1), transform 0.7s cubic-bezier(0.2,0.7,0.3,1)";
      el.style.opacity = "1";
      el.style.transform = "none";
      // will-change is a promise to the compositor, not decoration: holding it
      // after the transition keeps a layer alive for nothing.
      window.setTimeout(() => {
        el.style.willChange = "";
        el.style.transition = "";
      }, 800);
    };

    const check = () => {
      // Slightly inside the edge, so a section has settled by the time it is
      // properly in view rather than animating under the reader's eye.
      const line = window.innerHeight * 0.92;
      const still: HTMLElement[] = [];
      for (const el of pending) {
        if (el.getBoundingClientRect().top < line) show(el);
        else still.push(el);
      }
      pending = still;
      if (pending.length === 0) detach();
    };

    // Called straight from the scroll handler rather than deferred to an
    // animation frame. requestAnimationFrame does not run while a document is
    // not being rendered, which would leave a section that was hidden on mount
    // hidden for good. A handful of rect reads against a list that empties as
    // it goes is cheap enough to do synchronously.
    const onScroll = check;

    // A poll alongside the listener, not instead of it. Hiding content and
    // waiting for an event to give it back is a bet on that event arriving,
    // and there are real conditions where it does not — a scroll driven by
    // something other than the window, an anchor jump, an environment that
    // does not dispatch scroll at all. The listener keeps it responsive; this
    // guarantees nothing stays invisible. It stops itself the moment the last
    // section has been shown.
    const timer = window.setInterval(check, 400);

    const detach = () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.clearInterval(timer);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    check();

    return () => {
      detach();
      // Never leave a section invisible because the component unmounted.
      for (const el of pending) clear(el);
    };
  }, []);

  return null;
}
