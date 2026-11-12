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

export interface HeroSlide {
  src: string;
  /** "2016 Hyundai Elantra SE" */
  name: string;
  /** "$9,500", or null when the car has no published price. */
  price: string | null;
  href: string;
}

/** How long each car is shown. The segment and the zoom run for as long. */
const SLIDE_MS = 6000;

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(onChange: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * The home page's hero: the cars for sale, one after another, behind the
 * page's first words.
 *
 * Each car shows for six seconds with a slow zoom, then crossfades to the
 * next. A row of thin segments says where the show is, each one a button to
 * its car; the current one fills as its time runs. Swiping across the hero
 * changes car on a phone.
 *
 * It stops by itself whenever it would be moving for nobody, or in someone's
 * way: while the tab is hidden, while the hero is scrolled out of sight, and
 * while keyboard focus is inside it. The pause button stops it for good
 * (WCAG 2.2.2). Someone who asked their system for less motion gets no
 * auto-advance and no zoom; the segments still work.
 *
 * The advance is driven by the segment's own fill animation ending, so the
 * bar and the change of car can never drift apart, and pausing the animation
 * pauses the show exactly where it was.
 *
 * The first photo is rendered on the server and loaded eagerly at high
 * priority (it is the page's largest image). Each other photo is fetched
 * only once it is next.
 */
export function HeroSlides({
  slides,
  fallback,
  children,
}: {
  slides: HeroSlide[];
  /** The photo when there is no car to show. */
  fallback: string;
  /** The hero's words and buttons, rendered on the server. */
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

  return (
    <section
      ref={section}
      className="hh"
      onFocus={onFocus}
      onBlur={onBlur}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      data-running={running ? "true" : "false"}
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
                key={s.href}
                className={`hh-photo${i === index ? " is-current" : ""}${i === previous ? " is-previous" : ""}`}
                style={{ animationPlayState: running ? "running" : "paused" }}
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
          <div className="hh-copy">{children}</div>
        </div>
      </div>

      {/* After the words in the page's order, so a keyboard reaches the
          buttons first. Shown over the top of the photo on a phone, and at
          the bottom right on a wide screen (home.css). */}
      {count > 0 && current && (
        <div className="hh-dock">
          <div className="hh-controls" role="group" aria-label="Cars for sale">
            <Link href={current.href} className="hh-now">
              <span className="hh-now-label">Now showing</span>
              <span className="hh-now-car">
                {current.name}
                {current.price ? ` · ${current.price}` : ""}
              </span>
              <i className="fas fa-arrow-right" aria-hidden="true" />
            </Link>

            {count > 1 && (
              <div className="hh-track">
                <div className="hh-segments">
                  {slides.map((s, i) => (
                    <button
                      key={s.href}
                      type="button"
                      className={`hh-seg${i < index ? " is-done" : ""}${i === index ? " is-current" : ""}`}
                      aria-label={`Show car ${i + 1} of ${count}: ${s.name}`}
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
                              animationDuration: `${SLIDE_MS}ms`,
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
