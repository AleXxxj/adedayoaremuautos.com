/**
 * The partner pages' building blocks, as Tailwind class strings.
 *
 * The partner side sits outside the market layout and is styled with
 * utilities (PartnerShell), so the site's shared look — 52px pill buttons,
 * 20px cards, the green eyebrow, 800-weight headlines — is spelled out once
 * here rather than retyped on every page. Colors are the design tokens
 * (styles/tokens.css), exposed to Tailwind as bg-surface-1, text-brand-300
 * and so on.
 */

/** Headlines and big figures: the site's display face, tight and heavy. */
export const display =
  "font-[family-name:var(--font-space-grotesk)] font-extrabold tracking-[-0.03em]";

/** 12px capitals in green, after a 28px rule. */
export const eyebrow =
  "flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.18em] text-brand-300 before:h-px before:w-7 before:shrink-0 before:bg-current before:content-['']";

/** A page title on a phone: big, balanced so no word is left alone on a line. */
export const pageTitle = `${display} text-[length:clamp(30px,8.5vw,44px)] leading-[1.06] text-balance text-text-primary`;

/** A section title inside a card. */
export const cardTitle = `${display} text-[22px] leading-tight text-text-primary`;

export const card = "rounded-[20px] border border-border-subtle bg-surface-1";

const pill =
  "inline-flex min-h-[52px] items-center justify-center gap-2.5 rounded-full py-2 text-center text-base font-bold leading-tight transition-colors duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";

const primary = "bg-cta text-cta-fg hover:bg-cta-hover";
const secondary = "border border-border-strong bg-transparent text-text-primary hover:border-brand-300";

export const btnPrimary = `${pill} px-6 ${primary}`;

export const btnSecondary = `${pill} px-6 ${secondary}`;

/**
 * The same buttons, tighter and on one line, for two side by side on a
 * phone. Put them in a grid that stacks them when two do not fit.
 */
export const btnPrimaryTight = `${pill} whitespace-nowrap px-4 ${primary}`;

export const btnSecondaryTight = `${pill} whitespace-nowrap px-4 ${secondary}`;

/** A field: 52px tall, 16px text so iOS does not zoom, a 3:1 border. */
export const input =
  "block w-full min-h-[52px] rounded-[14px] border border-border-strong bg-surface-0 px-4 py-3 text-base text-text-primary placeholder:text-text-muted focus:border-brand-300 aria-[invalid=true]:border-danger";

export const label = "mb-2 block text-[15px] font-semibold text-text-primary";

/** Small print that still matters: 14px, never below AA. */
export const fine = "text-sm leading-relaxed text-text-muted";

export const link = "font-semibold text-brand-300 underline underline-offset-4 hover:text-brand-200";

export const errorBox =
  "rounded-[14px] border border-danger/50 bg-danger/10 px-4 py-3 text-[15px] leading-relaxed text-[#ffb4ab]";

export const successBox =
  "rounded-[14px] border border-brand-500/60 bg-brand-500/10 px-4 py-3.5 text-[15px] leading-relaxed text-text-primary";
