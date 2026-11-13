/**
 * Guide: guess the price of real cars in stock.
 *
 * The game deals up to five cars for sale today (priced, photographed, not
 * sale pending) and offers four prices for each: the listed one and three
 * worked out from it (components/guides/gameMath.ts). No price is typed
 * here. The words around the game say what moves a used car's price in
 * general terms, with no figures that are not our own stock's.
 */
import { priceEligible, PRICE_OPTIONS, PRICE_ROUNDS, type Rank } from "@/components/guides/gameMath";
import { buyFigures } from "@/components/guides/guideMath";
import { BUSINESS, carsLabel, cash } from "./format";
import type { Guide, GuideData, GuideWords } from "./types";

const SLUG = "guess-the-price-game";

/** A title for a score, by the share of rounds guessed right. */
export const PRICE_RANKS: Rank[] = [
  { id: "psychic", from: 1, title: "Price Tag Psychic", line: "Every one right. You should be writing the stickers." },
  { id: "sharp", from: 0.8, title: "Sharp Eye", line: "One miss. You know what a car is worth." },
  { id: "haggler", from: 0.6, title: "Solid Haggler", line: "More right than wrong. You would hold your own on a lot." },
  { id: "shopper", from: 0.4, title: "Window Shopper", line: "You have looked at a few listings. A few more and you are dangerous." },
  { id: "shocked", from: 0, title: "Sticker Shocked", line: "Used car prices surprised you. That is why the game exists." },
];

/** What a score's share line says. The link is added by the share button. */
export const priceShareText = (score: number, of: number, rank: Rank) =>
  `I scored ${score} of ${of} on Guess the Price (${rank.title}). Can you beat it?`;

function words(d: GuideData): GuideWords {
  const playable = priceEligible(d.sale);
  const rounds = Math.min(PRICE_ROUNDS, playable.length);
  const buy = buyFigures(d.sale.map((c) => c.priceMinor));
  const newest = [...d.sale].sort((a, b) => b.year - a.year);

  return {
    description: `Guess the price of real used cars for sale in Greensboro, NC. ${PRICE_ROUNDS} rounds, ${PRICE_OPTIONS} prices each, one tap a round. Get a score and a rank, then challenge a friend.`,
    stat: rounds > 0 ? `${rounds} rounds from ${carsLabel(playable.length)}` : `${PRICE_ROUNDS} rounds, ${PRICE_OPTIONS} prices each`,
    short: [
      rounds > 0
        ? `**${rounds} rounds**. Each one is a real car from our lot, with its photo, year and miles.`
        : `**${PRICE_ROUNDS} rounds** when cars are listed. Each one is a real car from our lot.`,
      `Tap one of **${PRICE_OPTIONS} prices**. The real one is the price on the listing today.`,
      buy
        ? `Prices on our lot today run from **${cash(d, buy.lowestMinor)}** to **${cash(d, buy.highestMinor)}**.`
        : "Prices come from our listings the moment the page is drawn.",
      "You get a score and a rank. Send it to a friend and dare them to beat it.",
    ],
    toolHeading: "Guess the price",
    toolNote: "Prices are the ones on our listings today. Your scores stay in this browser. A shared link holds only a score.",
    sections: [
      {
        id: "how-much-is-a-used-car",
        heading: "How much does a used car cost in Greensboro?",
        body: [
          buy
            ? `On our lot today, **${carsLabel(buy.count)}** carry a price, from **${cash(d, buy.lowestMinor)}** to **${cash(d, buy.highestMinor)}**. The middle price is **${cash(d, buy.middleMinor)}**.`
            : "We have no priced cars listed today, so there is no figure to give. Check back soon.",
          "That is our stock only, not the whole city. For what each budget buys, see [used cars by budget](/us/guides/used-cars-by-budget-greensboro-nc).",
        ],
      },
      {
        id: "what-changes-the-price",
        heading: "What changes the price of a used car?",
        body: ["Play a few rounds and you will see the pattern. Five things do most of the work."],
        list: [
          { icon: "fa-calendar", text: "**Year.** Newer usually costs more." },
          { icon: "fa-gauge-high", text: "**Miles.** Fewer usually costs more." },
          { icon: "fa-car-side", text: "**Type.** A truck, an SUV and a small sedan of the same year rarely cost the same." },
          { icon: "fa-screwdriver-wrench", text: "**Condition.** Tires, paint, the inside, and how it drives." },
          { icon: "fa-folder-open", text: "**History.** Service records and a clean [recall check](/us/check) help." },
        ],
      },
      {
        id: "is-the-price-fair",
        heading: "How do I know if a used car price is fair?",
        body: [
          "Compare it with cars of the same year, miles and type. Our [compare page](/us/compare) puts two or three of our cars side by side.",
          "Then check the car itself. A low price on a car nobody checked is not a deal yet. The [10-minute checklist](/us/guides/used-car-checklist-free-vin-check) walks you through it.",
        ],
        ...(newest.length > 0
          ? {
              cars: {
                title: "Cars for sale today",
                kind: "sale" as const,
                slugs: newest.slice(0, 4).map((c) => c.slug),
                all: { href: "/us/inventory", label: `See all ${carsLabel(d.saleTotal)} for sale` },
              },
            }
          : {}),
      },
    ],
    faqs: [
      {
        q: "Are the cars in the game real?",
        a: `Yes. Every round is a car listed for sale by ${BUSINESS} in Greensboro, NC, with the price on its listing today.`,
      },
      {
        q: "How is the game scored?",
        a: `One point for each right price. A full game is ${PRICE_ROUNDS} rounds, or fewer when fewer cars are listed with a photo and a price. Your rank comes from your share of right answers.`,
      },
      {
        q: "Where do the wrong prices come from?",
        a: "They are worked out from the real price, some lower and some higher. They are not other cars' prices and nobody is quoting them.",
      },
      {
        q: "Can I buy a car I see in the game?",
        a: "Yes, if it is still listed. After each round, tap the car to open its page and ask about it.",
      },
      {
        q: "Do you save my score?",
        a: "Only in your own browser, as a number. Nothing is sent to us.",
      },
    ],
    links: [
      { href: "/us/inventory", label: "Cars for sale", icon: "fa-car" },
      { href: "/us/compare", label: "Compare two cars", icon: "fa-code-compare" },
      { href: "/us/check", label: "Free car check", icon: "fa-clipboard-check" },
      { href: "/us/sell", label: "Sell your car", icon: "fa-tag" },
    ],
    cta: {
      title: "See every price",
      text: "All our cars, with photos and the price on each one.",
      primary: { href: "/us/inventory", label: "See cars for sale", icon: "fa-car" },
      secondary: { href: "/us/compare", label: "Compare two cars", icon: "fa-code-compare" },
    },
    photoSlug: (playable[Math.floor(playable.length / 2)] ?? null)?.slug ?? null,
  };
}

export const priceGameGuide: Guide = {
  meta: {
    slug: SLUG,
    tool: "price-game",
    eyebrow: "Game",
    title: "Guess the Price: How Well Do You Know Used Car Prices?",
    metaTitle: "Guess the Price: Do You Know Used Car Prices?",
    promise: "Guess the price of real cars on our lot and find out how well you know used car prices.",
    card: { icon: "fa-gamepad", label: "Game", line: "Real cars, four prices, one tap. Beat your friends." },
    published: "2026-11-13",
    updated: "2026-11-13",
    live: true,
    group: "play",
    game: true,
  },
  words,
};
