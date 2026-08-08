#!/usr/bin/env node
/**
 * WCAG 2.1 contrast validator for the brand palette.
 *
 * Runs in CI and as part of `npm run build`. A palette change that breaks
 * legibility fails the build instead of shipping. The current live site has a
 * hero headline that is unreadable against its own background photo; this
 * exists so that class of bug cannot recur silently.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const palette = JSON.parse(
  readFileSync(join(here, "../src/styles/palette.json"), "utf8"),
);

/** "#RRGGBB" -> [r, g, b] in 0..255 */
function parseHex(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a 6-digit hex color: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance (sRGB). */
function luminance(hex) {
  const [r, g, b] = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1..21. */
function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Resolve "brand.500" against the palette. */
function tok(path) {
  const value = path
    .split(".")
    .reduce((acc, k) => (acc === undefined ? undefined : acc[k]), palette);
  if (typeof value !== "string") {
    throw new Error(`Unknown palette token: ${path}`);
  }
  return value;
}

// ── Thresholds ────────────────────────────────────────────────────────────
// 4.5  AA body text
// 3.0  AA large text (>=24px, or >=19px bold) and non-text UI boundaries
const AA_TEXT = 4.5;
const AA_LARGE = 3.0;
const AA_UI = 3.0;

/** [foreground, background, minimum, label] */
const checks = [
  // ── Dark theme: text on the surface ladder ──────────────────────────────
  ["darkText.primary", "darkSurface.0", AA_TEXT, "body on page"],
  ["darkText.primary", "darkSurface.1", AA_TEXT, "body on card"],
  ["darkText.primary", "darkSurface.2", AA_TEXT, "body on raised"],
  ["darkText.primary", "darkSurface.3", AA_TEXT, "body on hover"],
  ["darkText.secondary", "darkSurface.0", AA_TEXT, "secondary on page"],
  ["darkText.secondary", "darkSurface.1", AA_TEXT, "secondary on card"],
  ["darkText.secondary", "darkSurface.2", AA_TEXT, "secondary on raised"],
  ["darkText.muted", "darkSurface.0", AA_TEXT, "muted on page"],
  ["darkText.muted", "darkSurface.1", AA_TEXT, "muted on card"],

  // ── Dark theme: brand green as interactive color ────────────────────────
  ["brand.400", "darkSurface.0", AA_TEXT, "link/brand text on page"],
  ["brand.400", "darkSurface.1", AA_TEXT, "link/brand text on card"],
  ["darkSurface.0", "brand.500", AA_TEXT, "CTA label on green button"],
  ["darkSurface.0", "brand.400", AA_TEXT, "CTA label on green hover"],
  ["brand.500", "darkSurface.0", AA_UI, "green button edge vs page"],

  // ── Dark theme: gold accent ─────────────────────────────────────────────
  ["accent.400", "darkSurface.1", AA_TEXT, "gold badge text on card"],
  ["darkSurface.0", "accent.500", AA_TEXT, "dark label on gold fill"],

  // ── Dark theme: semantic ────────────────────────────────────────────────
  ["semantic.successDark", "darkSurface.1", AA_TEXT, "success on card"],
  ["semantic.warningDark", "darkSurface.1", AA_TEXT, "warning on card"],
  ["semantic.dangerDark", "darkSurface.1", AA_TEXT, "danger on card"],
  ["semantic.infoDark", "darkSurface.1", AA_TEXT, "info on card"],

  // ── Dark theme: structure must be perceivable ───────────────────────────
  ["focus.dark", "darkSurface.0", AA_UI, "focus ring on page"],
  ["focus.dark", "darkSurface.1", AA_UI, "focus ring on card"],
  ["focus.dark", "darkSurface.2", AA_UI, "focus ring on raised"],
  ["darkBorder.strong", "darkSurface.0", AA_UI, "strong divider vs page"],
  ["darkBorder.strong", "darkSurface.1", AA_UI, "strong divider vs card"],

  // ── Light theme: text on the surface ladder ─────────────────────────────
  ["lightText.primary", "lightSurface.0", AA_TEXT, "body on page"],
  ["lightText.primary", "lightSurface.1", AA_TEXT, "body on card"],
  ["lightText.primary", "lightSurface.2", AA_TEXT, "body on raised"],
  ["lightText.secondary", "lightSurface.0", AA_TEXT, "secondary on page"],
  ["lightText.secondary", "lightSurface.1", AA_TEXT, "secondary on card"],
  ["lightText.muted", "lightSurface.0", AA_TEXT, "muted on page"],
  ["lightText.muted", "lightSurface.1", AA_TEXT, "muted on card"],
  ["lightText.muted", "lightSurface.2", AA_TEXT, "muted on raised"],

  // ── Light theme: brand green as interactive color ───────────────────────
  ["brand.700", "lightSurface.0", AA_TEXT, "link/brand text on page"],
  ["brand.700", "lightSurface.1", AA_TEXT, "link/brand text on card"],
  ["lightSurface.0", "brand.600", AA_TEXT, "CTA label on green button"],
  ["lightSurface.0", "brand.700", AA_TEXT, "CTA label on green hover"],

  // ── Light theme: gold must not be used as text on white ─────────────────
  ["lightText.primary", "accent.500", AA_TEXT, "dark label on gold fill"],
  ["semantic.warningLight", "lightSurface.0", AA_TEXT, "warning text on page"],

  // ── Light theme: semantic ───────────────────────────────────────────────
  ["semantic.successLight", "lightSurface.0", AA_TEXT, "success on page"],
  ["semantic.dangerLight", "lightSurface.0", AA_TEXT, "danger on page"],
  ["semantic.infoLight", "lightSurface.0", AA_TEXT, "info on page"],

  // ── Light theme: structure ──────────────────────────────────────────────
  ["focus.light", "lightSurface.0", AA_UI, "focus ring on page"],
  ["focus.light", "lightSurface.1", AA_UI, "focus ring on card"],
  ["lightBorder.strong", "lightSurface.0", AA_UI, "strong divider vs page"],

  // ── The surface ladder must actually step ───────────────────────────────
  // Adjacent surfaces need enough separation to read as distinct planes.
  // Deliberately low: these are large fills, not text. The old palette failed
  // here — every surface sat in one tonal band, which is what read as "dead".
  ["darkSurface.1", "darkSurface.0", 1.15, "card lifts off page"],
  ["darkSurface.2", "darkSurface.1", 1.15, "raised lifts off card"],
  ["darkSurface.3", "darkSurface.2", 1.15, "hover lifts off raised"],
  ["lightSurface.1", "lightSurface.0", 1.02, "card lifts off page"],
  ["lightSurface.2", "lightSurface.1", 1.04, "raised lifts off card"],
];

let failed = 0;
const rows = [];

for (const [fgPath, bgPath, min, label] of checks) {
  const fg = tok(fgPath);
  const bg = tok(bgPath);
  const ratio = contrast(fg, bg);
  const ok = ratio >= min;
  if (!ok) failed++;
  rows.push({
    ok,
    ratio,
    min,
    text: `${ok ? "PASS" : "FAIL"}  ${ratio.toFixed(2).padStart(5)}:1  (min ${min})  ${fgPath} on ${bgPath}  — ${label}`,
  });
}

for (const r of rows) {
  console.log(r.ok ? r.text : `\x1b[31m${r.text}\x1b[0m`);
}

const total = checks.length;
console.log(
  `\n${total - failed}/${total} contrast checks passed.` +
    (failed ? `  \x1b[31m${failed} FAILED\x1b[0m` : "  \x1b[32mAll good.\x1b[0m"),
);

process.exit(failed > 0 ? 1 : 0);
