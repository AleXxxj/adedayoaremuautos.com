/**
 * Guide: the cheap car against the pricier one, as a story the reader steers.
 *
 * The title's two prices ($3,000 and $8,000) are round numbers people search
 * for, and the story says so at once: the two cars it then uses are real
 * ones from stock (the lowest price, and the price nearest the title's
 * higher figure), with their real prices and the real difference.
 *
 * Every consequence is general and true of cars as a kind: no repair bill,
 * no odds, no statistic. The facts that are an agency's are NHTSA's, read on
 * nhtsa.gov/recalls on November 13, 2026:
 *
 *   "contact your local dealership to fix the recalled part for free"
 *   "check recalls twice a year"
 *   "Manufacturers will notify registered owners by first class mail"
 *
 * Nothing here is about North Carolina law, titles or inspections, beyond
 * matching the VIN on the title to the car.
 */
import type { StoryEnding, StoryStep } from "@/components/guides/gameMath";
import { BUSINESS, carsLabel, cash } from "./format";
import { NHTSA_RECALLS_URL } from "./recallQuiz";
import type { Guide, GuideData, GuideSaleCar, GuideWords } from "./types";

const SLUG = "true-cost-of-a-cheap-car";

/** The title's two round prices, in whole dollars. Named in the title only; the story uses stock. */
export const TITLE_PRICES_MAJOR = [3000, 8000] as const;

const NHTSA = { label: "NHTSA", url: NHTSA_RECALLS_URL };

export const STORY_STEPS: StoryStep[] = [
  {
    id: "recall",
    when: "Before you pay",
    icon: "fa-shield-halved",
    ask: "Run the VIN for open recalls?",
    choices: [
      { id: "check", label: "Check it", chance: false, result: "Free, and it took a minute. If a safety recall is open, a dealer for that brand fixes it free." },
      { id: "skip", label: "Skip it", chance: true, result: "An open recall stays open. The fix was free. The risk is the part you kept." },
    ],
    source: NHTSA,
  },
  {
    id: "tires",
    when: "On the lot",
    icon: "fa-circle-notch",
    ask: "Get down and look at the tires?",
    choices: [
      { id: "check", label: "Look", chance: false, result: "You checked the tread on all four and looked for cracks. Now you know what they are before you pay, not after." },
      { id: "skip", label: "They look round", chance: true, result: "Tires are the only part of the car that touches the road. You will find out what shape they are in some other day." },
    ],
  },
  {
    id: "title",
    when: "At the desk",
    icon: "fa-file-signature",
    ask: "Match the VIN on the title to the car?",
    choices: [
      { id: "check", label: "Match it", chance: false, result: "Windshield, door sticker, title. All three match, so the paper belongs to this car." },
      { id: "skip", label: "Just sign", chance: true, result: "You signed without checking that the paper is for this car." },
    ],
  },
  {
    id: "drive",
    when: "Test drive",
    icon: "fa-road",
    ask: "A real drive, or once around the block?",
    choices: [
      { id: "check", label: "A real drive", chance: false, result: "Twenty minutes, some of it at highway speed. You heard it, felt the brakes and tried every switch." },
      { id: "skip", label: "Around the block", chance: true, result: "A block tells you it starts. It does not tell you how it stops, shifts or sounds at 60." },
    ],
  },
  {
    id: "light",
    when: "Month 3",
    icon: "fa-lightbulb",
    ask: "A warning light comes on. Get it read this week?",
    choices: [
      { id: "check", label: "Get it read", chance: false, result: "A shop read the code. Now it is a known thing with a name, not a mystery." },
      { id: "skip", label: "Wait and see", chance: true, result: "The light is still on. So is the question." },
    ],
  },
  {
    id: "service",
    when: "Month 6",
    icon: "fa-oil-can",
    ask: "The owner's manual says service is due. Do it on time?",
    choices: [
      { id: "check", label: "On time", chance: false, result: "Done, and written down. Records are the first thing the next buyer will ask you for." },
      { id: "skip", label: "Stretch it", chance: true, result: "The schedule in the manual is the maker's own. You are now off it, with no record to show." },
    ],
  },
  {
    id: "recheck",
    when: "Month 12",
    icon: "fa-rotate",
    ask: "A year in. Check for recalls again?",
    choices: [
      { id: "check", label: "Check again", chance: false, result: "NHTSA says to check for recalls twice a year. Recalls are announced after you buy, too." },
      { id: "skip", label: "No need", chance: true, result: "Recalls are announced after you buy, too. The maker mails registered owners, if it has your address. A check is faster." },
    ],
    source: NHTSA,
  },
];

export const STORY_ENDINGS: StoryEnding[] = [
  { id: "careful", upTo: 0, title: "The Careful Buyer", line: "You checked everything you could. Whatever you paid, you know what you bought." },
  { id: "mostly", upTo: 2, title: "Mostly Careful", line: "You checked most of it. The things you skipped are the things you still don't know." },
  { id: "gambler", upTo: 5, title: "The Gambler", line: "You left a lot to chance. It may turn out fine. You just can't say why." },
  { id: "sticker", upTo: STORY_STEPS.length, title: "All Sticker, No Checks", line: "You bought a price, not a car. Everything else is still a surprise." },
];

/** The answer to the title's question, shown at every ending. */
export const STORY_VERDICT =
  "Which really costs more? The price tells you about day one. The checks tell you about the rest. A car you checked is a car you chose.";

/** What an ending's share line says. The link is added by the share button. */
export const storyShareText = (e: StoryEnding) =>
  `I got "${e.title}" in the cheap car vs pricier car story. What would you do?`;

export interface StoryCars<T> {
  cheap: T;
  pricier: T;
  /** How much more the pricier one costs. */
  gapMinor: number;
}

/**
 * The story's two cars: the lowest price in stock, and the car priced
 * nearest the title's higher figure among those that cost more than it.
 * Null when stock has no two cars at different prices.
 */
export function storyCars<T extends Pick<GuideSaleCar, "priceMinor" | "pending">>(sale: T[]): StoryCars<T> | null {
  const cars = sale.filter((c) => !c.pending);
  if (cars.length < 2) return null;
  const cheap = cars.reduce((a, b) => (b.priceMinor < a.priceMinor ? b : a));
  const target = TITLE_PRICES_MAJOR[1] * 100;
  const above = cars.filter((c) => c.priceMinor > cheap.priceMinor);
  if (above.length === 0) return null;
  const pricier = above.reduce((a, b) =>
    Math.abs(b.priceMinor - target) < Math.abs(a.priceMinor - target) ? b : a,
  );
  return { cheap, pricier, gapMinor: pricier.priceMinor - cheap.priceMinor };
}

const STEPS = STORY_STEPS.length;
const ENDINGS = STORY_ENDINGS.length;
const usd = (major: number) => `$${major.toLocaleString("en-US")}`;

function words(d: GuideData): GuideWords {
  const pair = storyCars(d.sale);

  return {
    description: `Cheap used car or the pricier one: which really costs more? Steer a year of choices in ${STEPS} taps and see how it ends. A story from a car lot in Greensboro, NC.`,
    stat: `${STEPS} choices · ${ENDINGS} endings`,
    short: [
      pair
        ? `Two real cars from our lot: **${cash(d, pair.cheap.priceMinor)}** and **${cash(d, pair.pricier.priceMinor)}**. Pick one.`
        : "Pick the cheaper car or the pricier one.",
      `Then make **${STEPS} choices** across a year. Each one has a plain consequence.`,
      `**${ENDINGS} endings**. None of them depends on the price you paid.`,
      "A safety recall is fixed free at a dealer. NHTSA says to check twice a year.",
    ],
    toolHeading: "Cheap car or pricier car: steer the year",
    toolNote: "The consequences are general. They are not predictions about any one car. Your choices stay in this browser.",
    sections: [
      {
        id: "is-a-cheap-car-worth-it",
        heading: "Is a cheap used car worth it?",
        body: [
          "It can be. A low price is not a warning, and a high price is not a promise.",
          "What you can't see is what costs you. That is the same for both cars, which is why the story ends on your checks and not on your price.",
        ],
      },
      {
        id: "true-cost",
        heading: "What is the true cost of a cheap car?",
        body: [
          "The price, plus whatever you didn't check. Nobody can put an honest number on the second part ahead of time, so we don't.",
          pair
            ? `What we can say: between the two cars in the story, the gap on day one is **${cash(d, pair.gapMinor)}**. It is real money, and it is the only number you know for sure.`
            : "The only number you know for sure on day one is the price.",
        ],
      },
      {
        id: "what-to-check",
        heading: "What should I check before buying a cheap car?",
        body: ["The same things as on any car. They take about 10 minutes and cost nothing."],
        steps: [
          "Run the VIN through our [free car check](/us/check) for recalls.",
          "Look at the tires, the fluids and under the car.",
          "Ask to see the title and match the VIN on it to the car.",
          "Drive it for 20 minutes, some of it fast.",
          "Tap through the [10-minute checklist](/us/guides/used-car-checklist-free-vin-check) as you go.",
        ],
        link: { href: "/us/guides/used-car-checklist-free-vin-check", label: "Open the checklist" },
      },
      ...(pair
        ? [
            {
              id: "the-two-cars",
              heading: "The two cars in the story",
              body: [
                `Both are for sale in Greensboro today, among **${carsLabel(d.saleTotal)}** on our lot. Check either one the way the story does.`,
              ],
              cars: {
                title: "From our lot today",
                kind: "sale" as const,
                slugs: [pair.cheap.slug, pair.pricier.slug],
                all: { href: "/us/inventory", label: `See all ${carsLabel(d.saleTotal)} for sale` },
              },
            },
          ]
        : []),
    ],
    faqs: [
      {
        q: "Is it better to buy a cheap car or a more expensive one?",
        a: "Neither is better by price alone. Buy the one you checked: its recalls, tires, paperwork and how it drives. An unchecked car is a gamble at any price.",
      },
      {
        q: "Are recall repairs really free?",
        a: "Yes. NHTSA says to contact your local dealership to fix the recalled part for free. You can check a car for open recalls with its VIN before you buy.",
      },
      {
        q: "Where do the two cars in the story come from?",
        a: `They are cars for sale at ${BUSINESS} in Greensboro, NC today: the lowest price on the lot and one priced well above it.`,
      },
      {
        q: "Why are there no repair costs in the story?",
        a: "Because any number would be made up. Repair costs depend on the car, the part and the shop. The story sticks to what is true of every car.",
      },
      {
        q: "How often should I check a car for recalls?",
        a: "NHTSA says to check twice a year. New recalls are announced after you buy, and the maker mails registered owners.",
      },
    ],
    links: [
      { href: "/us/check", label: "Free car check", icon: "fa-clipboard-check" },
      { href: "/us/guides/used-car-checklist-free-vin-check", label: "10-minute checklist", icon: "fa-list-check" },
      { href: "/us/inventory", label: "Cars for sale", icon: "fa-car" },
      { href: "/us/compare", label: "Compare two cars", icon: "fa-code-compare" },
    ],
    cta: {
      title: "Check a car before you pay",
      text: "Type the VIN. See the car, its recalls and its safety stars. Free.",
      primary: { href: "/us/check", label: "Check a car", icon: "fa-clipboard-check" },
      secondary: { href: "/us/guides/used-car-checklist-free-vin-check", label: "Open the checklist", icon: "fa-list-check" },
    },
    photoSlug: pair?.cheap.image ? pair.cheap.slug : (d.sale.find((c) => c.image)?.slug ?? null),
  };
}

export const cheapCarGuide: Guide = {
  meta: {
    slug: SLUG,
    tool: "cost-story",
    eyebrow: "Story",
    title: `The ${usd(TITLE_PRICES_MAJOR[0])} Car vs the ${usd(TITLE_PRICES_MAJOR[1])} Car: Which Really Costs More?`,
    metaTitle: `${usd(TITLE_PRICES_MAJOR[0])} Car vs ${usd(TITLE_PRICES_MAJOR[1])} Car: Which Really Costs More?`,
    promise: "The true cost of a cheap car against a pricier one: which really costs more? Steer a year of choices and see.",
    card: { icon: "fa-scale-balanced", label: "Story", line: `Pick a car, make ${STEPS} choices, see how your year ends.` },
    published: "2026-11-13",
    updated: "2026-11-13",
    live: true,
    group: "check",
    game: true,
  },
  words,
};
