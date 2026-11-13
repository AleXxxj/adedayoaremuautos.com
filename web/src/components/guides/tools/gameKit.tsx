"use client";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

/**
 * The parts the guides' tools share: a progress line with the moment a step
 * earns, a buzz for a tap, a number that counts up, a small store for a score kept in this browser, the hash of a shared
 * link, and a heading that takes focus when the game moves on.
 *
 * WHAT IS KEPT, AND WHERE. A game keeps numbers and ids only (a best score,
 * the name of a result), in this browser's localStorage, under its own key.
 * Nothing is sent anywhere. With storage switched off, the value lasts for
 * the visit.
 */

/* ── A value kept in this browser ──────────────────────────────────────── */

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function read(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return memory.get(key) ?? "";
  }
}

function write(key: string, raw: string) {
  memory.set(key, raw);
  try {
    if (raw) window.localStorage.setItem(key, raw);
    else window.localStorage.removeItem(key);
  } catch {
    // Kept in memory above.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** The raw text under a key ("" when there is none), and a way to replace it. */
export function useStored(key: string): [string, (raw: string) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => "",
  );
  return [raw, (next) => write(key, next)];
}

/** A best score kept as "4-5": never trusted, so anything else reads as none. */
export function parseBest(raw: string): { score: number; of: number } | null {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (!m) return null;
  const score = Number(m[1]);
  const of = Number(m[2]);
  return of >= 1 && score <= of ? { score, of } : null;
}

/* ── The hash of a shared link ─────────────────────────────────────────── */

function subscribeHash(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

/** "#score=4-5" as the page was opened, or "" on the server and with none. */
export function useHash(): string {
  return useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => "",
  );
}

/* ── Moving on ─────────────────────────────────────────────────────────── */

/**
 * A ref for the heading of the current step. Call `moved()` just before the
 * step changes: once it has, the heading takes focus (so a screen reader
 * starts reading there) and is brought into view if it has left the screen.
 */
export function useStepFocus<T extends HTMLElement>(step: unknown) {
  const ref = useRef<T>(null);
  const pending = useRef(false);
  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const top = el.getBoundingClientRect().top;
    if (top < 80 || top > window.innerHeight * 0.6) el.scrollIntoView({ block: "start", behavior: "auto" });
  }, [step]);
  return {
    ref,
    moved: () => {
      pending.current = true;
    },
  };
}

/* ── Progress ──────────────────────────────────────────────────────────── */

/**
 * A thin line that fills as the game goes on, with "2 of 6" beside it.
 *
 * @param moment a word for a step that earned one ("3 in a row", "Halfway").
 *   It lands over the end of the line, so nothing below it moves, and it is
 *   read out politely.
 */
export function Progress({
  done,
  of,
  label,
  moment = null,
}: {
  done: number;
  of: number;
  label: string;
  moment?: string | null;
}) {
  const pct = of > 0 ? Math.round((Math.min(done, of) / of) * 100) : 0;
  return (
    <div className="gm-progress">
      {/* Scaled, not resized: the line flows to its new length without a layout. */}
      <div className="gm-progress-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <p className="gm-progress-text">{label}</p>
      <Moment text={moment} />
    </div>
  );
}

/** The word a step earned. Keyed by its text, so each new one lands afresh. */
export function Moment({ text }: { text: string | null }) {
  return (
    <p className="gm-moment" role="status" aria-live="polite">
      {text && (
        <span key={text}>
          <i className="fas fa-bolt" aria-hidden="true" />
          {text}
        </span>
      )}
    </p>
  );
}

/* ── A tap that is felt ────────────────────────────────────────────────── */

/**
 * A short buzz on phones that have one (Android; an iPhone ignores it), for
 * an answer or a result. Never with reduced motion, and never a pattern.
 */
export function buzz(ms = 12) {
  try {
    if (!allowsMotion() || typeof navigator.vibrate !== "function") return;
    navigator.vibrate(Math.min(20, Math.max(0, ms)));
  } catch {
    // A browser that refuses is simply silent.
  }
}

/* ── A tool tells the page it has an answer worth sending ──────────────── */

const RESULT = "gd:result";
let shown = 0;

/** Called by a tool once it has shown an answer. Carries nothing, and goes nowhere but this page. */
export function signalResult() {
  shown += 1;
  window.dispatchEvent(new Event(RESULT));
}

/** The count so far, for a button that should beat only for answers shown after it arrived. */
export const resultsShown = () => shown;

function subscribeResult(listener: () => void) {
  window.addEventListener(RESULT, listener);
  return () => window.removeEventListener(RESULT, listener);
}

/** How many answers this page's tool has shown: the share button under it beats once for the first. */
export function useResultSignal(): number {
  return useSyncExternalStore(
    subscribeResult,
    () => shown,
    () => 0,
  );
}

/* ── A number that counts up ───────────────────────────────────────────── */

const COUNT_MS = 600;

/**
 * Counts from zero to `value` once, when it appears or changes. The moving
 * figure is for the eye only: a screen reader is given the final value, and
 * with reduced motion (or a tab that isn't drawing) the final value is shown
 * at once.
 */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const node = useRef<HTMLSpanElement>(null);
  // The latest formatter, without restarting the count when its identity changes.
  const fmt = useRef(format);
  useEffect(() => {
    fmt.current = format;
  });

  // React draws the final value; the count is written over it on the node
  // itself, before the first paint, and always ends on the final value.
  useLayoutEffect(() => {
    const el = node.current;
    if (!el) return;
    const still =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still || document.hidden) return;
    let frame = 0;
    const start = performance.now();
    const finish = () => {
      el.textContent = fmt.current(value);
    };
    el.textContent = fmt.current(0);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      if (t >= 1) return finish();
      // Ease out: fast, then settling.
      el.textContent = fmt.current(Math.round(value * (1 - Math.pow(1 - t, 3))));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // A tab that stops drawing still ends on the right number.
    const settle = window.setTimeout(finish, COUNT_MS + 200);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      finish();
    };
  }, [value]);

  return (
    <>
      <span aria-hidden="true" ref={node}>
        {format(value)}
      </span>
      <span className="gd-sr">{format(value)}</span>
    </>
  );
}

/* ── A photo that carries from one step to the next ────────────────────── */

function allowsMotion() {
  return typeof window.matchMedia !== "function" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Makes one picture seem to travel between two steps: call `take(el)` with
 * the picture as it is now, just before the step changes, and put `ref` on
 * the picture in the next step. The new one starts where the old one was and
 * settles into its own place (a transform only; nothing else on the page
 * moves). With reduced motion it is simply in its place.
 */
export function useCarry<T extends HTMLElement>(step: unknown) {
  const ref = useRef<T>(null);
  const from = useRef<DOMRect | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const a = from.current;
    from.current = null;
    if (!el || !a || !allowsMotion() || typeof el.animate !== "function") return;
    const b = el.getBoundingClientRect();
    if (!a.width || !b.width || !b.height) return;
    el.animate(
      [
        {
          transformOrigin: "top left",
          transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`,
        },
        { transformOrigin: "top left", transform: "none" },
      ],
      { duration: 560, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
  }, [step]);
  return {
    ref,
    take: (el: Element | null | undefined) => {
      from.current = el ? el.getBoundingClientRect() : null;
    },
  };
}

/* ── A friend's result, from the link they sent ────────────────────────── */

export function FriendNote({ children }: { children: ReactNode }) {
  return (
    <p className="gm-friend">
      <i className="fas fa-user-group" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
