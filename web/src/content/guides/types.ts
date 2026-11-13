/**
 * What a guide is made of.
 *
 * A guide is a code-defined module: fixed facts about it (`meta`), the tool
 * it wraps (`meta.tool`, drawn by components/guides/GuideTool.tsx), and its
 * words (`words`), written as a function of today's stock so that no price,
 * count or rate in a guide is typed by hand.
 *
 * No React and no database here: the words are plain strings, so the build
 * can read every guide against fixed stock and check it (scripts/
 * verify-guides.ts): title and description lengths, banned words, questions
 * with answers.
 *
 * Two marks are allowed in body text and bullets, and drawn by
 * components/guides/Rich.tsx: **bold** and [a link](/us/rentals). Questions
 * and their answers are plain text with neither, because the same text goes
 * into the page's structured data.
 */
import type { CurrencyCode } from "@/lib/money";
import type { RentalTariff } from "@/lib/rental";
import type { OwnershipTier } from "@/lib/rentToOwn";
import type { BodyGroup } from "@/components/compare/compareData";

/** A car to rent, as much of it as a guide shows or prices. */
export interface GuideRentCar {
  slug: string;
  name: string;
  image: string | null;
  tariff: RentalTariff;
  /** The body type the listing means ("SUV", "Sedan"), or null when it names none. */
  body: BodyGroup | null;
  seats: number | null;
}

/** A car for sale with a price on it. */
export interface GuideSaleCar {
  slug: string;
  name: string;
  year: number;
  mileage: number | null;
  priceMinor: number;
  image: string | null;
  transmission: string | null;
  pending: boolean;
  body: BodyGroup | null;
  seats: number | null;
}

/** Today's stock and the site's own rules: everything a guide's numbers come from. */
export interface GuideData {
  currency: CurrencyCode;
  locale: string;
  distanceUnit: "mi" | "km";
  /** The rental fleet, lowest week first (the rental list's order). */
  rent: GuideRentCar[];
  /** Cars for sale that carry a price, lowest first. */
  sale: GuideSaleCar[];
  /** Every car listed for sale, priced or not. */
  saleTotal: number;
  /** Rent-to-own categories, as /us/rent-to-own lists them. */
  tiers: OwnershipTier[];
  /** Whether a renter can pay online today (a live payment key is set). */
  payOnline: boolean;
  /** RESERVATION_HOURS, in days. */
  holdDays: number;
  /** MAX_OPEN_RESERVATIONS. */
  maxHolds: number;
  phone: string | null;
  phoneLabel: string | null;
  /** When a car for sale was last edited (ISO), or null with no stock. */
  stockUpdated: string | null;
}

export type ToolKey =
  | "weeks"
  | "three-way"
  | "budget"
  | "checklist"
  | "life-quiz"
  | "price-game"
  | "cost-story"
  | "recall-quiz"
  | "road-trip";

/** Where a guide sits on the index: games first, then planning, then checking a car. */
export type GuideGroup = "play" | "plan" | "check";

export interface GuideMeta {
  slug: string;
  tool: ToolKey;
  /** The label above the title: "Renting", "Buying". */
  eyebrow: string;
  /** The page's H1. */
  title: string;
  /** The <title>: under 60 characters. */
  metaTitle: string;
  /** One line under the title. It opens the page, so it carries the main search phrase. */
  promise: string;
  /** On the index and home cards: an icon, a label, and the one-line promise. */
  card: { icon: string; label: string; line: string };
  /** ISO dates. `updated` is when the words last changed. */
  published: string;
  updated: string;
  /** Whether the guide's numbers move with stock, so "Updated" follows the stock too. */
  live: boolean;
  group: GuideGroup;
  /** A game: the tool comes straight after the title, before "The short version". */
  game?: boolean;
}

/** A row of live cars inside the text. */
export interface GuideCars {
  title: string;
  kind: "rent" | "sale";
  slugs: string[];
  all: { href: string; label: string };
}

export interface GuideSection {
  id: string;
  /** Phrased the way people search. */
  heading: string;
  /** Short paragraphs: two to four sentences in all. */
  body: string[];
  /** A list of facts, each with an icon. */
  list?: { icon: string; text: string }[];
  /** Numbered steps. */
  steps?: string[];
  cars?: GuideCars;
  link?: { href: string; label: string };
}

export interface GuideLink {
  href: string;
  label: string;
  icon: string;
}

export interface GuideWords {
  /** The meta description: 140 to 160 characters, naming Greensboro, NC. */
  description: string;
  /** One short live line for the guide's card: "From $350 a week". */
  stat: string;
  /** "The short version": three or four bullets with live numbers. */
  short: string[];
  /** The tool's heading, a question people search. */
  toolHeading: string;
  /** One line under the tool: what the numbers are. */
  toolNote: string;
  sections: GuideSection[];
  /** "Questions people ask". Plain text, no marks. */
  faqs: { q: string; a: string }[];
  /** The matching pages. The other guides are added by the page. */
  links: GuideLink[];
  cta: {
    title: string;
    text: string;
    primary: GuideLink;
    secondary?: GuideLink;
  };
  /** The slug of the car whose photo stands for the guide (cards, Open Graph). */
  photoSlug: string | null;
}

export interface Guide {
  meta: GuideMeta;
  words(data: GuideData): GuideWords;
}
