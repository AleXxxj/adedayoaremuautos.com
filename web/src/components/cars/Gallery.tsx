"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type TouchEvent } from "react";
import { canResize } from "@/lib/photo";

/** How far a finger has to travel sideways before it counts as a swipe. */
const SWIPE_PX = 40;

/**
 * A car's photos: one large photo, a swipe or an arrow to the next, a
 * counter, a row of thumbnails, and the same photos full screen.
 *
 * Nothing moves by itself. The legacy gallery played like a slideshow, which
 * is an irritation while someone studies a photo and fails WCAG 2.2.2 unless
 * it can be paused.
 *
 * Only the photo on show and the ones either side of it are in the page, so
 * a car with thirteen photos starts with one request at high priority and
 * the next swipe is already loaded. The rest arrive as they are reached.
 *
 * Full screen is a <dialog> opened with showModal(): the browser keeps the
 * keyboard inside it, closes it on Escape and gives focus back to the button
 * that opened it. Left and right arrow keys work in both views.
 */
export function Gallery({ images, name }: { images: string[]; name: string }) {
  const count = images.length;
  const [index, setIndex] = useState(0);
  const [full, setFull] = useState(false);
  const viewer = useRef<HTMLDialogElement>(null);
  const thumbs = useRef<HTMLUListElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  // A swipe ends with a click on some phones; it must not open full screen.
  const swiped = useRef(false);

  const go = useCallback(
    (to: number) => setIndex(((to % count) + count) % count),
    [count],
  );

  // The chosen thumbnail slides into view inside its own row. Not
  // scrollIntoView: that would also drag the page to the row.
  useEffect(() => {
    const row = thumbs.current;
    const chip = row?.children[index] as HTMLElement | undefined;
    if (!row || !chip) return;
    const left = chip.offsetLeft - row.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, left) });
  }, [index]);

  // The page behind the full-screen view stays where it was.
  useEffect(() => {
    if (!full) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [full]);

  if (count === 0) {
    return (
      <div className="gl-empty">
        <i className="fas fa-camera" aria-hidden="true" />
        Photos coming soon
      </div>
    );
  }

  const open = () => {
    const dialog = viewer.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    setFull(true);
  };

  const onKey = (e: KeyboardEvent) => {
    if (count < 2) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(index + 1);
    }
  };

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touch.current = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
    swiped.current = false;
  };

  const onTouchEnd = (e: TouchEvent) => {
    const from = touch.current;
    const t = e.changedTouches[0];
    touch.current = null;
    if (!from || !t || count < 2) return;
    const dx = t.clientX - from.x;
    const dy = t.clientY - from.y;
    // Mostly sideways, and far enough: otherwise it was a tap or a scroll.
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swiped.current = true;
    go(index + (dx < 0 ? 1 : -1));
  };

  // The photo on show and its two neighbors.
  const near = [...new Set([index, (index + 1) % count, (index - 1 + count) % count])];
  const position = `${index + 1} / ${count}`;

  return (
    <div className="gl" onKeyDown={onKey}>
      <div
        className="gl-stage"
        role="group"
        aria-roledescription="carousel"
        aria-label={`Photos of the ${name}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={(e) => {
          // A tap on the photo itself opens it full screen; the buttons over
          // it do their own thing.
          if (swiped.current) {
            swiped.current = false;
            return;
          }
          if (!(e.target as HTMLElement).closest("button")) open();
        }}
      >
        {near.map((n) => (
          <div className="gl-slide" key={images[n]} data-on={n === index}>
            <Image
              src={images[n]}
              alt={n === index ? `${name}, photo ${n + 1} of ${count}` : ""}
              fill
              sizes="(min-width: 1001px) 720px, 100vw"
              // The first photo is the largest thing on the first screen.
              loading={n === 0 ? "eager" : "lazy"}
              fetchPriority={n === 0 ? "high" : "low"}
              unoptimized={!canResize(images[n])}
            />
          </div>
        ))}

        {count > 1 && (
          <>
            <button
              type="button"
              className="gl-nav gl-nav--prev"
              aria-label="Previous photo"
              onClick={() => go(index - 1)}
            >
              <i className="fas fa-chevron-left" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="gl-nav gl-nav--next"
              aria-label="Next photo"
              onClick={() => go(index + 1)}
            >
              <i className="fas fa-chevron-right" aria-hidden="true" />
            </button>
          </>
        )}

        <p className="gl-count" aria-live="polite" aria-atomic="true">
          <span className="cd-sr">Photo </span>
          {position}
        </p>
        <button type="button" className="gl-full" onClick={open}>
          <i className="fas fa-expand" aria-hidden="true" />
          Full screen
        </button>
      </div>

      {count > 1 && (
        <ul className="gl-thumbs" ref={thumbs}>
          {images.map((src, n) => (
            <li key={src}>
              <button
                type="button"
                className="gl-thumb"
                aria-label={`Photo ${n + 1} of ${count}`}
                aria-current={n === index ? "true" : undefined}
                onClick={() => setIndex(n)}
              >
                <Image src={src} alt="" fill sizes="96px" unoptimized={!canResize(src)} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={viewer}
        className="gl-viewer"
        aria-label={`Photos of the ${name}, full screen`}
        onClose={() => setFull(false)}
      >
        <div className="gl-viewer-bar">
          <p className="gl-viewer-count" aria-live="polite" aria-atomic="true">
            <span className="cd-sr">Photo </span>
            {position}
          </p>
          <button type="button" className="gl-close" onClick={() => viewer.current?.close()}>
            Close
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </div>
        <div className="gl-viewer-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {/* Drawn only while open, so nothing this size loads until asked for. */}
          {full && (
            <Image
              key={images[index]}
              src={images[index]}
              alt={`${name}, photo ${index + 1} of ${count}`}
              fill
              sizes="100vw"
              unoptimized={!canResize(images[index])}
            />
          )}
          {count > 1 && (
            <>
              <button
                type="button"
                className="gl-nav gl-nav--prev"
                aria-label="Previous photo"
                onClick={() => go(index - 1)}
              >
                <i className="fas fa-chevron-left" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="gl-nav gl-nav--next"
                aria-label="Next photo"
                onClick={() => go(index + 1)}
              >
                <i className="fas fa-chevron-right" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}
