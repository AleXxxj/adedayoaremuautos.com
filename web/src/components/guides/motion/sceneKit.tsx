"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Image from "next/image";
import { formatMoney, money, type CurrencyCode } from "@/lib/money";
import { canResize } from "@/lib/photo";
import { countAt } from "./sceneMath";

/**
 * What every scene is built on: the frame that decides when a scene plays,
 * a clock for the ones drawn frame by frame, a number that counts to its
 * real value, and the line a tool uses to tell its scene what was chosen.
 *
 * HOW A SCENE PLAYS. The server draws each scene's last frame: the still a
 * visitor with reduced motion (or no JavaScript) keeps. In a browser that
 * allows motion, the frame plays the scene once, the first time half of it
 * is on screen, and it ends on that same still. Nothing loops: a "play
 * again" button replays it. A scene never moves focus and never changes its
 * size, so the page under it stays where it is.
 *
 * WHAT MOVES. Transforms and opacity only. A scene that is off screen has
 * its animations paused (data-off), and a clock stops with the tab.
 */

export function motionOK(): boolean {
  return typeof window.matchMedia !== "function" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ── A tool tells its scene what was chosen ────────────────────────────── */

export type SceneSignal =
  | { tool: "three-way"; key: string }
  | { tool: "budget"; major: number }
  | { tool: "cost-story"; side: "cheap" | "pricier" | null; at: number }
  | { tool: "road-trip"; place: string | null };

const EVENT = "gd:scene";

/** Called by a tool when its choice changes. Carries ids and numbers, and goes nowhere but this page. */
export function signalScene(signal: SceneSignal) {
  window.dispatchEvent(new CustomEvent<SceneSignal>(EVENT, { detail: signal }));
}

/** The latest signal for a tool, for its scene. */
export function useSceneSignal<T extends SceneSignal["tool"]>(tool: T, on: (s: Extract<SceneSignal, { tool: T }>) => void) {
  const latest = useRef(on);
  useEffect(() => {
    latest.current = on;
  });
  useEffect(() => {
    const hear = (e: Event) => {
      const s = (e as CustomEvent<SceneSignal>).detail;
      if (s?.tool === tool) latest.current(s as Extract<SceneSignal, { tool: T }>);
    };
    window.addEventListener(EVENT, hear);
    return () => window.removeEventListener(EVENT, hear);
  }, [tool]);
}

/* ── The frame ─────────────────────────────────────────────────────────── */

/** Told when the visitor's "reduce motion" setting changes. */
function subscribeMotion(listener: () => void) {
  const query = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
}

/**
 * When a scene plays.
 *
 *   run   0 until the scene first plays, then the number of the play. The
 *         stage is drawn again for each play, so its animations start over.
 *   wait  until the browser has decided whether to play, the stage is held
 *         back (see .sc[data-wait]), so the last frame never jumps to the first.
 *   can   whether this browser plays scenes at all: motion allowed, and a
 *         way to know when the scene is on screen.
 */
export function useScene() {
  // The figure itself, once it is on the page.
  const [el, attach] = useState<HTMLElement | null>(null);
  const [run, setRun] = useState(0);
  const mode = useSyncExternalStore(
    subscribeMotion,
    () => (motionOK() && typeof IntersectionObserver === "function" ? "play" : "still"),
    () => "server",
  );
  const can = mode === "play";

  useEffect(() => {
    if (!el || !can) return;
    let played = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        el.toggleAttribute("data-off", !entry.isIntersecting);
        if (!played && entry.intersectionRatio >= 0.5) {
          played = true;
          setRun((r) => r || 1);
        }
      },
      { threshold: [0, 0.5] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, can]);

  const replay = useCallback(() => {
    if (motionOK()) setRun((r) => r + 1);
  }, []);

  return { attach, run, wait: mode === "server" || (can && run === 0), can, replay };
}

/** The figure a scene sits in: the stage (decoration), the same facts in words, and "play again". */
export function SceneFrame({
  kind,
  scene,
  caption,
  children,
}: {
  kind: string;
  scene: ReturnType<typeof useScene>;
  caption: string;
  children: ReactNode;
}) {
  const { attach, run, wait, can, replay } = scene;
  return (
    <figure className={`sc sc--${kind}`} ref={attach} data-wait={wait ? "" : undefined} data-run={run || undefined}>
      <div className="sc-stage" aria-hidden="true" key={run}>
        {children}
      </div>
      <figcaption className="sc-cap">{caption}</figcaption>
      {can && run > 0 && (
        <button type="button" className="sc-replay" onClick={replay} aria-label="Play the animation again">
          <i className="fas fa-rotate-right" aria-hidden="true" />
        </button>
      )}
    </figure>
  );
}

/* ── A clock ───────────────────────────────────────────────────────────── */

/**
 * Calls `frame(t)` with t from 0 to 1 over `ms`, each time `run` changes to
 * a play. It always finishes on frame(1), the still the server drew, even in
 * a tab that stops drawing.
 */
export function useTimeline(run: number, ms: number, frame: (t: number) => void) {
  const latest = useRef(frame);
  useEffect(() => {
    latest.current = frame;
  });
  useLayoutEffect(() => {
    if (run === 0 || !motionOK()) return;
    let raf = 0;
    const start = performance.now();
    latest.current(0);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      latest.current(t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const settle = window.setTimeout(() => latest.current(1), ms + 400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      latest.current(1);
    };
  }, [run, ms]);
}

/* ── A number that counts to its real value ────────────────────────────── */

/**
 * Shows `value`. When a play starts it counts up from zero; when the value
 * changes mid-scene it counts from the figure it was showing. It ends on the
 * real value, which is also what the server drew.
 */
export function SceneNumber({
  value,
  format,
  run,
  ms = 900,
  delay = 0,
}: {
  value: number;
  format: (n: number) => string;
  run: number;
  ms?: number;
  delay?: number;
}) {
  const node = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  // -1: a number drawn into a stage that is already playing counts from zero.
  const lastRun = useRef(-1);
  const fmt = useRef(format);
  useEffect(() => {
    fmt.current = format;
  });

  useLayoutEffect(() => {
    const el = node.current;
    if (!el) return;
    const fresh = lastRun.current !== run;
    lastRun.current = run;
    const from = fresh ? 0 : shown.current;
    const finish = () => {
      shown.current = value;
      el.textContent = fmt.current(value);
    };
    if (run === 0 || !motionOK() || from === value) return finish();
    let raf = 0;
    const start = performance.now() + (fresh ? delay : 0);
    shown.current = from;
    el.textContent = fmt.current(from);
    const tick = (now: number) => {
      const t = (now - start) / ms;
      if (t >= 1) return finish();
      if (t > 0) {
        shown.current = countAt(from, value, t);
        el.textContent = fmt.current(shown.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const settle = window.setTimeout(finish, ms + delay + 400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
    };
  }, [value, run, ms, delay]);

  return <span ref={node}>{format(value)}</span>;
}

/** A real car from stock as it appears in a scene: a small photo with weight under it. */
export function SceneCar({ image, className = "", sizes = "128px" }: { image: string; className?: string; sizes?: string }) {
  return (
    <span className={`sc-car ${className}`}>
      <Image src={image} alt="" fill sizes={sizes} unoptimized={!canResize(image)} />
    </span>
  );
}

/** Money as the guides write it. */
export function sceneMoney(currency: CurrencyCode, locale: string) {
  return (minor: number) => formatMoney(money(minor, currency), locale);
}

export interface SceneProps<S> {
  scene: S;
  currency: CurrencyCode;
  locale: string;
}
