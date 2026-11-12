/**
 * Guide: how to check a used car before you buy it.
 *
 * The tool is the checklist itself (src/content/guides/checklist.ts). The
 * words around it stay modest: what a checklist can and can't tell you,
 * where the free car check fits, and where a fact is NHTSA's or the FTC's.
 * The counts ("26 checks", "5 parts") are counted from the checklist, and
 * the cars shown are the ones for sale today.
 */
import { BUSINESS, carsLabel, joinAnd } from "./format";
import { ALL_CHECKS, CHECKLIST, WALK_AROUND_CHECKS } from "./checklist";
import type { Guide, GuideData, GuideWords } from "./types";

const SLUG = "used-car-checklist-free-vin-check";

const CHECKS = ALL_CHECKS.length;
const PARTS = CHECKLIST.length;
/** "outside, inside, under the hood, paperwork and test drive" */
const PART_NAMES = joinAnd(CHECKLIST.map((g) => g.title.toLowerCase()));

function words(d: GuideData): GuideWords {
  // The newest listings: the cars a visitor is most likely looking at.
  const newest = [...d.sale].sort((a, b) => b.year - a.year);

  return {
    description: `How to check a used car before you buy: a 10-minute, ${CHECKS}-point checklist you tap through, plus a free VIN check for recalls. From Greensboro, NC.`,
    stat: `${CHECKS} checks in ${PARTS} parts`,
    short: [
      `**${CHECKS} checks** in **${PARTS} parts**: ${PART_NAMES}.`,
      "Tap **Good** or **Problem** on each one. The tally keeps score.",
      "Run the VIN through our [free car check](/us/check) for recalls and safety stars.",
      "Ask to see the title, and match the VIN on it to the car.",
    ],
    toolHeading: "The 10-minute used car checklist",
    toolNote:
      "Your taps stay in this browser. Nothing is sent to us, and the result you share holds only the checks you marked.",
    sections: [
      {
        id: "what-to-check",
        heading: "What should I check before buying a used car?",
        body: [
          `${PARTS} things: the ${PART_NAMES}. The checklist above has **${CHECKS} checks** across them.`,
          "A problem is not always a reason to walk away. It is something to ask about before you pay.",
        ],
      },
      {
        id: "free-vin-check",
        heading: "How do I check a VIN for free?",
        body: [
          "Every car has a 17-character VIN. NHTSA says to look for it at the lower left of the windshield.",
          "Type it into our [free car check](/us/check) to see the car, and the recalls, owner complaints and crash-test stars for its model. The data comes from NHTSA.",
        ],
        link: { href: "/us/check", label: "Check a VIN free" },
      },
      {
        id: "tire-tread",
        heading: "How do I check tire tread with a penny?",
        body: [
          "NHTSA says a tire is worn out at 2/32 of an inch of tread. Put a penny in the tread with Lincoln's head down. If you can see the top of his head, the tire needs replacing.",
        ],
      },
      {
        id: "mechanic",
        heading: "Should a mechanic look at a used car first?",
        body: [
          "A checklist covers what you can see, hear and feel. A mechanic can lift the car and read its computer.",
          "If you are unsure about a car, ask the seller whether your mechanic can look at it before you buy.",
        ],
      },
      ...(newest.length > 0
        ? [
            {
              id: "try-it",
              heading: "Try the checklist on one of our cars",
              body: [
                `**${carsLabel(d.saleTotal)}** ${d.saleTotal === 1 ? "is" : "are"} for sale in Greensboro today. Bring the checklist with you.`,
              ],
              cars: {
                title: "Cars for sale today",
                kind: "sale" as const,
                slugs: newest.slice(0, 4).map((c) => c.slug),
                all: { href: "/us/inventory", label: `See all ${carsLabel(d.saleTotal)} for sale` },
              },
            },
          ]
        : []),
    ],
    faqs: [
      {
        q: "How long does it take to check a used car?",
        a: `About 10 minutes for the ${WALK_AROUND_CHECKS.length} checks you do standing still, plus a test drive.`,
      },
      {
        q: "Is your VIN check free?",
        a: `Yes. The car check at ${BUSINESS} is free and uses NHTSA data. It shows what the car is, and the recalls, owner complaints and crash-test stars for its model.`,
      },
      {
        q: "What does a free VIN check not show?",
        a: "Accident and title history. Those come from paid history reports. The recalls shown are for the model, so ask the seller for proof that this car's recalls were fixed.",
      },
      {
        q: "Where is the VIN on a car?",
        a: "NHTSA says to look at the lower left of the windshield. It is also on the car's registration card.",
      },
      {
        q: "What paperwork should I ask to see?",
        a: "Ask to see the title and match the VIN on it to the car. Ask for service records. At a dealer, read the Buyers Guide on the window: the FTC requires one on every used car.",
      },
      {
        q: "What if I find a problem?",
        a: "Ask the seller about it before you pay. Mark it on the checklist, then share or save your result so you have it with you.",
      },
    ],
    links: [
      { href: "/us/check", label: "Free car check", icon: "fa-clipboard-check" },
      { href: "/us/inventory", label: "Cars for sale", icon: "fa-car" },
      { href: "/us/compare", label: "Compare two cars", icon: "fa-code-compare" },
      { href: "/us/sell", label: "Sell your car", icon: "fa-tag" },
    ],
    cta: {
      title: "Check a VIN free",
      text: "Type the 17 characters. See the car, its recalls and its safety stars.",
      primary: { href: "/us/check", label: "Check a car", icon: "fa-clipboard-check" },
      secondary: { href: "/us/inventory", label: "See cars for sale", icon: "fa-car" },
    },
    photoSlug: (newest.find((c) => c.image) ?? null)?.slug ?? null,
  };
}

export const checklistGuide: Guide = {
  meta: {
    slug: SLUG,
    tool: "checklist",
    eyebrow: "Checking",
    title: "How to Check a Used Car Before You Buy: A 10-Minute Checklist",
    metaTitle: "How to Check a Used Car Before You Buy: 10-Minute Checklist",
    promise: `How to check a used car before you buy it: tap through ${CHECKS} checks, keep a tally, and save the result.`,
    card: {
      icon: "fa-list-check",
      label: "Checking",
      line: `Tap through ${CHECKS} checks. Share or save the result.`,
    },
    published: "2026-11-12",
    updated: "2026-11-12",
    live: false,
  },
  words,
};
