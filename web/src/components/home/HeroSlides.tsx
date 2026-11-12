"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type ReactNode,
  type TouchEvent,
} from "react";
import { canResize } from "@/lib/photo";
import type { HeroSlide } from "./heroDeck";

export type { HeroSlide };

/** How long a car is shown. Its segment and its zoom run for as long. */
const CAR_MS = 6000;
/** A rent-to-own slide has three short sentences to read, so it stays longer. */
const OWN_MS = 9000;
const timeFor = (s: HeroSlide) => (s.kind === "own" ? OWN_MS : CAR_MS);

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(onChange: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * The home page's hero: the cars for sale, one after another, above the
 * page's first words, with a rent-to-own slide after every second car.
 *
 * Each slide shows for a few seconds with a slow zoom, then crossfades to
 * the next. A car slide leaves the standing words in place; a rent-to-own
 * slide swaps them for its own, over a rental car's photo. Both sets of
 * words share one grid cell, so the taller one sets the height and the
 * buttons under them never move.
 *
 * Nothing covers the car. The controls are one quiet strip along the bottom
 * edge of the photo: a row of thin segments, each a button to its slide, the
 * current one filling as its time runs; a small pause button at the end; and
 * above the strip's start, the name of the car in the photo as a link to its
 * page. Swiping across the hero changes slide on a phone.
 *
 * It stops by itself whenever it would be moving for nobody, or in someone's
 * way: while the tab is hidden, while the hero is scrolled out of sight, and
 * while keyboard focus is inside it. The pause button stops it for good
 * (WCAG 2.2.2). Someone who asked their system for less motion gets no
 * auto-advance and no zoom; the segments still work.
 *
 * The words are not a live region: a screen reader is not interrupted every
 * few seconds, and the pause button is the way to hold a slide. The words
 * that are not showing are inert, so their link can't be reached unseen.
 *
 * The advance is driven by the segment's own fill animation ending, so the
 * bar and the change of slide can never drift apart, and pausing the
 * animation pauses the show exactly where it was.
 *
 * The first photo is rendered on the server and loaded eagerly at high
 * priority (it is the page's largest image). Each other photo is fetched
 * only once it is next.
 */
export function HeroSlides({
  slides,
  fallback,
  head,
  ownHead,
  children,
}: {
  slides: HeroSlide[];
  /** The photo when there is no car to show. */
  fallback: string;
  /** The standing eyebrow, headline and line, rendered on the server. */
  head: ReactNode;
  /** The rent-to-own slide's own eyebrow, headline and line; null when no slide is one. */
  ownHead: ReactNode | null;
  /** The buttons and links under the words: the same on every slide. */
  children: ReactNode;
}) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  // Photos that have been current or next; they stay mounted for crossfades.
  const [loaded, setLoaded] = useState<number[]>(count > 1 ? [0, 1] : [0]);
  const [userPaused, setUserPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const reduced = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
  const section = useRef<HTMLElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const auto = count > 1 && !reduced;
  const running = auto && !userPaused && !hidden && !offscreen && !focusInside;

  const goTo = useCallback(
    (to: number) => {
      if (count < 2) return;
      const i = ((to % count) + count) % count;
      setIndex(i);
      setLoaded((l) => {
        const next = (i + 1) % count;
        const add = [i, next].filter((n) => !l.includes(n));
        return add.length ? [...l, ...add] : l;
      });
    },
    [count],
  );

  // Hidden tab.
  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Scrolled out of sight.
  useEffect(() => {
    const el = section.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Keyboard focus inside. A tap or click on a button gives it focus too, but
  // not :focus-visible, so pressing a segment does not freeze the show.
  const onFocus = (e: FocusEvent<HTMLElement>) => {
    let keyboard = true;
    try {
      keyboard = e.target.matches(":focus-visible");
    } catch {
      /* An older browser: treat any focus as the keyboard's. */
    }
    if (keyboard) setFocusInside(true);
  };
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusInside(false);
  };

  // A swipe across the hero, not a scroll down it.
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touch.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    const t = e.changedTouches[0];
    touch.current = null;
    if (!start || !t || count < 2) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) goTo(index + (dx < 0 ? 1 : -1));
  };

  const current = slides[index];
  const previous = count > 1 ? (index - 1 + count) % count : -1;
  const own = Boolean(ownHead) && current?.kind === "own";

  return (
    <section
      ref={section}
      className="hh"
      onFocus={onFocus}
      onBlur={onBlur}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      data-running={running ? "true" : "false"}
      data-slide={own ? "own" : "car"}
    >
      <div className="hh-photos" aria-hidden="true">
        {count === 0 ? (
          // Still: a zoom here would be motion with no pause button.
          <div className="hh-photo hh-photo--still">
            <Image src={fallback} alt="" fill sizes="100vw" loading="eager" fetchPriority="high" />
          </div>
        ) : (
          slides.map((s, i) =>
            loaded.includes(i) ? (
              <div
                // By position: a rental car's photo can come round twice.
                key={i}
                className={`hh-photo${i === index ? " is-current" : ""}${i === previous ? " is-previous" : ""}`}
                style={{
                  animationDuration: `${timeFor(s)}ms`,
                  animationPlayState: running ? "running" : "paused",
                }}
              >
                <Image
                  src={s.src}
                  alt=""
                  fill
                  sizes="100vw"
                  // The first photo is the page's largest paint: fetched at once
                  // and first (Next 16 asks for eager loading here, not
                  // preload). The others wait until they are next.
                  loading={i === 0 ? "eager" : undefined}
                  fetchPriority={i === 0 ? "high" : undefined}
                  unoptimized={!canResize(s.src)}
                />
              </div>
            ) : null,
          )
        )}
      </div>

      <div className="hh-body">
        <div className="hh-inner">
          <div className="hh-copy">
            {/* Both sets of words in one grid cell (home.css): the taller sets
                the height, so the buttons below stay where they are. */}
            <div className="hh-heads">
              <div className={`hh-head${own ? "" : " is-on"}`} inert={own} aria-hidden={own || undefined}>
                {head}
              </div>
              {ownHead && (
                <div className={`hh-head${own ? " is-on" : ""}`} inert={!own} aria-hidden={!own || undefined}>
                  {ownHead}
                </div>
              )}
            </div>
            {children}
          </div>
        </div>
      </div>

      {/* After the words in the page's order, so a keyboard reaches the
          buttons first. Shown along the bottom edge of the photo, above the
          words, on a phone, and at the bottom right on a wide screen
          (home.css). */}
      {count > 0 && current && (
        <div className="hh-dock">
          <div className="hh-controls" role="group" aria-label="Photos of our cars">
            <Link
              href={current.href}
              className="hh-now"
              aria-label={`${current.name}${current.note ? `, ${current.note}` : ""}`}
            >
              {/* A long name is cut short; its price never is. */}
              <span className="hh-now-car">{current.name}</span>
              {current.note && <span className="hh-now-note">· {current.note}</span>}
              <i className="fas fa-arrow-right" aria-hidden="true" />
            </Link>

            {count > 1 && (
              <div className="hh-track">
                <div className="hh-segments">
                  {slides.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`hh-seg${i < index ? " is-done" : ""}${i === index ? " is-current" : ""}`}
                      aria-label={`Show photo ${i + 1} of ${count}: ${s.kind === "own" ? "Rent to own" : s.name}`}
                      aria-current={i === index ? "true" : undefined}
                      onClick={() => goTo(i)}
                    >
                      <span className="hh-seg-bar">
                        {i === index && (
                          <span
                            // A new element per slide, so its fill starts empty.
                            key={`fill-${index}`}
                            className={`hh-seg-fill${auto ? " is-timed" : ""}`}
                            style={{
                              animationDuration: `${timeFor(s)}ms`,
                              animationPlayState: running ? "running" : "paused",
                            }}
                            onAnimationEnd={() => goTo(index + 1)}
                          />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
                {auto && (
                  <button
                    type="button"
                    className="hh-pause"
                    aria-label={userPaused ? "Play the slideshow" : "Pause the slideshow"}
                    onClick={() => setUserPaused((p) => !p)}
                  >
                    <i className={`fas ${userPaused ? "fa-play" : "fa-pause"}`} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
