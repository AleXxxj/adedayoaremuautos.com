/**
 * Page content shared across the three design directions.
 *
 * Kept in one place so the directions differ in *design*, not in substance —
 * you are comparing how it looks and feels, not which one happens to have more
 * words. Everything here is factual or a genuine service offering; there are no
 * invented testimonials or unsupportable claims.
 */

import type { MarketCode } from "./market";

export interface Service {
  key: string;
  title: string;
  blurb: string;
  href: (m: MarketCode) => string;
  cta: string;
}

export const SERVICES: Service[] = [
  {
    key: "buy",
    title: "Buy",
    blurb:
      "Inspected vehicles with the paperwork in order. Every listing shows its mileage, condition and history before you ask.",
    href: (m) => `/${m}/inventory`,
    cta: "Browse inventory",
  },
  {
    key: "rent",
    title: "Rent",
    blurb:
      "Daily, weekly and monthly hire. Availability is live, so the car you book is the car you get.",
    href: (m) => `/${m}/contact?type=rental`,
    cta: "Enquire about rental",
  },
  {
    key: "finance",
    title: "Finance",
    blurb:
      "Payment plans decided in-house rather than passed to a bank. Tell us your budget and we work backwards from it.",
    href: (m) => `/${m}/contact?type=finance`,
    cta: "Talk about financing",
  },
];

export interface Reason {
  title: string;
  blurb: string;
}

/** Differentiators that are true and verifiable, per market. */
export function reasons(market: MarketCode): Reason[] {
  const shared: Reason[] = [
    {
      title: "Inspected before listing",
      blurb:
        "Every vehicle is checked over before it goes up, and anything we find is written into the listing rather than left for you to discover.",
    },
    {
      title: "Prices you can actually pay",
      blurb:
        "One price per vehicle, in the currency of the market it sits in. No converted figures that change when you get here.",
    },
    {
      title: "Paperwork handled",
      blurb:
        market === "us"
          ? "Title, registration and transfer processed for you, with the Buyers Guide on the vehicle before you buy."
          : "Customs documentation, clearance and transfer handled end to end.",
    },
    {
      title: "We answer",
      blurb:
        "Enquiries reach a person, not a form that goes nowhere. Response time is measured, because it is the thing that matters most to you.",
    },
  ];

  if (market === "us") {
    shared.push({
      title: "Serving the Triad",
      blurb:
        "Based on Gillespie Street in Greensboro, covering High Point, Winston-Salem and the surrounding area.",
    });
  } else {
    shared.push({
      title: "Delivery nationwide",
      blurb: "We move the vehicle to you anywhere in the country, insured in transit.",
    });
  }

  return shared;
}

/** The referral programme is a real offer the business already makes. */
export const REFERRAL = {
  rate: 1.5,
  title: "Refer a buyer, earn on the sale",
  blurb:
    "Know someone looking? Introduce them. When the sale completes you take a commission on it, with no cap on how many people you refer.",
};
