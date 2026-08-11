"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export interface HeroSlide {
  key: string;
  /** Small label above the headline. Optional. */
  eyebrow?: { icon: string; text: string };
  /** Headline, split so the middle part can carry the accent colour. */
  title: [string, string, string];
  body: string;
  image: string;
  /** Optional designed composition, shown beside the copy on wide screens. */
  art?: "ownership" | "figures";
  actions: { href: string; label: string; icon: string; primary?: boolean }[];
}

const INTERVAL_MS = 7000;

/**
 * The hero, as a slider.
 *
 * The business leads with rent to own, so that is the first slide and it is in
 * the server-rendered HTML — the marketing message is the first thing painted
 * and the first thing a crawler reads, with no interstitial and nothing to
 * dismiss. "Opens on first load" without costing a conversion.
 *
 * Behaviour that a carousel has to get right, and most do not:
 *
 *  - Every slide is in the DOM at all times. Inactive ones are hidden with
 *    `inert` and taken out of the accessibility tree, so a screen reader and
 *    the tab order see exactly what a sighted visitor sees.
 *  - Autoplay stops permanently the moment anyone interacts. A slide moving
 *    under someone reaching for a button is the single worst carousel failure.
 *  - It also pauses on hover, on keyboard focus anywhere inside, and whenever
 *    the tab is in the background — a timer advancing through slides nobody
 *    is watching is just wasted work.
 *  - Reduced motion means no autoplay at all: the controls still work, the
 *    slide simply never moves on its own.
 */
/**
 * The illustration for a slide, drawn rather than photographed.
 *
 * A photograph of a car does not say "ownership" or "these figures are the
 * real ones" — it says "car", which the middle slide already says. These carry
 * the idea instead: an arc filling towards a key, and a figure resolving.
 *
 * Drawn in SVG and CSS because it costs a few hundred bytes, scales to any
 * screen, needs no photographer, and cannot be mistaken for stock.
 */
function HeroArt({ kind }: { kind: "ownership" | "figures" }) {
  if (kind === "ownership") {
    // 72% of the way round: far enough to read as real progress, short enough
    // that the eye finishes the journey.
    const r = 86;
    const circumference = 2 * Math.PI * r;
    return (
      <div className="hero-art" aria-hidden="true">
        <svg viewBox="0 0 220 220" className="hero-art-ring">
          <circle className="hero-art-track" cx="110" cy="110" r={r} />
          <circle
            className="hero-art-progress"
            cx="110"
            cy="110"
            r={r}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * 0.28}
          />
        </svg>
        <div className="hero-art-centre">
          <i className="fas fa-key" />
          <span className="hero-art-caption">rent paid</span>
          <strong className="hero-art-value">towards yours</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="hero-art hero-art--figures" aria-hidden="true">
      <div className="hero-art-rows">
        <div>
          <span>Vehicle</span>
          <em />
        </div>
        <div>
          <span>Deposit</span>
          <em />
        </div>
        <div className="is-total">
          <span>Monthly</span>
          <em />
        </div>
      </div>
      <div className="hero-art-stamp">
        <i className="fas fa-equals" /> same figures on the agreement
      </div>
    </div>
  );
}

export function HeroSlider({
  slides,
  market,
}: {
  slides: HeroSlide[];
  /** Shown once above the slides, so it does not blink between them. */
  market: { code: string; label: string; currency: string };
}) {
  const [index, setIndex] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [paused, setPaused] = useState(false);
  const region = useRef<HTMLDivElement>(null);

  const count = slides.length;
  const go = useCallback(
    (next: number) => {
      setEngaged(true);
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (count < 2 || engaged || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = window.setInterval(() => {
      // Never advance while the tab is in the background.
      if (document.visibilityState !== "visible") return;
      setIndex((i) => (i + 1) % count);
    }, INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [count, engaged, paused]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(index - 1);
    }
  };

  return (
    <div
      className="hero hero--slider"
      ref={region}
      // A carousel is a group of related content, not a live region: announcing
      // every automatic change would talk over whatever is being read.
      role="group"
      aria-roledescription="carousel"
      aria-label="Adedayo Aremu Autos highlights"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={onKeyDown}
    >
      {slides.map((s, i) => (
        <div
          key={s.key}
          className={`hero-slide${i === index ? " is-active" : ""}`}
          style={{ backgroundImage: `url('${s.image}')` }}
          aria-hidden={i !== index}
          // inert keeps hidden slides out of the tab order and the
          // accessibility tree; aria-hidden alone leaves the buttons focusable.
          inert={i !== index ? true : undefined}
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${count}`}
        >
          <div className="hero-content">
            {/* In each slide's flow rather than positioned once over them all:
                an offset tuned to one slide's headline collides with the next
                one. Repeating the markup costs nothing — inactive slides are
                inert, so only the visible badge is in the accessibility
                tree — and the layout cannot drift. */}
            <div className="market-flag" data-market={market.code}>
              <i className="fas fa-location-dot" aria-hidden="true" />
              <span className="market-flag-label">{market.label}</span>
              <span className="market-flag-sep" aria-hidden="true" />
              <span className="market-flag-currency">{market.currency}</span>
            </div>

            {s.eyebrow && (
              <span className="hero-eyebrow">
                <i className={s.eyebrow.icon} aria-hidden="true" /> {s.eyebrow.text}
              </span>
            )}
            <h2>
              {s.title[0]}
              <span>{s.title[1]}</span>
              {s.title[2]}
            </h2>
            <p>{s.body}</p>
            <div className="hero-buttons">
              {s.actions.map((a) => (
                <Link
                  key={a.href + a.label}
                  href={a.href}
                  className={`btn ${a.primary ? "btn-primary" : "btn-outline"}`}
                >
                  <i className={a.icon} /> {a.label}
                </Link>
              ))}
            </div>
          </div>

          {s.art && <HeroArt kind={s.art} />}
        </div>
      ))}

      {count > 1 && (
        <div className="hero-controls">
          <button
            type="button"
            className="hero-arrow"
            onClick={() => go(index - 1)}
            aria-label="Previous slide"
          >
            <i className="fas fa-chevron-left" aria-hidden="true" />
          </button>

          <div className="hero-dots">
            {slides.map((s, i) => (
              <button
                key={s.key}
                type="button"
                className={`hero-dot${i === index ? " is-active" : ""}`}
                onClick={() => go(i)}
                aria-label={`Show slide ${i + 1}: ${s.title.join("")}`}
                aria-current={i === index}
              >
                {/* The fill doubles as the autoplay timer, so the movement on
                    screen is honest about what is about to happen. */}
                <span
                  className="hero-dot-fill"
                  data-running={i === index && !engaged && !paused ? "" : undefined}
                  style={{ animationDuration: `${INTERVAL_MS}ms` }}
                />
              </button>
            ))}
          </div>

          <button
            type="button"
            className="hero-arrow"
            onClick={() => go(index + 1)}
            aria-label="Next slide"
          >
            <i className="fas fa-chevron-right" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
