/**
 * Guide: what a weekly car rental costs in Greensboro, and what to bring.
 *
 * The prices are the fleet's own rates, read when the page is drawn. The
 * rules ("what to bring", "how reserving works") restate the Greensboro
 * rental policy (src/content/rentalPolicyUs.ts) and the booking page in
 * short lines, and say nothing those don't. scripts/verify-guides.ts fails
 * the build if the policy stops saying one of the things restated here.
 *
 * Two things are left out on purpose. Insurance: the business doesn't sell
 * it, and the policy's own section is the place for its wording. And "no
 * credit card needed": the policy says the charge is paid by card online or
 * at pickup, and doesn't say what is taken at pickup.
 */
import { WEEK_CHOICES } from "@/components/guides/guideMath";
import { BUSINESS, carsLabel, cash, cashRange } from "./format";
import type { Guide, GuideData, GuideWords } from "./types";

const SLUG = "weekly-car-rental-greensboro-nc";

/**
 * What the policy says, quoted, for the build to hold this guide to. Each is
 * a phrase the words below depend on.
 */
export const POLICY_RELIES_ON = [
  "You must be 18 or older on the day you pick up the vehicle.",
  "A valid US driver's license, in your name, that does not expire before the end of your rental.",
  "International Driving Permit, plus your passport.",
  "A phone number we can reach you on during your rental.",
  "You upload a photo of your driver's license when you reserve.",
  "the name on them must match the person picking up the vehicle",
  "we hold the vehicle for up to 2 days",
  "The hold never runs past the end of your pickup day.",
  "You can hold up to two vehicles at a time.",
  "7 days in a row from your pickup time",
  "We price your rental on the cheapest combination of these rates automatically",
  "We allow a 1-hour grace period. After that, an extra day is charged at the daily rate.",
  "it is taken at pickup — not when you reserve",
  "released within 3–5 business days after you return the vehicle",
  "You can pay the rental charge by card online when you reserve, or at pickup.",
  "Return the vehicle with the same fuel level it had at pickup",
  "Tolls, parking, and traffic or parking tickets",
  "While it lasts, nobody else can book those dates.",
  "If the hold ends and the rental has not been paid for, the dates become available to other customers again.",
  "The refundable security deposit has been taken.",
  "You have signed the rental agreement.",
] as const;

function words(d: GuideData): GuideWords {
  const fleet = d.rent;
  const weekly = fleet.flatMap((c) => (c.tariff.weeklyMinor != null ? [c.tariff.weeklyMinor] : []));
  const daily = fleet.map((c) => c.tariff.dailyMinor);
  const monthly = fleet.flatMap((c) => (c.tariff.monthlyMinor != null ? [c.tariff.monthlyMinor] : []));
  const deposits = fleet.map((c) => c.tariff.depositMinor).filter((n) => n > 0);
  const lowestWeekly = weekly.length ? Math.min(...weekly) : null;
  const lowestDaily = daily.length ? Math.min(...daily) : null;
  const lowestCar =
    lowestWeekly != null ? fleet.find((c) => c.tariff.weeklyMinor === lowestWeekly) ?? null : null;
  // "1, 2, 4 or 8 weeks"
  const lengths = `${WEEK_CHOICES.slice(0, -1).join(", ")} or ${WEEK_CHOICES[WEEK_CHOICES.length - 1]} weeks`;
  const hold = `${d.holdDays} ${d.holdDays === 1 ? "day" : "days"}`;
  const depositLine = deposits.length
    ? `The refundable deposit: **${cashRange(d, deposits)}**${
        Math.min(...deposits) === Math.max(...deposits) ? "" : ", depending on the car"
      }. It's taken at pickup, not when you reserve.`
    : "Any deposit is shown on the car's page. It's taken at pickup, not when you reserve.";

  const description =
    lowestWeekly != null
      ? `Weekly car rental in Greensboro, NC from ${cash(d, lowestWeekly)} a week. Tap ${lengths} to see what each car costs, its deposit, and what you need to bring.`
      : `Weekly car rental in Greensboro, NC: tap ${lengths} to see what each car costs, its refundable deposit, what to bring and how reserving works.`;

  const short =
    fleet.length === 0
      ? [
          "No cars are listed to rent today. Call us and ask what is coming.",
          `Reserving online is free. We hold the car for up to **${hold}**.`,
          "Bring a valid driver's license. You must be **18 or older**.",
        ]
      : [
          lowestWeekly != null
            ? `**${carsLabel(fleet.length)}** to rent today, from **${cash(d, lowestWeekly)} a week** or **${cash(d, lowestDaily!)} a day**.`
            : `**${carsLabel(fleet.length)}** to rent today, from **${cash(d, lowestDaily!)} a day**.`,
          deposits.length
            ? `Deposits are **${cashRange(d, deposits)}**, refundable, and taken at pickup.`
            : "Any deposit is refundable and taken at pickup.",
          `Reserving online is free. We hold the car for up to **${hold}**.`,
          "Bring a valid driver's license. You must be **18 or older**.",
        ];

  return {
    description,
    stat:
      lowestWeekly != null
        ? `From ${cash(d, lowestWeekly)} a week`
        : lowestDaily != null
          ? `From ${cash(d, lowestDaily)} a day`
          : "Prices and what to bring",
    short,
    toolHeading: "How much is a weekly car rental in Greensboro?",
    toolNote:
      "Each total is the lowest mix of that car's daily, weekly and monthly rates, the same pricing the booking form uses. The deposit is refundable and is not part of the total.",
    sections: [
      {
        id: "by-the-week",
        heading: "Can I rent a car by the week in Greensboro?",
        body:
          weekly.length > 0
            ? [
                `Yes. **${weekly.length} of our ${carsLabel(fleet.length)}** ${weekly.length === 1 ? "has" : "have"} a weekly rate, ${
                  Math.min(...weekly) === Math.max(...weekly) ? "at" : "from"
                } **${cashRange(d, weekly)}** a week. A week is 7 days in a row from your pickup time.`,
                weekly.length < fleet.length
                  ? "The other cars rent by the day. Longer rentals get the lowest mix of daily, weekly and monthly rates automatically."
                  : "Longer rentals get the lowest mix of daily, weekly and monthly rates automatically.",
              ]
            : [
                "Our cars rent by the day today. Rent one for 7 days and the tool above shows the total.",
              ],
      },
      {
        id: "what-to-bring",
        heading: "What do I need to rent a car in Greensboro, NC?",
        body: [
          "You upload a photo of your license when you reserve. The name on it has to match the person picking up the car.",
        ],
        list: [
          { icon: "fa-cake-candles", text: "Be **18 or older** on the day you pick up the car." },
          {
            icon: "fa-id-card",
            text: "A valid US driver's license in your name. It can't expire before your rental ends.",
          },
          {
            icon: "fa-globe",
            text: "From another country: your home license, an International Driving Permit and your passport.",
          },
          { icon: "fa-phone", text: "A phone number we can reach you on during the rental." },
          { icon: "fa-shield-halved", text: depositLine },
        ],
      },
      {
        id: "reserving",
        heading: "How does reserving a rental car work?",
        body: [
          `You can hold up to ${d.maxHolds} cars at a time. If a hold ends unpaid, the dates open up again.`,
        ],
        steps: [
          "Pick a car and your dates online. Reserving is free.",
          `We hold the car for up to **${hold}**, never past the end of your pickup day. Nobody else can book those dates.`,
          d.payOnline
            ? "Pay by card online during the hold, or pay at pickup."
            : "Pay when you pick up the car.",
          "At pickup we review your license, take the deposit, and you sign the rental agreement.",
        ],
        link: { href: "/us/rental-policy", label: "Read the full rental policy" },
      },
      ...(fleet.length > 0
        ? [
            {
              id: "cheapest",
              heading: "What is the cheapest weekly car rental here?",
              body: [
                lowestCar && lowestWeekly != null
                  ? `Today the lowest weekly rate is **${cash(d, lowestWeekly)}**, for the ${lowestCar.name}.${
                      monthly.length
                        ? ` Need a car for a month? The lowest monthly rate is **${cash(d, Math.min(...monthly))}** for 30 days.`
                        : ""
                    }`
                  : `Today the lowest daily rate is **${cash(d, lowestDaily!)}**.`,
              ],
              cars: {
                title: "Cars for rent this week",
                kind: "rent" as const,
                slugs: fleet.slice(0, 6).map((c) => c.slug),
                all: { href: "/us/rentals", label: `See all ${carsLabel(fleet.length)} for rent` },
              },
            },
          ]
        : []),
    ],
    faqs: [
      {
        q: "How much does it cost to rent a car for a week in Greensboro, NC?",
        a:
          weekly.length > 0
            ? `At ${BUSINESS}, weekly rates are ${cashRange(d, weekly)} today, depending on the car. The refundable deposit is separate.`
            : lowestDaily != null
              ? `At ${BUSINESS}, cars rent from ${cash(d, lowestDaily)} a day today. The refundable deposit is separate.`
              : `Rates are on each car's page at ${BUSINESS}. No cars are listed to rent today.`,
      },
      {
        q: "Do I pay when I reserve?",
        a: d.payOnline
          ? "No. Reserving online is free. You pay the rental charge by card online, or at pickup. The deposit is taken at pickup."
          : "No. Reserving online is free. You pay the rental charge and the deposit when you pick up the car.",
      },
      {
        q: "How old do I have to be to rent a car?",
        a: "18 or older on the day you pick up the car, with a valid driver's license in your name.",
      },
      {
        q: "How long will you hold a car for me?",
        a: `Up to ${hold} after you reserve online, and never past the end of your pickup day. You can hold up to ${d.maxHolds} cars at a time.`,
      },
      {
        q: "When do I get my deposit back?",
        a: "Whatever isn't used is released within 3 to 5 business days after you return the car, to the payment method you used. Your bank may take a few more days to show it.",
      },
      {
        q: "What is not included in the weekly rate?",
        a: "Fuel, tolls, parking and tickets. Bring the car back with the same fuel level it had at pickup. A return more than 1 hour late is charged one extra day at the daily rate.",
      },
    ],
    links: [
      { href: "/us/rentals", label: "Cars for rent", icon: "fa-key" },
      { href: "/us/rental-policy", label: "Rental policy", icon: "fa-file-lines" },
      { href: "/us/rent-to-own", label: "Rent to own", icon: "fa-hand-holding-heart" },
    ],
    cta: {
      title: "Ready to rent?",
      text: "Pick a car and your dates. Reserving is free.",
      primary: { href: "/us/rentals", label: "See cars for rent", icon: "fa-key" },
      ...(d.phone && d.phoneLabel
        ? { secondary: { href: `tel:${d.phone}`, label: `Call ${d.phoneLabel}`, icon: "fa-phone" } }
        : {}),
    },
    photoSlug: (fleet.find((c) => c.image) ?? null)?.slug ?? null,
  };
}

export const weeklyRental: Guide = {
  meta: {
    slug: SLUG,
    tool: "weeks",
    eyebrow: "Renting",
    title: "Weekly Car Rental in Greensboro, NC: Prices and What You Need",
    metaTitle: "Weekly Car Rental in Greensboro, NC: Prices, What You Need",
    promise:
      "Weekly car rental in Greensboro, NC, priced car by car. Tap how long you need one and see every total.",
    card: {
      icon: "fa-key",
      label: "Renting",
      line: "Tap how long you need a car. See what each one costs.",
    },
    published: "2026-11-12",
    updated: "2026-11-12",
    live: true,
    group: "plan",
  },
  words,
};
