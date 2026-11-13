/**
 * Guide: what $5,000, $10,000 and $15,000 buy from the cars in stock.
 *
 * Every count, price, year and mileage is read from the cars for sale when
 * the page is drawn, and the guide says "in our stock today" because that is
 * all it knows: it is one dealer's stock, not the Greensboro market. Where a
 * budget buys little or nothing here, it says so.
 *
 * The three budgets are the tool's own (BUDGETS_MAJOR), so the title, the
 * chips and the sections can't name different ones.
 */
import { BUDGETS_MAJOR, budgetBucket, buyFigures, lowestOwnTier, median } from "@/components/guides/guideMath";
import { BUSINESS, carsLabel, cash, count, joinAnd } from "./format";
import type { Guide, GuideData, GuideSection, GuideWords } from "./types";

const SLUG = "used-cars-by-budget-greensboro-nc";

/** "$5,000": the budgets are whole US dollars, and this guide is US only. */
const usd = (major: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(major);

const [LOW, MID, HIGH] = BUDGETS_MAJOR.map(usd);

/** The sale list, filtered to a budget: the list's own `price=lo-hi` in whole dollars. */
export const budgetHref = (major: number) => `/us/inventory?price=0-${major}`;

function words(d: GuideData): GuideWords {
  const buy = buyFigures(d.sale.map((c) => c.priceMinor));
  const buckets = BUDGETS_MAJOR.map((major) => ({ major, ...budgetBucket(d.sale, major * 100) }));
  const typicalYear = median(d.sale.map((c) => c.year));
  const miles = d.sale.flatMap((c) => (c.mileage != null ? [c.mileage] : []));
  const typicalMiles = median(miles);
  const lowCar = d.sale[0] ?? null;
  const tier = lowestOwnTier(d.tiers);

  /** Two or three sentences on one budget, from its bucket. */
  const about = (b: (typeof buckets)[number]): string[] => {
    const at = `${usd(b.major)} or less`;
    if (b.count === 0) {
      return [
        buy
          ? `No car in our stock today costs ${at}. The lowest price is **${cash(d, buy.lowestMinor)}**.`
          : `No car in our stock today costs ${at}.`,
      ];
    }
    const lead = b.thin
      ? `Stock is thin at this budget: only **${carsLabel(b.count)}** in our stock today ${b.count === 1 ? "costs" : "cost"} ${at}.`
      : `**${carsLabel(b.count)}** in our stock today cost ${at}, ${
          b.lowestMinor === b.highestMinor
            ? `at ${cash(d, b.lowestMinor!)}`
            : `from ${cash(d, b.lowestMinor!)} to ${cash(d, b.highestMinor!)}`
        }.`;
    // Few enough to name. One car's name already says its year.
    const names =
      b.count <= 3 ? `${b.count === 1 ? "It is" : "They are"} the ${joinAnd(b.cars.map((c) => c.name))}.` : null;
    const year = b.count > 1 ? `The typical one is a **${b.typicalYear}**.` : null;
    const mi =
      b.milesListed === 0
        ? b.count === 1
          ? "Its listing doesn't show miles yet. Ask us."
          : "None of them lists its miles yet. Ask us."
        : b.milesListed === 1
          ? `${b.count === 1 ? "It shows" : "One lists its miles:"} ${count(d, b.typicalMiles!)} ${d.distanceUnit}.`
          : `${b.milesListed} of them list their miles. The middle figure is **${count(d, b.typicalMiles!)} ${d.distanceUnit}**.`;
    return [[lead, names].filter(Boolean).join(" "), [year, mi].filter(Boolean).join(" ")];
  };

  const headings = [
    `What used cars are under ${LOW} in Greensboro?`,
    `What can I buy for under ${MID}?`,
    `What does ${HIGH} buy?`,
  ];

  const sections: GuideSection[] = [
    ...buckets.map((b, i) => ({
      id: `under-${b.major}`,
      heading: headings[i],
      body: about(b),
      ...(b.count > 0
        ? { link: { href: budgetHref(b.major), label: `See ${carsLabel(b.count)} at ${usd(b.major)} or less` } }
        : {}),
    })),
    {
      id: "miles",
      heading: "How many miles do used cars at these prices have?",
      body: [
        miles.length > 0
          ? `**${miles.length} of our ${carsLabel(d.sale.length)}** ${miles.length === 1 ? "lists its" : "list their"} miles. ${
              miles.length === 1
                ? `It shows ${count(d, typicalMiles!)} ${d.distanceUnit}.`
                : `Among those, the middle figure is **${count(d, typicalMiles!)} ${d.distanceUnit}**.`
            } Where a listing doesn't show miles, ask us before you visit.`
          : "Our listings don't show miles yet. Ask us about any car before you visit.",
        "Miles are one fact among several. The [10-minute checklist](/us/guides/used-car-checklist-free-vin-check) covers the rest.",
      ],
    },
    ...(d.sale.length > 0
      ? [
          {
            id: "lowest-priced",
            heading: "Which used cars cost the least right now?",
            body: [
              lowCar
                ? `The lowest price in our stock today is **${cash(d, lowCar.priceMinor)}**, for the ${lowCar.name}.`
                : "",
            ].filter(Boolean),
            cars: {
              title: "Lowest-priced cars for sale",
              kind: "sale" as const,
              slugs: d.sale.slice(0, 6).map((c) => c.slug),
              all: { href: "/us/inventory", label: `See all ${carsLabel(d.saleTotal)} for sale` },
            },
          },
        ]
      : []),
  ];

  const under = (major: number) => buckets.find((b) => b.major === major)!;

  return {
    description: `Used cars under ${LOW}, ${MID} and ${HIGH} in Greensboro, NC. Tap your budget to see how many cars fit, the typical year and miles, and the cars.`,
    stat: buy ? `${carsLabel(buy.count)} from ${cash(d, buy.lowestMinor)}` : "What your budget buys",
    short: buy
      ? [
          `**${carsLabel(buy.count)}** for sale today, from **${cash(d, buy.lowestMinor)}** to **${cash(d, buy.highestMinor)}**.`,
          `${buckets.map((b) => `**${b.count}** at ${usd(b.major)} or less`).join(". ")}.`,
          `The middle price is **${cash(d, buy.middleMinor)}**. The typical car is a **${typicalYear}**.`,
          "Check any car's recalls free with our [VIN check](/us/check) before you buy.",
        ]
      : [
          "No cars are listed for sale today. Tell us what you want and we will look for it.",
          "Check any car's recalls free with our [VIN check](/us/check) before you buy.",
        ],
    toolHeading: "What used car can I buy for my budget?",
    toolNote:
      "Counted from the cars for sale in our stock today, at their listed prices. A car priced exactly at the budget fits. Typical means the middle value.",
    sections,
    faqs: [
      ...(lowCar
        ? [
            {
              q: `What is the cheapest used car for sale at ${BUSINESS}?`,
              a: `The ${lowCar.name}, at ${cash(d, lowCar.priceMinor)} today.`,
            },
          ]
        : []),
      {
        q: `Do you have used cars under ${LOW} in Greensboro, NC?`,
        a:
          under(BUDGETS_MAJOR[0]).count > 0
            ? `Yes. ${carsLabel(under(BUDGETS_MAJOR[0]).count)} in our stock today ${under(BUDGETS_MAJOR[0]).count === 1 ? "costs" : "cost"} ${LOW} or less.`
            : buy
              ? `Not today. The lowest price in our stock is ${cash(d, buy.lowestMinor)}.`
              : "Not today. No cars are listed for sale right now.",
      },
      {
        q: `How many used cars do you have under ${MID}?`,
        a:
          d.sale.length > 0
            ? `${under(BUDGETS_MAJOR[1]).count} of our ${carsLabel(d.sale.length)} cost ${MID} or less today.`
            : "None today. No cars are listed for sale right now.",
      },
      {
        q: "Can I check a car before I buy it?",
        a: "Yes. Our free car check shows the recalls, owner complaints and crash-test stars for a car's model, from NHTSA data. Our 10-minute checklist covers what to look at in person.",
      },
      {
        q: "Can I sell you my car?",
        a: "Tell us about your car on the Sell page. If it's a car we want, we call you with an offer.",
      },
      ...(tier
        ? [
            {
              q: "Do I have to pay all at once?",
              a: `No. Rent to own starts at ${
                tier.weeklyMinor != null ? `${cash(d, tier.weeklyMinor)} a week` : `${cash(d, tier.dailyMinor)} a day`
              } in the ${tier.name} category, with ${cash(d, tier.ownershipThresholdMinor!)} in total rent to own the car. Deposits don't count, and rent already paid isn't refunded. Financing has its own page.`,
            },
          ]
        : []),
    ],
    links: [
      { href: "/us/inventory", label: "Cars for sale", icon: "fa-car" },
      { href: "/us/compare", label: "Compare two cars", icon: "fa-code-compare" },
      { href: "/us/check", label: "Free car check", icon: "fa-clipboard-check" },
      { href: "/us/sell", label: "Sell your car", icon: "fa-tag" },
    ],
    cta: {
      title: buy ? `Browse all ${carsLabel(d.saleTotal)}` : "Tell us what you want",
      text: buy ? "Photos, prices and details for every car in stock." : "We will look for it and call you.",
      primary: buy
        ? { href: "/us/inventory", label: "See cars for sale", icon: "fa-car" }
        : { href: "/us/contact", label: "Send a message", icon: "fa-envelope" },
      secondary: { href: "/us/compare", label: "Compare two cars", icon: "fa-code-compare" },
    },
    // The dearest car with a photo: what the top budget buys.
    photoSlug: ([...d.sale].reverse().find((c) => c.image) ?? null)?.slug ?? null,
  };
}

export const budget: Guide = {
  meta: {
    slug: SLUG,
    tool: "budget",
    eyebrow: "Buying",
    title: `Used Cars Under ${LOW}, ${MID} and ${HIGH} in Greensboro, NC: What Your Budget Buys`,
    metaTitle: `Used Cars Under ${LOW} and ${MID} in Greensboro, NC`,
    promise: `Used cars under ${LOW}, ${MID} and ${HIGH} in Greensboro, NC: tap your budget and see the cars in our stock today that fit.`,
    card: { icon: "fa-wallet", label: "Buying", line: "Tap your budget. See the cars that fit." },
    published: "2026-11-12",
    updated: "2026-11-12",
    live: true,
    group: "plan",
  },
  words,
};
