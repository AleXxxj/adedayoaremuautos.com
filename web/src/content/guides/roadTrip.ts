/**
 * Guide: day trips from Greensboro in a rental car.
 *
 * Pick a place, pick the days, and see what each car in the fleet costs for
 * the trip, priced by quoteRental like the booking form.
 *
 * THE MILES. Each distance is one way by road from downtown Greensboro,
 * rounded to the nearest 5 and always shown as "about". Each was worked out
 * on November 13, 2026 with the OSRM router on OpenStreetMap data
 * (router.project-osrm.org, city center to city center) and checked against
 * a second, published figure. Both are kept beside the place (`routed`,
 * `check`) for whoever checks this next. No drive times, fuel costs or mpg
 * figures are given: none comes from a source we could cite.
 *
 * THE RENTAL TERMS. The policy states no number of miles. It says the rate
 * includes "the mileage allowance stated on your rental agreement", so this
 * guide says exactly that and sends the reader to ask before a long trip.
 * It also does not say whether a car may leave North Carolina; the guide
 * says to tell us where you are going when you reserve. The phrases relied
 * on are in TRIP_POLICY_RELIES_ON, and the build checks the policy still
 * says them.
 */
import { TRIP_DAYS, roundTripMiles, tripCost } from "@/components/guides/gameMath";
import { BUSINESS, carsLabel, cash } from "./format";
import type { Guide, GuideData, GuideWords } from "./types";

const SLUG = "road-trip-from-greensboro";

export interface TripPlace {
  id: string;
  name: string;
  /** "Mountains", "Beach", "City" */
  kind: string;
  icon: string;
  /** About this many road miles, one way, to the nearest 5. */
  miles: number;
  /** One short line: what you go for. */
  line: string;
  /** The routed figure the rounded one comes from, and where it came from. */
  routed: { miles: number; source: string };
  /** A second, published figure. */
  check: { miles: number; source: string };
}

const OSRM = "https://router.project-osrm.org (OpenStreetMap data), routed November 13, 2026";

/** Nearest first. */
export const TRIP_PLACES: TripPlace[] = [
  {
    id: "hanging-rock",
    name: "Hanging Rock State Park",
    kind: "Hike",
    icon: "fa-person-hiking",
    miles: 45,
    line: "Waterfalls and a big view, back by dinner.",
    routed: { miles: 45.2, source: OSRM },
    check: { miles: 45, source: "https://www.allstateparks.com/state-parks-near/greensboro" },
  },
  {
    id: "raleigh",
    name: "Raleigh",
    kind: "City",
    icon: "fa-landmark",
    miles: 75,
    line: "The state capital, with museums downtown.",
    routed: { miles: 76.2, source: OSRM },
    check: { miles: 75, source: "https://www.distancecalculator.net/from-west-raleigh-to-greensboro" },
  },
  {
    id: "charlotte",
    name: "Charlotte",
    kind: "City",
    icon: "fa-city",
    miles: 90,
    line: "The biggest city in the state, down I-85.",
    routed: { miles: 90.4, source: OSRM },
    check: { miles: 93, source: "https://www.homesnacks.com/distances-between-cities-in-north-carolina/" },
  },
  {
    id: "boone",
    name: "Boone",
    kind: "Mountains",
    icon: "fa-mountain",
    miles: 115,
    line: "A mountain town near the Blue Ridge Parkway.",
    routed: { miles: 113.0, source: OSRM },
    check: { miles: 114, source: "https://www.homesnacks.com/distances-between-cities-in-north-carolina/" },
  },
  {
    id: "asheville",
    name: "Asheville",
    kind: "Mountains",
    icon: "fa-mountain-sun",
    miles: 170,
    line: "Mountain views, music and long lunches.",
    routed: { miles: 171.9, source: OSRM },
    check: { miles: 172, source: "https://www.distancecalculator.net/from-greensboro-to-asheville" },
  },
  {
    id: "myrtle-beach",
    name: "Myrtle Beach",
    kind: "Beach",
    icon: "fa-umbrella-beach",
    miles: 200,
    line: "Sand, a boardwalk and mini golf.",
    routed: { miles: 200.5, source: OSRM },
    check: { miles: 216, source: "https://distancefrom.co/distance/greensboro-to-myrtle-beach/" },
  },
  {
    id: "wilmington",
    name: "Wilmington",
    kind: "Beach",
    icon: "fa-water",
    miles: 210,
    line: "A riverfront downtown with beaches close by.",
    routed: { miles: 207.6, source: OSRM },
    check: { miles: 208, source: "https://how-far.net/distance/Greensboro-NC/Wilmington-NC" },
  },
  {
    id: "washington-dc",
    name: "Washington, DC",
    kind: "City",
    icon: "fa-monument",
    miles: 310,
    line: "The monuments and the Smithsonian. Better as a weekend.",
    routed: { miles: 309.3, source: OSRM },
    check: { miles: 311, source: "https://wanderlog.com/drive/between/58159/58281/washington-dc-to-greensboro-drive" },
  },
];

/** What the rental policy says, quoted, that this guide's words depend on. */
export const TRIP_POLICY_RELIES_ON = [
  "the mileage allowance stated on your rental agreement",
  "Miles over your allowance",
  "The rate stated on your rental agreement",
  "the use stated on your rental agreement",
  "The cost of refilling to the level at pickup",
  "Tolls, parking, and traffic or parking tickets",
  "Late return (more than 1 hour late)",
  "One extra day at the daily rate",
  "Only you, and any additional driver we have approved in writing, may drive it.",
  "released within 3–5 business days after you return the vehicle",
] as const;

/** The line about miles shown under every trip's prices. */
export const TRIP_MILEAGE_NOTE =
  "Your rate includes the mileage allowance stated on your rental agreement. Ask us what it is before a long trip.";

/** What a trip's share line says. The link is added by the share button. */
export const tripShareText = (place: TripPlace, days: number, from: string | null) =>
  `${place.name} and back, ${days} ${days === 1 ? "day" : "days"}${from ? `, from ${from} in a rental car` : ""}. Where would you go?`;

const PLACES = TRIP_PLACES.length;
const NEAR = TRIP_PLACES[0];
const FAR = TRIP_PLACES[TRIP_PLACES.length - 1];

function words(d: GuideData): GuideWords {
  const oneDay = tripCost(d.rent, TRIP_DAYS[0]);
  const weekend = tripCost(d.rent, 2);
  const lowCar = oneDay.rows[0]?.cost ? oneDay.rows[0].car : null;

  return {
    description: `Day trips from Greensboro, NC by rental car: ${PLACES} places from about ${NEAR.miles} to ${FAR.miles} miles away. Tap a place and the days, and see what each car costs for the trip.`,
    stat: oneDay.fromMinor != null ? `${PLACES} trips from ${cash(d, oneDay.fromMinor)} a day` : `${PLACES} trips, ${NEAR.miles} to ${FAR.miles} miles`,
    short: [
      `**${PLACES} places**, from about **${NEAR.miles} miles** (${NEAR.name}) to about **${FAR.miles} miles** (${FAR.name}).`,
      oneDay.fromMinor != null && weekend.fromMinor != null
        ? `A rental car starts at **${cash(d, oneDay.fromMinor)}** for 1 day and **${cash(d, weekend.fromMinor)}** for 2, plus a refundable deposit.`
        : "No cars are listed to rent today, so there is no price to give. Check back soon.",
      "Miles are one way, by road, and rounded. Your map app has the exact figure.",
      "Your mileage allowance is on your rental agreement. Ask before a long trip.",
    ],
    toolHeading: "How far can you go from Greensboro?",
    toolNote: "Prices are rent only, worked out the way the booking form does. Fuel, tolls and parking are yours. Miles are approximate.",
    sections: [
      {
        id: "day-trips",
        heading: "What are good day trips from Greensboro, NC?",
        body: [
          `Greensboro sits in the middle of North Carolina, so mountains, cities and the coast are all within reach. Here are the ${PLACES} in the tool, nearest first.`,
        ],
        list: TRIP_PLACES.map((p) => ({
          icon: p.icon,
          text: `**${p.name}**, about ${p.miles} miles. ${p.line}`,
        })),
      },
      {
        id: "how-far",
        heading: "How far is Greensboro from the beach and the mountains?",
        body: [
          `By road, Boone, in the mountains, is about **${place("boone").miles} miles** away, and Asheville is about **${place("asheville").miles} miles**.`,
          `The beach is about **${place("myrtle-beach").miles} miles** to Myrtle Beach or about **${place("wilmington").miles} miles** to Wilmington. Double those for the round trip: about ${roundTripMiles(place("myrtle-beach").miles)} and ${roundTripMiles(place("wilmington").miles)} miles.`,
        ],
      },
      {
        id: "cost",
        heading: "How much does it cost to rent a car for a road trip?",
        body: [
          oneDay.fromMinor != null && lowCar
            ? `Today the lowest price for 1 day is **${cash(d, oneDay.fromMinor)}** (${lowCar.name}). The tool above prices every car for 1, 2, 3 or 7 days.`
            : "The tool above prices every car in the fleet when cars are listed.",
          "The price is rent only. The deposit is yours and is released after you return the car. You pay for your own fuel, and return the car with the same fuel level it had at pickup.",
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
      {
        id: "mileage",
        heading: "Is there a mileage limit on a rental car?",
        body: [
          "Your rate includes the mileage allowance stated on your rental agreement. Miles over it are charged at the rate on that agreement.",
          "So before a long trip, ask us what the allowance is, and tell us where you plan to go when you reserve. The [rental policy](/us/rental-policy) has the rest.",
        ],
        link: { href: "/us/rental-policy", label: "Read the rental policy" },
      },
      {
        id: "before-you-go",
        heading: "What should I know before a road trip in a rental?",
        body: ["Four things from our rental policy."],
        list: [
          { icon: "fa-gas-pump", text: "Bring it back with the same fuel level it had at pickup." },
          { icon: "fa-road-barrier", text: "Tolls, parking and tickets are yours, at the actual amount." },
          { icon: "fa-clock", text: "More than 1 hour late back is one extra day at the daily rate." },
          { icon: "fa-user-check", text: "Only you, and any driver we approved in writing, may drive." },
        ],
      },
    ],
    faqs: [
      {
        q: "How far is Asheville from Greensboro, NC?",
        a: `About ${place("asheville").miles} miles by road, one way. That is about ${roundTripMiles(place("asheville").miles)} miles there and back.`,
      },
      {
        q: "How far is Myrtle Beach from Greensboro, NC?",
        a: `About ${place("myrtle-beach").miles} miles by road, one way. Routes differ, so check your map app before you leave.`,
      },
      {
        q: "Can I rent a car for one day in Greensboro?",
        a: `${BUSINESS} rents by the day, the week and the month. The tool on this page shows which cars can be rented for 1 day and what each costs today.`,
      },
      {
        q: "Does the rental price include unlimited miles?",
        a: "The rental policy does not say unlimited. It says your rate includes the mileage allowance stated on your rental agreement, so ask what it is before a long trip.",
      },
      {
        q: "Can I take a rental car out of North Carolina?",
        a: "Tell us where you plan to go when you reserve. The car may be used only for the use stated on your rental agreement.",
      },
      {
        q: "Where do the distances come from?",
        a: "They are road distances from downtown Greensboro, worked out on OpenStreetMap data and rounded to the nearest 5 miles. Treat them as estimates.",
      },
    ],
    links: [
      { href: "/us/rentals", label: "Cars to rent", icon: "fa-key" },
      { href: "/us/guides/weekly-car-rental-greensboro-nc", label: "Weekly rental prices", icon: "fa-calendar-week" },
      { href: "/us/rental-policy", label: "Rental policy", icon: "fa-file-lines" },
      { href: "/us/contact", label: "Ask us a question", icon: "fa-comment" },
    ],
    cta: {
      title: "Pick a car for the trip",
      text: "See the fleet, choose your dates, and reserve.",
      primary: { href: "/us/rentals", label: "See cars to rent", icon: "fa-key" },
      ...(d.phone && d.phoneLabel
        ? { secondary: { href: `tel:${d.phone}`, label: `Call ${d.phoneLabel}`, icon: "fa-phone" } }
        : {}),
    },
    photoSlug: (d.rent.filter((c) => c.image)[1] ?? d.rent.find((c) => c.image) ?? d.sale.find((c) => c.image) ?? null)?.slug ?? null,
  };
}

function place(id: string): TripPlace {
  return TRIP_PLACES.find((p) => p.id === id)!;
}

export const roadTripGuide: Guide = {
  meta: {
    slug: SLUG,
    tool: "road-trip",
    eyebrow: "Road trips",
    title: "How Far Can You Go? Day Trips From Greensboro by Rental Car",
    metaTitle: "Day Trips From Greensboro, NC by Rental Car",
    promise: "Day trips from Greensboro by rental car: pick a place, pick the days, and see what each car costs for the trip.",
    card: { icon: "fa-route", label: "Road trips", line: `${PLACES} places to go. Tap one and see what each car costs.` },
    published: "2026-11-13",
    updated: "2026-11-13",
    live: true,
    group: "plan",
    game: true,
  },
  words,
};
