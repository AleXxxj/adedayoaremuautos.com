/**
 * Guide: what car fits your life, as a six-question quiz.
 *
 * The questions and what each answer counts for are below; the adding up is
 * lifeResult (components/guides/gameMath.ts). A result is a type of car and
 * a few warm lines about the person, never a claim about a model: the cars
 * shown under it are simply the ones in stock whose listing names that body
 * type, within the budget answered.
 *
 * The two budget steps are the budget guide's own ($5,000 and $10,000), so
 * the two guides sort stock the same way.
 */
import type { BodyGroup } from "@/components/compare/compareData";
import { BUDGETS_MAJOR } from "@/components/guides/guideMath";
import type { LifeQuestion, ProfileId } from "@/components/guides/gameMath";
import { BUSINESS, carsLabel } from "./format";
import type { Guide, GuideData, GuideWords } from "./types";

const SLUG = "which-car-fits-your-life-quiz";

const usd = (major: number) => `$${major.toLocaleString("en-US")}`;
const [LOW, MID] = BUDGETS_MAJOR;

export const LIFE_QUESTIONS: LifeQuestion[] = [
  {
    id: "riders",
    ask: "Who rides with you?",
    options: [
      { id: "solo", label: "Just me", icon: "fa-user", points: { runabout: 2, commuter: 1 } },
      { id: "pair", label: "Me plus one", icon: "fa-user-group", points: { commuter: 2, runabout: 1 } },
      { id: "crew", label: "Kids or a crew", icon: "fa-people-group", points: { family: 2, roadtrip: 1 } },
      { id: "full", label: "A full house, 6 or more", icon: "fa-people-roof", points: { family: 4 } },
    ],
  },
  {
    id: "cargo",
    ask: "What do you carry?",
    options: [
      { id: "light", label: "A backpack and groceries", icon: "fa-bag-shopping", points: { commuter: 2, runabout: 1 } },
      { id: "gear", label: "Luggage, strollers, sports gear", icon: "fa-suitcase-rolling", points: { roadtrip: 2, family: 1 } },
      { id: "big", label: "Tools, lumber, big boxes", icon: "fa-toolbox", points: { workhorse: 5 } },
    ],
  },
  {
    id: "miles",
    ask: "How many miles a week?",
    options: [
      { id: "few", label: "Under 100", icon: "fa-house", points: { runabout: 2 } },
      { id: "some", label: "100 to 300", icon: "fa-road", points: { commuter: 1, family: 1 } },
      { id: "many", label: "Over 300", icon: "fa-route", points: { roadtrip: 2, commuter: 2 } },
    ],
  },
  {
    id: "parking",
    ask: "Where do you park?",
    options: [
      { id: "tight", label: "A tight street or garage", icon: "fa-square-parking", points: { runabout: 2, commuter: 1 } },
      { id: "driveway", label: "A driveway or a lot", icon: "fa-warehouse", points: { commuter: 1, family: 1, roadtrip: 1 } },
      { id: "room", label: "Anywhere. Plenty of room", icon: "fa-tree", points: { roadtrip: 1, family: 1, workhorse: 1 } },
    ],
  },
  {
    id: "budget",
    ask: "What is your budget?",
    options: [
      { id: "low", label: `${usd(LOW)} or less`, icon: "fa-tag", budgetMajor: LOW },
      { id: "mid", label: `Up to ${usd(MID)}`, icon: "fa-tags", budgetMajor: MID },
      { id: "high", label: `Over ${usd(MID)}`, icon: "fa-gem", budgetMajor: null },
      { id: "open", label: "Not sure yet", icon: "fa-circle-question", budgetMajor: null },
    ],
  },
  {
    id: "mode",
    ask: "Rent or own?",
    options: [
      { id: "rent", label: "Rent for now", icon: "fa-key", mode: "rent" },
      { id: "own", label: "Buy and own it", icon: "fa-car", mode: "own" },
      { id: "rto", label: "Rent to own", icon: "fa-handshake", mode: "rto" },
      { id: "unsure", label: "Not sure yet", icon: "fa-circle-question", mode: "unsure" },
    ],
  },
];

export interface LifeProfile {
  id: ProfileId;
  /** "The Road-Trip SUV" */
  title: string;
  icon: string;
  /** Two or three lines about the person, not about any model. */
  lines: string[];
  /** The body types that fit, as listings name them. */
  bodies: BodyGroup[];
  /** "SUV or wagon" */
  bodyLabel: string;
}

export const LIFE_PROFILES: Record<ProfileId, LifeProfile> = {
  roadtrip: {
    id: "roadtrip",
    title: "The Road-Trip SUV",
    icon: "fa-mountain-sun",
    lines: [
      "You see a free weekend and ask one thing: mountains or beach?",
      "You want room for bags and friends, a seat up high, and a car that still feels good at hour three on the way to Asheville.",
    ],
    bodies: ["SUV", "Wagon", "Van"],
    bodyLabel: "SUV or wagon",
  },
  family: {
    id: "family",
    title: "The Family Hauler",
    icon: "fa-people-roof",
    lines: [
      "Your car is a school bus, a snack bar and a locker room.",
      "You need doors that open wide, a seat for everybody, and a back end that takes a stroller without a fight.",
    ],
    bodies: ["SUV", "Van", "Wagon"],
    bodyLabel: "SUV or van",
  },
  workhorse: {
    id: "workhorse",
    title: "The Workhorse",
    icon: "fa-truck-pickup",
    lines: [
      "You carry things that do not fit in a trunk, and you do not apologize for it.",
      "You need a bed or a big cargo hold, and a car you are not afraid to get dirty.",
    ],
    bodies: ["Truck", "Van", "SUV"],
    bodyLabel: "Truck, van or SUV",
  },
  commuter: {
    id: "commuter",
    title: "The Mile-Eater Sedan",
    icon: "fa-road",
    lines: [
      "You rack up miles and you want them quiet.",
      "A sedan gives you a real trunk, a calm ride down I-40, and room for the one passenger who likes your playlists.",
    ],
    bodies: ["Sedan", "Hatchback", "Wagon"],
    bodyLabel: "Sedan or hatchback",
  },
  runabout: {
    id: "runabout",
    title: "The City Runabout",
    icon: "fa-city",
    lines: [
      "You count trips in minutes, not hours, and you park where others give up.",
      "A small car is your kind of easy: quick into a tight spot downtown and never more car than the errand needs.",
    ],
    bodies: ["Hatchback", "Coupe", "Sedan", "Convertible"],
    bodyLabel: "Small car",
  },
};

/** What a result's share line says. The link is added by the share button. */
export const lifeShareText = (p: LifeProfile) => `I got: ${p.title}. What car fits your life?`;

const QUESTIONS = LIFE_QUESTIONS.length;
const RESULTS = Object.keys(LIFE_PROFILES).length;

function words(d: GuideData): GuideWords {
  const stock = d.saleTotal + d.rent.length;
  const suvs = d.sale.filter((c) => c.body === "SUV");
  const newest = [...d.sale].sort((a, b) => b.year - a.year);

  return {
    description: `What car fits your life? Take a 60-second quiz: ${QUESTIONS} taps, ${RESULTS} results, and real cars to buy or rent in Greensboro, NC that match your answer. No typing.`,
    stat: `${QUESTIONS} questions · 60 seconds`,
    short: [
      `**${QUESTIONS} questions**, all taps. About **60 seconds**.`,
      `**${RESULTS} results**, from The City Runabout to The Workhorse.`,
      stock > 0
        ? `Your result shows real cars from our lot: **${carsLabel(d.saleTotal)}** for sale and **${d.rent.length}** to rent today.`
        : "Your result shows the cars on our lot that match, when there are some.",
      "Send your result to a friend and see what they get.",
    ],
    toolHeading: "What car fits your life?",
    toolNote: "Your answers stay in this browser. Nothing is sent to us. A shared link holds only the name of a result.",
    sections: [
      {
        id: "what-car-should-i-buy",
        heading: "What car should I buy?",
        body: [
          "Start with your week, not with a brand. Who rides with you, what you carry, how far you go and where you park decide more than a badge does.",
          "The quiz above turns those four answers into a type of car. Your budget and whether you want to rent or own then pick the cars.",
        ],
      },
      {
        id: "suv-or-sedan",
        heading: "Should I get an SUV or a sedan?",
        body: [
          "An SUV sits higher and takes more people and bags. A sedan is lower, with a trunk that locks your things out of sight.",
          suvs.length > 0
            ? `If you can't decide, sit in both. We have **${carsLabel(suvs.length)}** listed as an SUV today, and you can [compare two cars](/us/compare) side by side.`
            : "If you can't decide, sit in both, and [compare two cars](/us/compare) side by side.",
        ],
        link: { href: "/us/compare", label: "Compare two cars" },
      },
      {
        id: "how-much-car",
        heading: "How much car can I get for my budget?",
        body: [
          "The quiz asks for a budget so it only shows cars you can use. For the full picture, [see what each budget buys](/us/guides/used-cars-by-budget-greensboro-nc) from our stock today.",
        ],
      },
      {
        id: "rent-first",
        heading: "Can I rent a car before I buy one?",
        body: [
          "Yes. A week in a rental tells you things a test drive can't: whether it fits your parking spot, your people and your commute.",
          "Not sure which way to go? [Rent, buy or rent to own](/us/guides/rent-vs-buy-vs-rent-to-own) puts the three side by side.",
        ],
        ...(d.rent.length > 0
          ? {
              cars: {
                title: "Cars to rent this week",
                kind: "rent" as const,
                slugs: d.rent.slice(0, 4).map((c) => c.slug),
                all: { href: "/us/rentals", label: `See all ${carsLabel(d.rent.length)} to rent` },
              },
            }
          : {}),
      },
    ],
    faqs: [
      {
        q: "What car fits my lifestyle?",
        a: "The one that fits your week. Count who rides with you, what you carry, your miles and your parking. The quiz does it in six taps and names a type of car.",
      },
      {
        q: "How does the car quiz pick my result?",
        a: "Each answer adds points to one or more car types. The type with the most points is your result. Budget and rent-or-own don't change the type. They choose which cars you see.",
      },
      {
        q: "Are the cars in my result real?",
        a: `Yes. They are cars listed by ${BUSINESS} in Greensboro, NC today whose listing names that body type. If nothing matches, the quiz says so.`,
      },
      {
        q: "Is the quiz free, and do you keep my answers?",
        a: "It is free. Your answers stay in your browser and are not sent to us.",
      },
      {
        q: "What if my result has no cars in my budget?",
        a: "The quiz shows the closest ones of that type and says they are over your budget. Stock changes often, so ask us what is coming in.",
      },
    ],
    links: [
      { href: "/us/inventory", label: "Cars for sale", icon: "fa-car" },
      { href: "/us/rentals", label: "Cars to rent", icon: "fa-key" },
      { href: "/us/compare", label: "Compare two cars", icon: "fa-code-compare" },
      { href: "/us/rent-to-own", label: "Rent to own", icon: "fa-handshake" },
    ],
    cta: {
      title: "See the cars for yourself",
      text: "Every car has photos and a price. Tap one to ask about it.",
      primary: { href: "/us/inventory", label: "See cars for sale", icon: "fa-car" },
      secondary: { href: "/us/rentals", label: "See cars to rent", icon: "fa-key" },
    },
    photoSlug: ((suvs.find((c) => c.image) ?? newest.find((c) => c.image)) ?? null)?.slug ?? null,
  };
}

export const lifeQuizGuide: Guide = {
  meta: {
    slug: SLUG,
    tool: "life-quiz",
    eyebrow: "Quiz",
    title: "What Car Fits Your Life? A 60-Second Quiz",
    metaTitle: "What Car Fits Your Life? A 60-Second Car Quiz",
    promise: `What car fits your life? This 60-second quiz asks ${QUESTIONS} questions and shows real cars that match.`,
    card: { icon: "fa-wand-magic-sparkles", label: "Quiz", line: `${QUESTIONS} taps. Get your car type and real cars that match.` },
    published: "2026-11-13",
    updated: "2026-11-13",
    live: true,
    group: "play",
    game: true,
  },
  words,
};
