"use client";

import { useEffect, useRef } from "react";
import { motionOK } from "./sceneKit";
import { countAt, countStart, parseFigure, readProgress, writeFigure } from "./sceneMath";

/** The blocks of a guide that ease in as they are reached. */
const BLOCKS = ".gd-short, .gd-toolbox, .gd-toc, .gd-section, .gd-send, .gd-cta, .gd-group";

/** The figures that count up the first time they are seen. */
const FIGURES = ".gd-short li strong, .gd-card-stat";

const COUNT_MS = 900;

/**
 * What a guide page does as it is scrolled. Three things, none of which
 * takes the scroll away from the reader:
 *
 *   1. Blocks below the first screen ease in once as they arrive. Only
 *      blocks that are off screen when the page loads are ever hidden, and
 *      only by this script, so without JavaScript (or with reduced motion)
 *      the page is simply all there. A block that takes focus or is jumped
 *      to shows at once.
 *   2. Money and counts in "The short version" count up to their real value
 *      the first time they are on screen. They start most of the way there
 *      with the same number of digits, so no line changes length.
 *   3. On a guide, a thin line under the header shows how far down the page
 *      the reader is.
 *
 *   4. "The short version" ticks: when it is first on screen each of its
 *      check marks beats in turn (data-tick), whether the box eased in or
 *      was there from the start.
 *
 * Everything is a transform or an opacity; the scroll handler does one
 * read and one write a frame.
 */
export function ScrollLife({ progress = false }: { progress?: boolean }) {
  const bar = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const page = document.querySelector<HTMLElement>(".gd-page");
    if (!page) return;
    const undo: (() => void)[] = [];

    /* 3. Reading progress: shown with reduced motion too, since it only moves when the reader does. */
    const line = bar.current;
    if (line) {
      let queued = 0;
      const draw = () => {
        queued = 0;
        const p = readProgress(window.scrollY, document.documentElement.scrollHeight, window.innerHeight);
        line.style.transform = `scaleX(${p.toFixed(4)})`;
      };
      const ask = () => {
        if (!queued) queued = requestAnimationFrame(draw);
      };
      draw();
      window.addEventListener("scroll", ask, { passive: true });
      window.addEventListener("resize", ask, { passive: true });
      undo.push(() => {
        cancelAnimationFrame(queued);
        window.removeEventListener("scroll", ask);
        window.removeEventListener("resize", ask);
      });
    }

    if (!motionOK() || typeof IntersectionObserver !== "function") return () => undo.forEach((f) => f());

    /* 1. Blocks ease in. */
    const show = (el: Element) => el.setAttribute("data-reveal", "in");
    const blocks = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          show(e.target);
          blocks.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px" },
    );
    const fold = window.innerHeight * 0.92;
    page.querySelectorAll<HTMLElement>(BLOCKS).forEach((el) => {
      if (el.getBoundingClientRect().top < fold) return;
      el.setAttribute("data-reveal", "wait");
      blocks.observe(el);
    });
    // Reached by keyboard or by a link to it: there at once.
    const reach = (e: Event) => {
      const el = e.target instanceof Element ? e.target.closest("[data-reveal='wait']") : null;
      if (el) show(el);
    };
    const jump = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const el = id ? document.getElementById(id)?.closest("[data-reveal='wait']") : null;
      if (el) show(el);
    };
    page.addEventListener("focusin", reach);
    window.addEventListener("hashchange", jump);
    undo.push(() => {
      blocks.disconnect();
      page.removeEventListener("focusin", reach);
      window.removeEventListener("hashchange", jump);
      page.querySelectorAll("[data-reveal]").forEach((el) => el.removeAttribute("data-reveal"));
    });

    /* 4. The short version ticks. */
    const ticks = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-tick", "");
          ticks.unobserve(e.target);
        }
      },
      { threshold: 0.5 },
    );
    page.querySelectorAll(".gd-short").forEach((el) => ticks.observe(el));
    undo.push(() => {
      ticks.disconnect();
      page.querySelectorAll("[data-tick]").forEach((el) => el.removeAttribute("data-tick"));
    });

    /* 2. Figures count up. */
    const frames = new Set<number>();
    const figures = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          figures.unobserve(e.target);
          const el = e.target as HTMLElement;
          const real = el.textContent ?? "";
          const f = parseFigure(real);
          // Only plain text: a figure with a link or markup inside is left alone.
          if (!f || el.childElementCount > 0) continue;
          const from = countStart(f.value);
          if (from === f.value) continue;
          const start = performance.now();
          let raf = 0;
          const tick = (now: number) => {
            frames.delete(raf);
            const t = (now - start) / COUNT_MS;
            if (t >= 1) {
              el.textContent = real;
              return;
            }
            el.textContent = writeFigure(f, countAt(from, f.value, t));
            raf = requestAnimationFrame(tick);
            frames.add(raf);
          };
          el.dataset.real = real;
          raf = requestAnimationFrame(tick);
          frames.add(raf);
        }
      },
      { threshold: 0.6 },
    );
    page.querySelectorAll(FIGURES).forEach((el) => figures.observe(el));
    undo.push(() => {
      figures.disconnect();
      frames.forEach((id) => cancelAnimationFrame(id));
      page.querySelectorAll<HTMLElement>("[data-real]").forEach((el) => {
        el.textContent = el.dataset.real ?? el.textContent;
        delete el.dataset.real;
      });
    });

    return () => undo.forEach((f) => f());
  }, []);

  if (!progress) return null;
  return (
    <span className="gd-read" aria-hidden="true">
      <span ref={bar} />
    </span>
  );
}
