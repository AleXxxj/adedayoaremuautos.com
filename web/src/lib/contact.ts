import type { MarketCode } from "./market";

/**
 * Contact channels that are not per-showroom.
 *
 * One file so there is a single place to correct them. The original hardcoded
 * `+234 801 234 5678` and `wa.me/2348012345678` on every page — a number the
 * business does not own — and pointed every social icon at `#`. Nothing here
 * is invented: a channel that is not yet known is `null`, and the components
 * render only what resolves.
 */

export const CONTACT_EMAIL = "info@adedayoaremuautos.com";
export const SALES_EMAIL = "sales@adedayoaremuautos.com";

/**
 * WhatsApp numbers in wa.me form — digits only, full international, no `+`.
 * Left null until the business confirms which lines actually receive WhatsApp;
 * publishing a number that nobody watches loses enquiries silently.
 */
export const WHATSAPP: Record<MarketCode, string | null> = {
  us: null,
  ng: null,
};

export interface SocialLink {
  key: string;
  label: string;
  icon: string;
  url: string;
}

/** Profile URLs, or null where the handle has not been supplied yet. */
const SOCIAL_URLS: Record<string, string | null> = {
  facebook: null,
  instagram: null,
  twitter: null,
  linkedin: null,
  youtube: null,
};

const SOCIAL_META: Record<string, { label: string; icon: string }> = {
  facebook: { label: "Facebook", icon: "fab fa-facebook-f" },
  instagram: { label: "Instagram", icon: "fab fa-instagram" },
  twitter: { label: "X", icon: "fab fa-x-twitter" },
  linkedin: { label: "LinkedIn", icon: "fab fa-linkedin-in" },
  youtube: { label: "YouTube", icon: "fab fa-youtube" },
};

/**
 * The social channels that can actually be followed, WhatsApp included where
 * the market has a number. An icon linking to `#` is worse than no icon: it
 * looks like a working profile and reflects on the dealership when it isn't.
 */
export function socialLinks(market: MarketCode): SocialLink[] {
  const links: SocialLink[] = [];

  for (const [key, url] of Object.entries(SOCIAL_URLS)) {
    if (!url) continue;
    links.push({ key, url, ...SOCIAL_META[key] });
  }

  const wa = WHATSAPP[market];
  if (wa) {
    links.push({
      key: "whatsapp",
      label: "WhatsApp",
      icon: "fab fa-whatsapp",
      url: `https://wa.me/${wa}`,
    });
  }

  return links;
}

/** A wa.me link with a prefilled message, or null when the market has no line. */
export function whatsappUrl(market: MarketCode, message?: string): string | null {
  const wa = WHATSAPP[market];
  if (!wa) return null;
  return message
    ? `https://wa.me/${wa}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${wa}`;
}

/** Google Maps embed for an address. No API key required for this form. */
export function mapEmbedUrl(address: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
}
