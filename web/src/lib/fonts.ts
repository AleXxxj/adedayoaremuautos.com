import { Inter, Fraunces, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";

/**
 * Typographic voices for the homepage directions.
 *
 * next/font self-hosts these at build time — no runtime request to Google, no
 * layout shift, and nothing for a CSP to block.
 */

/** Body text across all directions. */
export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/** A · Showroom — editorial serif for display headlines. */
export const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

/** B · Night Drive — technical geometric sans. */
export const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

/** C · Marketplace — humanist sans, dense UI. */
export const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});
