/**
 * The arithmetic behind the guides' motion: easing, a spring, where a car is
 * along a route, how far a needle swings, which digit an odometer shows.
 *
 * Pure functions with no React and no DOM, so the build checks them
 * (scripts/verify-guides.ts). The rule they keep: an animation may take any
 * path it likes, but it ENDS on the real figure. Every function here that is
 * given t = 1 returns the true value exactly.
 */

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const clamp01 = (n: number) => clamp(n, 0, 1);

/* ── Easing ────────────────────────────────────────────────────────────── */

/** Fast, then settling. */
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

/** A car pulling away and braking: slow, fast, slow. */
export function easeInOut(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** A car on a road: it gathers speed and sheds it evenly, with no long wait at either end. */
export function easeDrive(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

/**
 * A damped spring from 0 to 1: it passes 1, comes back, and rests there.
 * Exactly 0 at the start and exactly 1 at the end.
 */
export function spring(t: number): number {
  const x = clamp01(t);
  if (x === 0 || x === 1) return x;
  return 1 - Math.exp(-6.5 * x) * Math.cos(11 * x);
}

/** The figure a count shows at time t: whole, never past `to`, and `to` itself at the end. */
export function countAt(from: number, to: number, t: number): number {
  if (t >= 1) return to;
  return Math.round(from + (to - from) * easeOut(t));
}

/* ── Bars that race ────────────────────────────────────────────────────── */

/**
 * How long each bar is beside the longest, 0 to 1. A missing figure has no
 * bar; a real one is never drawn so short that it can't be seen.
 */
export function barScales(values: (number | null)[]): number[] {
  const top = Math.max(0, ...values.map((v) => v ?? 0));
  return values.map((v) => (v == null || v <= 0 || top === 0 ? 0 : Math.max(0.04, v / top)));
}

/* ── A needle ──────────────────────────────────────────────────────────── */

/** The needle rests this far from straight up at "too low" and "too high", in degrees. */
export const GAUGE_SWING = 70;

/** A guess this far off (as a share of the price) pins the needle. */
const GAUGE_FULL = 0.6;

/**
 * Where the needle rests for a guess: straight up (0) when it is the price,
 * left when it is under, right when it is over, pinned at the ends.
 */
export function gaugeAngle(guessMinor: number, priceMinor: number): number {
  if (priceMinor <= 0 || guessMinor === priceMinor) return 0;
  const off = (guessMinor - priceMinor) / priceMinor;
  const angle = clamp(off / GAUGE_FULL, -1, 1) * GAUGE_SWING;
  // A near miss still leans the right way, far enough to see.
  return Math.sign(angle) * Math.max(8, Math.abs(Math.round(angle)));
}

export type GaugeWord = "low" | "right" | "high";

export const gaugeWord = (guessMinor: number, priceMinor: number): GaugeWord =>
  guessMinor === priceMinor ? "right" : guessMinor < priceMinor ? "low" : "high";

/* ── An odometer ───────────────────────────────────────────────────────── */

/** The digits of a whole number, padded on the left to `places` wheels. */
export function odometerDigits(value: number, places: number): number[] {
  const whole = Math.max(0, Math.round(value));
  const text = String(whole).padStart(places, "0").slice(-places);
  return [...text].map(Number);
}

/* ── A route on a map ──────────────────────────────────────────────────── */

export interface Point {
  x: number;
  y: number;
}

/** Miles between two places as the crow flies. */
export function crowMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

export interface Bounds {
  north: number;
  south: number;
  west: number;
  east: number;
}

/** The box that holds every place. */
export function boundsOf(places: { lat: number; lng: number }[]): Bounds {
  return {
    north: Math.max(...places.map((p) => p.lat)),
    south: Math.min(...places.map((p) => p.lat)),
    west: Math.min(...places.map((p) => p.lng)),
    east: Math.max(...places.map((p) => p.lng)),
  };
}

/**
 * A place on the scene, as percentages of its width and height (north up,
 * east right), kept `pad` percent clear of every edge. The box is stretched
 * to fill the scene, so directions are right and distances are not to scale
 * (the miles a visitor reads are the routed ones).
 */
export function project(place: { lat: number; lng: number }, b: Bounds, pad = 12): Point {
  const span = (a: number, z: number) => (z - a === 0 ? 1 : z - a);
  const fx = (place.lng - b.west) / span(b.west, b.east);
  const fy = (b.north - place.lat) / span(b.south, b.north);
  return { x: pad + fx * (100 - 2 * pad), y: pad + fy * (100 - 2 * pad) };
}

export interface Route {
  from: Point;
  to: Point;
  /** The curve's control point: a road is never a ruler line. */
  via: Point;
}

/** A gently bent line between two points. `bend` is the bow as a share of the length. */
export function route(from: Point, to: Point, bend = 0.16): Route {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Bow upward, whichever way the trip runs.
  const up = dx >= 0 ? 1 : -1;
  return { from, to, via: { x: mx + dy * bend * up, y: my - dx * bend * up } };
}

/** The point a share t of the way along the route: the start at 0, the end at 1. */
export function routePoint(r: Route, t: number): Point {
  const x = clamp01(t);
  const u = 1 - x;
  return {
    x: u * u * r.from.x + 2 * u * x * r.via.x + x * x * r.to.x,
    y: u * u * r.from.y + 2 * u * x * r.via.y + x * x * r.to.y,
  };
}

/** Dots along a route for a trip this long: more road, more dots, within reason. */
export function routeDots(r: Route, miles: number): Point[] {
  const n = clamp(Math.round(miles / 9), 8, 34);
  return Array.from({ length: n + 1 }, (_, i) => routePoint(r, i / n));
}

/** How long the marker takes: a longer trip takes longer to watch, between 1.3 and 3.4 seconds. */
export const tripMs = (miles: number) => clamp(Math.round(1000 + miles * 8), 1300, 3400);

/* ── A year on a road ──────────────────────────────────────────────────── */

/** "Month 6" is month 6; anything else ("On the lot") happens on day one. */
export function storyMonth(when: string): number {
  const m = /^Month (\d{1,2})$/.exec(when);
  return m ? clamp(Number(m[1]), 0, 12) : 0;
}

/** The share of the road given to day one, where several choices are made before driving off. */
export const STORY_DAY_ONE = 0.3;
const DAY_ONE = STORY_DAY_ONE;

/**
 * Where each of the story's moments sits along a twelve-month road, 0 to 1,
 * always moving forward. The day-one moments share the first stretch; the
 * months are placed by their number, so month 12 is the end of the road.
 */
export function storyStops(whens: readonly string[]): number[] {
  const months = whens.map(storyMonth);
  const dayOne = months.filter((m) => m === 0).length;
  let seen = 0;
  return months.map((m) => {
    if (m === 0) {
      seen += 1;
      return dayOne > 1 ? (DAY_ONE * 0.85 * (seen - 1)) / (dayOne - 1) : 0;
    }
    return DAY_ONE + (1 - DAY_ONE) * (m / 12);
  });
}

/* ── The page ──────────────────────────────────────────────────────────── */

/** How far down the page a reader is, 0 to 1. A page with nothing to scroll is read. */
export function readProgress(scrollY: number, pageHeight: number, viewHeight: number): number {
  const room = pageHeight - viewHeight;
  return room <= 0 ? 1 : clamp01(scrollY / room);
}

/** Which card's middle is nearest the middle of the screen, or -1 with none on screen. */
export function nearestToCenter(cards: { top: number; bottom: number }[], viewHeight: number): number {
  const mid = viewHeight / 2;
  let best = -1;
  let gap = Infinity;
  cards.forEach((c, i) => {
    if (c.bottom <= 0 || c.top >= viewHeight) return;
    const d = Math.abs((c.top + c.bottom) / 2 - mid);
    if (d < gap) {
      gap = d;
      best = i;
    }
  });
  return best;
}

/** How a card leans toward the pointer: degrees about each axis, flat at its center. */
export function tilt(px: number, py: number, width: number, height: number, max = 5): { rx: number; ry: number } {
  if (width <= 0 || height <= 0) return { rx: 0, ry: 0 };
  const fx = clamp(px / width, 0, 1) - 0.5;
  const fy = clamp(py / height, 0, 1) - 0.5;
  const round = (n: number) => Math.round(n * 100) / 100 || 0;
  return { rx: round(-fy * 2 * max), ry: round(fx * 2 * max) };
}

/* ── A figure in a sentence ────────────────────────────────────────────── */

export interface Figure {
  before: string;
  value: number;
  after: string;
  /** Whether the figure was written with thousands commas. */
  commas: boolean;
}

/**
 * The first whole-number figure in a short piece of text ("$1,200 a month"),
 * or null where counting it up would mislead: a year, a figure with cents,
 * or no figure at all.
 */
export function parseFigure(text: string): Figure | null {
  const m = /^(\D*?)(\d{1,3}(?:,\d{3})+|\d+)(?![\d.,]*\d)([\s\S]*)$/.exec(text);
  if (!m) return null;
  const value = Number(m[2].replace(/,/g, ""));
  const money = m[1].trimEnd().endsWith("$");
  // "2014" on its own is a model year, not an amount.
  if (!money && !m[2].includes(",") && value >= 1900 && value <= 2100) return null;
  if (value < 2) return null;
  return { before: m[1], value, after: m[3], commas: m[2].includes(",") || value < 1000 };
}

/** The figure back in its sentence, with `value` in place of the real one. */
export function writeFigure(f: Figure, value: number): string {
  const n = f.commas ? value.toLocaleString("en-US") : String(value);
  return `${f.before}${n}${f.after}`;
}

/**
 * Where a count in a sentence starts from: most of the way there, and with
 * as many digits as the real figure, so the line never changes its length.
 */
export function countStart(value: number): number {
  const floor = Math.pow(10, String(Math.round(value)).length - 1);
  return Math.min(value, Math.max(floor, Math.round(value * 0.6)));
}
