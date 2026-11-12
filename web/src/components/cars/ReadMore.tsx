"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * A car's description, four lines of it until "Read more" is tapped.
 *
 * The whole text is in the page from the start, so a search engine and a
 * screen reader get all of it; the four-line limit is only how it is drawn.
 * A description that already fits in four lines gets no button. Without
 * scripts the limit is lifted, so nothing is ever out of reach.
 */
export function ReadMore({ text }: { text: string }) {
  const id = useId();
  const box = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  // A guess for the first paint, so a short text never flashes a button; the
  // real answer comes from measuring it, below.
  const [fits, setFits] = useState(() => text.length <= 140 && text.split("\n").length <= 4);

  useEffect(() => {
    const el = box.current;
    if (!el || open) return;
    const measure = () => setFits(el.scrollHeight <= el.clientHeight + 1);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, text]);

  return (
    <div className="cd-about" data-clamped={!open}>
      <p className="cd-about-text" id={id} ref={box}>
        {text}
      </p>
      {!(fits && !open) && (
        <button
          type="button"
          className="cd-about-more"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
      <noscript>
        <style>{`.legacy-theme .cd-about[data-clamped="true"] .cd-about-text{display:block;overflow:visible}.legacy-theme .cd-about-more{display:none}`}</style>
      </noscript>
    </div>
  );
}
