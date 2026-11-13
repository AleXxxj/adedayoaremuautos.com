/**
 * Guide: recall or not, eight true-or-false cards about US safety recalls.
 *
 * EVERY STATEMENT HERE IS NHTSA'S. Each card keeps the page it was read on
 * and the words it rests on (`quote`), copied from that page on November 13,
 * 2026. The explanation shown to the visitor restates the quote in plain
 * words and adds nothing to it. To change a card, read the page again first.
 *
 * Nothing here is legal advice and nothing is about North Carolina.
 */
import type { Rank } from "@/components/guides/gameMath";
import { BUSINESS } from "./format";
import type { Guide, GuideData, GuideWords } from "./types";

const SLUG = "recall-or-not-quiz";

/** NHTSA's recalls page: the source of every card. */
export const NHTSA_RECALLS_URL = "https://www.nhtsa.gov/recalls";

export interface RecallFact {
  id: string;
  /** The statement on the card. */
  claim: string;
  answer: boolean;
  /** One line shown after the tap. */
  why: string;
  /** NHTSA's own words, as read on `url`. Kept for whoever checks this next; not shown. */
  quote: string;
  url: string;
}

/** In the order played: true and false are mixed, so the answers have no rhythm to guess from. */
export const RECALL_FACTS: RecallFact[] = [
  {
    id: "free",
    claim: "A dealer can charge you to fix a safety recall.",
    answer: false,
    why: "The fix is free. NHTSA says to contact your local dealership to fix the recalled part for free.",
    quote: "contact your local dealership to fix the recalled part for free",
    url: NHTSA_RECALLS_URL,
  },
  {
    id: "vin-17",
    claim: "NHTSA's recall search asks for a 17-character VIN.",
    answer: true,
    why: "It does. NHTSA says to look for it on the lower left of your windshield.",
    quote: "Look on the lower left of your car’s windshield for your 17-character VIN.",
    url: NHTSA_RECALLS_URL,
  },
  {
    id: "mail",
    claim: "The maker tells registered owners about a recall by mail.",
    answer: true,
    why: "By first class mail, within 60 days of telling NHTSA about the recall decision.",
    quote: "Manufacturers will notify registered owners by first class mail within 60 days of notifying NHTSA of a recall decision.",
    url: NHTSA_RECALLS_URL,
  },
  {
    id: "fixed-shown",
    claim: "A VIN search shows recalls that were already fixed.",
    answer: false,
    why: "It shows unrepaired recalls only. A recall that has already been repaired does not appear.",
    quote: "What won’t the license plate and VIN search show? A safety recall that has already been repaired.",
    url: NHTSA_RECALLS_URL,
  },
  {
    id: "cars-only",
    claim: "Recalls only cover cars and trucks.",
    answer: false,
    why: "Car seats, tires and other equipment get recalled too.",
    quote: "A recall is issued when a manufacturer or NHTSA determines that a vehicle, equipment, car seat, or tire creates an unreasonable safety risk or fails to meet minimum safety standards.",
    url: NHTSA_RECALLS_URL,
  },
  {
    id: "complaints",
    claim: "A complaint from a driver like you can help start an investigation.",
    answer: true,
    why: "NHTSA reviews every complaint. Similar reports from a number of people can open an investigation, which could lead to a recall.",
    quote: "Complaints like yours help us investigate possible defects, which could lead to a safety recall.",
    url: NHTSA_RECALLS_URL,
  },
  {
    id: "forced",
    claim: "Most recalls happen because NHTSA forces the maker.",
    answer: false,
    why: "Most are made voluntarily by manufacturers, before NHTSA is involved at all.",
    quote: "Most decisions to conduct a recall and remedy a safety defect are made voluntarily by manufacturers prior to any involvement by NHTSA.",
    url: NHTSA_RECALLS_URL,
  },
  {
    id: "twice",
    claim: "NHTSA says to check for recalls twice a year.",
    answer: true,
    why: "Its tip: register your vehicle, tires, car seats and equipment, and check recalls twice a year.",
    quote: "Register your vehicle, tires, car seats & equipment and check recalls twice a year.",
    url: NHTSA_RECALLS_URL,
  },
];

/** A title for a score, by the share of cards answered right. */
export const RECALL_RANKS: Rank[] = [
  { id: "pro", from: 1, title: "Recall Pro", line: "Every card right. Your friends should ask you before they buy." },
  { id: "minded", from: 0.75, title: "Safety Minded", line: "You know how recalls work. One or two surprised you." },
  { id: "halfway", from: 0.5, title: "Halfway There", line: "Half right. The other half is worth knowing before your next car." },
  { id: "now", from: 0, title: "Now You Know", line: "Nobody hands you this at the lot. Now you have it." },
];

/** What a score's share line says. The link is added by the share button. */
export const recallShareText = (score: number, of: number, rank: Rank) =>
  `I got ${score} of ${of} on Recall or Not (${rank.title}). How much do you know about car recalls?`;

const CARDS = RECALL_FACTS.length;

function words(d: GuideData): GuideWords {
  const newest = [...d.sale].sort((a, b) => b.year - a.year);

  return {
    description: `Recall or not? Test what you know about car safety recalls: ${CARDS} true-or-false cards, each with NHTSA's answer. Then check a VIN free. From Greensboro, NC.`,
    stat: `${CARDS} true-or-false cards`,
    short: [
      `**${CARDS} cards**. Tap **True** or **False**.`,
      "Every answer comes from **NHTSA**, the US road safety agency, with a link to its page.",
      "A safety recall is fixed **free** at a dealer.",
      "After the quiz, [check a VIN free](/us/check).",
    ],
    toolHeading: "Recall or not? True or false",
    toolNote: "Every answer is from NHTSA's recalls page, read on November 13, 2026. Your score stays in this browser.",
    sections: [
      {
        id: "what-is-a-recall",
        heading: "What is a car safety recall?",
        body: [
          "NHTSA says a recall is issued when a manufacturer or NHTSA determines that a vehicle, equipment, car seat or tire creates an unreasonable safety risk or fails to meet minimum safety standards.",
          "The maker then has to fix it: by repairing it, replacing it, offering a refund, or in rare cases buying the vehicle back.",
        ],
      },
      {
        id: "check-for-recalls",
        heading: "How do I check a car for recalls by VIN?",
        body: [
          "Find the 17-character VIN at the lower left of the windshield. Type it into our [free car check](/us/check). It uses NHTSA data and shows the recalls for the car's model.",
          "NHTSA's own VIN search shows unrepaired recalls for that one car. It does not show recalls already repaired, or safety recalls more than 15 years old unless the maker offers more coverage.",
        ],
        link: { href: "/us/check", label: "Check a VIN free" },
      },
      {
        id: "recall-notice",
        heading: "What do I do if my car has a recall?",
        body: ["NHTSA's advice is short."],
        steps: [
          "Follow any interim safety guidance from the manufacturer.",
          "Contact your local dealership for that brand.",
          "Have the recalled part fixed for free.",
        ],
      },
      {
        id: "buying-used",
        heading: "Should I check recalls before buying a used car?",
        body: [
          "Yes. It is free and takes a minute, and it is one of the few things about a used car you can check from your phone.",
          "Ask the seller for proof that open recalls were fixed. Then go through the rest of the car with the [10-minute checklist](/us/guides/used-car-checklist-free-vin-check).",
        ],
        ...(newest.length > 0
          ? {
              cars: {
                title: "Cars for sale today",
                kind: "sale" as const,
                slugs: newest.slice(0, 4).map((c) => c.slug),
                all: { href: "/us/inventory", label: "See all cars for sale" },
              },
            }
          : {}),
      },
    ],
    faqs: [
      {
        q: "Are car recall repairs free?",
        a: "Yes. NHTSA says to contact your local dealership to fix the recalled part for free.",
      },
      {
        q: "How will I know if my car is recalled?",
        a: "NHTSA says manufacturers notify registered owners by first class mail within 60 days of notifying NHTSA of a recall decision. You can also check by VIN at any time.",
      },
      {
        q: "How often should I check for recalls?",
        a: "NHTSA's tip is to check recalls twice a year, and to register your vehicle, tires, car seats and equipment.",
      },
      {
        q: "Does a VIN recall search show everything?",
        a: "No. NHTSA says its VIN search does not show a recall that has already been repaired, or safety recalls more than 15 years old unless the manufacturer offers more coverage.",
      },
      {
        q: "Is your car check the same as NHTSA's?",
        a: `The car check at ${BUSINESS} in Greensboro, NC is free and uses NHTSA data. It shows the recalls for the car's model, so ask the seller for proof that this car's recalls were fixed.`,
      },
      {
        q: "How do I report a safety problem with my car?",
        a: "File a complaint with NHTSA. It says it reviews every one, and that similar reports from a number of people can lead to an investigation.",
      },
    ],
    links: [
      { href: "/us/check", label: "Free car check", icon: "fa-clipboard-check" },
      { href: "/us/guides/used-car-checklist-free-vin-check", label: "10-minute checklist", icon: "fa-list-check" },
      { href: "/us/inventory", label: "Cars for sale", icon: "fa-car" },
      { href: "/us/guides/true-cost-of-a-cheap-car", label: "Cheap car or pricier car?", icon: "fa-scale-balanced" },
    ],
    cta: {
      title: "Check a VIN free",
      text: "Type the 17 characters. See the car, its recalls and its safety stars.",
      primary: { href: "/us/check", label: "Check a car", icon: "fa-clipboard-check" },
      secondary: { href: "/us/inventory", label: "See cars for sale", icon: "fa-car" },
    },
    photoSlug: (newest.filter((c) => c.image)[1] ?? newest.find((c) => c.image) ?? null)?.slug ?? null,
  };
}

export const recallQuizGuide: Guide = {
  meta: {
    slug: SLUG,
    tool: "recall-quiz",
    eyebrow: "Quiz",
    title: "Recall or Not? Test What You Know About Car Safety Recalls",
    metaTitle: "Recall or Not? A Quiz on Car Safety Recalls",
    promise: `Recall or not? Test what you know about car safety recalls with ${CARDS} true-or-false cards, then check a VIN free.`,
    card: { icon: "fa-shield-halved", label: "Quiz", line: `${CARDS} true-or-false cards. NHTSA has the answers.` },
    published: "2026-11-13",
    updated: "2026-11-13",
    live: false,
    group: "play",
    game: true,
  },
  words,
};
