/**
 * Guide: rent, buy or rent to own, compared for a length of time.
 *
 * Three live figures: what the lowest-cost rental costs for that long (the
 * booking engine's pricing), the lowest and middle sale prices in stock, and
 * what a rent-to-own renter has paid by then (the categories and totals the
 * /us/rent-to-own page lists). Which is lowest is arithmetic, shown with its
 * figures; the guide has no opinion.
 *
 * NOTHING HERE MAY ADVERTISE CREDIT. No payment on a loan, no rate, no term,
 * no approval language: those are "triggering terms" under US lending-
 * advertising law and belong on /us/financing with its disclosures. The
 * guide links there and says nothing more. scripts/verify-guides.ts reads
 * every word of this guide against a list of such terms and fails the build
 * on any of them.
 *
 * The rent-to-own disclosure is word for word what /us/rent-to-own says
 * under "What you are agreeing to". The build compares the two.
 */
import {
  LENGTHS,
  breakEvenDays,
  buyFigures,
  cheapestRental,
  lowestOwnTier,
  spanLabel,
} from "@/components/guides/guideMath";
import type { OwnershipTier } from "@/lib/rentToOwn";
import { carsLabel, cash, joinAnd } from "./format";
import type { Guide, GuideData, GuideWords } from "./types";

const SLUG = "rent-vs-buy-vs-rent-to-own";

/**
 * Word for word from /us/rent-to-own ("What you are agreeing to"): what the
 * arrangement is, stopping early, and deposits. Shown beside every rent-to-own
 * figure in this guide.
 */
export const RTO_DISCLOSURE = [
  "This is a rental-purchase arrangement. You are renting the vehicle, and ownership transfers only when the total rent for your category has been paid in full.",
  "You may stop at any time. If you do, you have rented a vehicle and owe nothing further — but rent already paid is not refunded.",
  "Deposits are separate from rent and do not count towards ownership. They are returned when the vehicle is.",
] as const;

/** A category's own line of that disclosure, built as that page builds it. */
export function rtoTierLine(d: Pick<GuideData, "currency" | "locale">, t: OwnershipTier): string {
  return `${t.name}: ${cash(d, t.dailyMinor)} per day${
    t.weeklyMinor != null ? ` or ${cash(d, t.weeklyMinor)} per week` : ""
  }. Total of all payments to acquire ownership: ${cash(d, t.ownershipThresholdMinor!)}.`;
}

/** The categories that lead to owning, lowest total first. */
export function owningTiers(tiers: OwnershipTier[]): OwnershipTier[] {
  return tiers
    .filter((t) => t.ownershipThresholdMinor != null && t.ownershipThresholdMinor > 0)
    .sort((a, b) => a.ownershipThresholdMinor! - b.ownershipThresholdMinor!);
}

/** "$500 a week", or "$80 a day" for a category with no weekly amount. */
const tierPer = (d: GuideData, t: OwnershipTier) =>
  t.weeklyMinor != null ? `${cash(d, t.weeklyMinor)} a week` : `${cash(d, t.dailyMinor)} a day`;

function words(d: GuideData): GuideWords {
  const buy = buyFigures(d.sale.map((c) => c.priceMinor));
  const lowCar = d.sale[0] ?? null;
  const tiers = owningTiers(d.tiers);
  const tier = lowestOwnTier(d.tiers);
  const weekly = d.rent.flatMap((c) => (c.tariff.weeklyMinor != null ? [c.tariff.weeklyMinor] : []));
  const lowestDaily = d.rent.length ? Math.min(...d.rent.map((c) => c.tariff.dailyMinor)) : null;
  const rentFrom = weekly.length
    ? `${cash(d, Math.min(...weekly))} a week`
    : lowestDaily != null
      ? `${cash(d, lowestDaily)} a day`
      : null;
  const month = cheapestRental(d.rent, LENGTHS[0].days);
  const quarter = cheapestRental(d.rent, LENGTHS[1].days);
  const even = buy ? breakEvenDays(d.rent, buy.lowestMinor) : null;
  const ownLine = tier
    ? `from **${tierPer(d, tier)}**. The car is yours once your rent reaches **${cash(d, tier.ownershipThresholdMinor!)}**. Deposits don't count, and rent already paid isn't refunded.`
    : null;

  const short = [
    rentFrom ? `Rent: from **${rentFrom}**. You pay for the time you need.` : null,
    buy
      ? `Buy: **${carsLabel(buy.count)}** in stock, from **${cash(d, buy.lowestMinor)}**. The middle price is **${cash(d, buy.middleMinor)}**.`
      : null,
    ownLine ? `Rent to own: ${ownLine}` : null,
    even != null && buy
      ? `Renting our lowest-cost car passes the lowest sale price after about **${spanLabel(even)}**.`
      : null,
  ].filter((s): s is string => Boolean(s));

  // "Is it cheaper for 3 months?", answered with today's two figures.
  const threeMonths =
    quarter && buy
      ? `For 3 months, renting our lowest-cost car is ${cash(d, quarter.cost.rentMinor)} and the lowest-priced car for sale is ${cash(d, buy.lowestMinor)}. ${
          quarter.cost.rentMinor < buy.lowestMinor
            ? "Renting costs less for 3 months."
            : quarter.cost.rentMinor > buy.lowestMinor
              ? "Buying costs less, and you keep the car."
              : "They cost the same."
        }`
      : "It depends on how long you need a car. Tap a length of time on this page to compare today's prices.";

  return {
    description:
      "Rent, buy or rent to own a car in Greensboro, NC? Tap how long you need one and compare the three with today's prices from our stock and rental fleet.",
    stat:
      rentFrom && buy
        ? `Rent from ${rentFrom} · Buy from ${cash(d, buy.lowestMinor)}`
        : "Three ways, compared on cost",
    short: short.length
      ? short
      : ["Tap how long you need a car and compare renting, buying and rent to own with today's prices."],
    toolHeading: "Is it cheaper to rent, buy or rent to own a car?",
    toolNote:
      "Rent is the lowest-cost car in our fleet for that long. Buy is the lowest price in stock. Rent to own is the rent paid by then in the category with the lowest total. Three different cars, compared on cost alone.",
    sections: [
      {
        id: "rent-or-buy",
        heading: "Is it cheaper to rent or buy a car?",
        body: [
          month && buy
            ? `It depends on how long you need one. For 1 month, renting our lowest-cost car is **${cash(d, month.cost.rentMinor)}**. The lowest-priced car for sale is **${cash(d, buy.lowestMinor)}**.`
            : "It depends on how long you need one. Rent adds up every week. A sale price is paid once.",
          even != null
            ? `After about **${spanLabel(even)}**, the rent you have paid passes that price. Before that, renting costs less. After it, buying does.`
            : "Tap a length of time above to see which costs less today.",
        ],
      },
      ...(tier
        ? [
            {
              id: "rent-to-own",
              heading: "How does rent to own work in Greensboro?",
              body: [
                "You rent the car by the day or the week. When your rent reaches the total for your car's category, the car is yours.",
                ...RTO_DISCLOSURE,
              ],
              list: tiers.map((t) => ({ icon: "fa-hand-holding-heart", text: rtoTierLine(d, t) })),
              link: { href: "/us/rent-to-own", label: "See rent to own" },
            },
          ]
        : []),
      ...(buy
        ? [
            {
              id: "buy",
              heading: "What does a used car cost to buy here?",
              body: [
                `**${carsLabel(buy.count)}** ${buy.count === 1 ? "is" : "are"} for sale today, from **${cash(d, buy.lowestMinor)}** to **${cash(d, buy.highestMinor)}**. The middle price is **${cash(d, buy.middleMinor)}**.`,
                "That is the price of the car. Tax, title and registration are extra.",
              ],
              cars: {
                title: "Lowest-priced cars for sale",
                kind: "sale" as const,
                slugs: d.sale.slice(0, 4).map((c) => c.slug),
                all: { href: "/us/inventory", label: `See all ${carsLabel(d.saleTotal)} for sale` },
              },
            },
          ]
        : []),
      {
        id: "what-each-means",
        heading: "Rent vs buy vs rent to own: what each one means",
        body: [],
        list: [
          {
            icon: "fa-key",
            text: "**Rent:** you pay for the days you use. The car stays ours, and you hand it back.",
          },
          { icon: "fa-car", text: "**Buy:** you pay the price once. The car and its upkeep are yours." },
          ...(tier
            ? [
                {
                  icon: "fa-hand-holding-heart",
                  text: "**Rent to own:** you rent by the day or the week. The car is yours once your rent reaches the total. Stop anytime and owe nothing more, but rent already paid isn't refunded.",
                },
              ]
            : []),
        ],
      },
      {
        id: "paying-over-time",
        heading: "Can I pay for a car over time?",
        body: [
          "Financing has its own page. This guide compares rent and sale prices only.",
        ],
        link: { href: "/us/financing", label: "See financing" },
      },
    ],
    faqs: [
      { q: "Is it cheaper to rent or buy a car for 3 months?", a: threeMonths },
      ...(even != null && buy
        ? [
            {
              q: "How long before renting costs more than buying?",
              a: `With today's prices, after about ${spanLabel(even)}. That compares our lowest-cost rental with our lowest-priced car for sale, at ${cash(d, buy.lowestMinor)}.`,
            },
          ]
        : []),
      ...(tier
        ? [
            {
              q: "How much is rent to own a week?",
              a: `${joinAnd(
                tiers.map(
                  (t) => `${t.name} is ${tierPer(d, t)}, with ${cash(d, t.ownershipThresholdMinor!)} in total rent to own the car`,
                ),
              )}. Deposits are separate and don't count toward owning.`,
            },
            {
              q: "What happens if I stop rent to own early?",
              a: "You can stop at any time and owe nothing more. Rent already paid is not refunded, and the car stays ours.",
            },
            {
              q: "Does my deposit count toward owning the car?",
              a: "No. Deposits are separate from rent and don't count toward ownership. They are returned when the vehicle is.",
            },
          ]
        : []),
      ...(lowCar && buy
        ? [
            {
              q: "What is the lowest-priced car for sale today?",
              a: `The ${lowCar.name}, at ${cash(d, lowCar.priceMinor)}. ${carsLabel(buy.count)} ${buy.count === 1 ? "is" : "are"} for sale today.`,
            },
          ]
        : []),
    ],
    links: [
      { href: "/us/rentals", label: "Cars for rent", icon: "fa-key" },
      { href: "/us/inventory", label: "Cars for sale", icon: "fa-car" },
      { href: "/us/rent-to-own", label: "Rent to own", icon: "fa-hand-holding-heart" },
      { href: "/us/financing", label: "Financing", icon: "fa-calculator" },
    ],
    cta: {
      title: "See today's cars",
      text: "Every price on this page comes from the cars in stock right now.",
      primary: { href: "/us/inventory", label: "Browse cars for sale", icon: "fa-car" },
      secondary: { href: "/us/rentals", label: "See cars for rent", icon: "fa-key" },
    },
    // The car in the middle of the price list: neither the cheapest nor the dearest.
    photoSlug:
      ([...d.sale.slice(Math.floor(d.sale.length / 2)), ...d.sale].find((c) => c.image) ?? null)?.slug ??
      null,
  };
}

export const rentBuyOwn: Guide = {
  meta: {
    slug: SLUG,
    tool: "three-way",
    eyebrow: "Deciding",
    title: "Rent, Buy or Rent to Own a Car in Greensboro: Which Costs Less?",
    metaTitle: "Rent vs Buy vs Rent to Own a Car in Greensboro, NC",
    promise:
      "Rent, buy or rent to own a car in Greensboro, NC: tap how long you need one and see what each costs today.",
    card: {
      icon: "fa-scale-balanced",
      label: "Deciding",
      line: "Tap how long you need a car. See which costs less today.",
    },
    published: "2026-11-12",
    updated: "2026-11-12",
    live: true,
    group: "plan",
  },
  words,
};
