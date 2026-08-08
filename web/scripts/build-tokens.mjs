#!/usr/bin/env node
/**
 * Generates src/styles/tokens.css from src/styles/palette.json.
 *
 * palette.json is the single source of truth. This file is generated so the
 * CSS and the validated palette cannot drift apart — the failure mode where a
 * developer tweaks a hex in CSS and silently breaks a contrast guarantee.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../src/styles/palette.json");
const out = join(here, "../src/styles/tokens.css");

const p = JSON.parse(readFileSync(src, "utf8"));

const ramp = (name, obj) =>
  Object.entries(obj)
    .filter(([k]) => !k.startsWith("$"))
    .map(([k, v]) => `  --${name}-${k}: ${v};`)
    .join("\n");

const css = `/* ─────────────────────────────────────────────────────────────────────────
   GENERATED FILE — do not edit.
   Source: src/styles/palette.json
   Regenerate: npm run tokens
   Validated by: npm run check:contrast (50 WCAG assertions)
   ───────────────────────────────────────────────────────────────────────── */

:root {
  /* Brand green — ownable in a category that defaults to blue and red. */
${ramp("brand", p.brand)}

  /* Gold — premium signals only. Featured, certified, price emphasis.
     Never body text: it fails contrast at small sizes on light surfaces. */
${ramp("accent", p.accent)}
}

/* ── Dark theme (default) ────────────────────────────────────────────── */
:root,
[data-theme="dark"] {
  color-scheme: dark;

${ramp("surface", p.darkSurface)}

  --text-primary: ${p.darkText.primary};
  --text-secondary: ${p.darkText.secondary};
  --text-muted: ${p.darkText.muted};

  --border-subtle: ${p.darkBorder.subtle};
  --border-default: ${p.darkBorder.default};
  --border-strong: ${p.darkBorder.strong};

  --focus: ${p.focus.dark};

  /* Interactive: green carries the call to action. On the old site the CTA was
     dark green on black and receded; here it is the brightest element present. */
  --cta-bg: var(--brand-500);
  --cta-bg-hover: var(--brand-400);
  --cta-fg: ${p.darkSurface["0"]};
  --link: var(--brand-400);

  --success: ${p.semantic.successDark};
  --warning: ${p.semantic.warningDark};
  --danger: ${p.semantic.dangerDark};
  --info: ${p.semantic.infoDark};

  /* Hero scrim — guarantees headline legibility regardless of the photograph
     underneath. The live site's hero headline is currently unreadable against
     its own sky; this is the fix, applied as a system rule rather than per-page. */
  --hero-scrim: linear-gradient(
    100deg,
    rgb(7 12 10 / 0.95) 0%,
    rgb(7 12 10 / 0.85) 38%,
    rgb(7 12 10 / 0.45) 68%,
    rgb(7 12 10 / 0.15) 100%
  );

  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.4);
  --shadow-md: 0 4px 12px rgb(0 0 0 / 0.45);
  --shadow-lg: 0 16px 40px rgb(0 0 0 / 0.55);
}

/* ── Light theme ─────────────────────────────────────────────────────── */
[data-theme="light"] {
  color-scheme: light;

${ramp("surface", p.lightSurface)}

  --text-primary: ${p.lightText.primary};
  --text-secondary: ${p.lightText.secondary};
  --text-muted: ${p.lightText.muted};

  --border-subtle: ${p.lightBorder.subtle};
  --border-default: ${p.lightBorder.default};
  --border-strong: ${p.lightBorder.strong};

  --focus: ${p.focus.light};

  /* Light theme steps down two stops: brand-500 on white fails AA for button
     labels, brand-600 clears it. Caught by the contrast checker, not by eye. */
  --cta-bg: var(--brand-600);
  --cta-bg-hover: var(--brand-700);
  --cta-fg: ${p.lightSurface["0"]};
  --link: var(--brand-700);

  --success: ${p.semantic.successLight};
  --warning: ${p.semantic.warningLight};
  --danger: ${p.semantic.dangerLight};
  --info: ${p.semantic.infoLight};

  --hero-scrim: linear-gradient(
    100deg,
    rgb(255 255 255 / 0.95) 0%,
    rgb(255 255 255 / 0.86) 38%,
    rgb(255 255 255 / 0.5) 68%,
    rgb(255 255 255 / 0.15) 100%
  );

  --shadow-sm: 0 1px 2px rgb(11 20 16 / 0.06);
  --shadow-md: 0 4px 12px rgb(11 20 16 / 0.1);
  --shadow-lg: 0 16px 40px rgb(11 20 16 / 0.14);
}

/* Expose tokens to Tailwind v4 utilities: bg-surface-1, text-muted, etc. */
@theme inline {
${Object.keys(p.brand)
  .filter((k) => !k.startsWith("$"))
  .map((k) => `  --color-brand-${k}: var(--brand-${k});`)
  .join("\n")}
${Object.keys(p.accent)
  .filter((k) => !k.startsWith("$"))
  .map((k) => `  --color-accent-${k}: var(--accent-${k});`)
  .join("\n")}
${Object.keys(p.darkSurface)
  .filter((k) => !k.startsWith("$"))
  .map((k) => `  --color-surface-${k}: var(--surface-${k});`)
  .join("\n")}
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-border-subtle: var(--border-subtle);
  --color-border-default: var(--border-default);
  --color-border-strong: var(--border-strong);
  --color-focus: var(--focus);
  --color-cta: var(--cta-bg);
  --color-cta-hover: var(--cta-bg-hover);
  --color-cta-fg: var(--cta-fg);
  --color-link: var(--link);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-danger: var(--danger);
  --color-info: var(--info);
}
`;

writeFileSync(out, css, "utf8");
console.log(`Wrote ${out}`);
