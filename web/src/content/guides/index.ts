/**
 * The guides on the US site (/us/guides).
 *
 * Each is a real tool wrapped in a short article, and every number in one is
 * computed from stock when the page is drawn. US only: the Nigerian articles
 * are the founder's own and live on /ng/blog (src/content/articles.ts).
 *
 * To add a guide: write its module beside these (meta + words), give its
 * tool a component in components/guides/GuideTool.tsx, and add it to the
 * list below. The index, the sitemap, the home page's section and the links
 * between guides all read this list.
 */
import { budget } from "./budget";
import { cheapCarGuide } from "./cheapCar";
import { lifeQuizGuide } from "./lifeQuiz";
import { priceGameGuide } from "./priceGame";
import { recallQuizGuide } from "./recallQuiz";
import { roadTripGuide } from "./roadTrip";
import { checklistGuide } from "./checklistGuide";
import { rentBuyOwn } from "./rentBuyOwn";
import { weeklyRental } from "./weeklyRental";
import type { Guide, GuideGroup } from "./types";

/** In the order written. Shown newest first; guides of the same day keep this order. */
const WRITTEN: Guide[] = [
  // November 13: the games, which lead the index.
  lifeQuizGuide,
  priceGameGuide,
  recallQuizGuide,
  roadTripGuide,
  cheapCarGuide,
  // November 12.
  weeklyRental,
  rentBuyOwn,
  budget,
  checklistGuide,
];

/** Newest first. Array sort is stable, so same-day guides keep their written order. */
export const GUIDES: Guide[] = [...WRITTEN].sort((a, b) =>
  b.meta.published.localeCompare(a.meta.published),
);

export const getGuide = (slug: string): Guide | null => GUIDES.find((g) => g.meta.slug === slug) ?? null;

/** The three on the home page: renting, deciding, and checking a car. */
export const HOME_GUIDE_SLUGS = [
  weeklyRental.meta.slug,
  rentBuyOwn.meta.slug,
  checklistGuide.meta.slug,
] as const;

/** The index's groups, in the order shown: the games lead. */
export const GUIDE_GROUPS = [
  { id: "play", title: "Play", line: "Quick games. Send your score to a friend." },
  { id: "plan", title: "Plan", line: "Trips, rentals and budgets, with today's prices." },
  { id: "check", title: "Check", line: "Know a car before you pay for it." },
] as const satisfies readonly { id: GuideGroup; title: string; line: string }[];

export const guideHref = (slug: string) => `/us/guides/${slug}`;

export type { Guide, GuideData, GuideMeta, GuideWords } from "./types";
