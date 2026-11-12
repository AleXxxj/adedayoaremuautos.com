import type { MarketCode } from "@/lib/market";

/**
 * Ayo, the website assistant: its name, and the words it opens with.
 *
 * Everything a visitor reads about the assistant comes from here, so the name
 * can change in one place: the launcher, the panel, the hero's "Ask Ayo" link
 * and the model's own instructions (prompt.ts) all read PERSONA.
 *
 * Why "Ayo": it means "joy" in Yoruba, the same joy that is in "Adedayo" (the
 * crown becomes joy). It is short and easy to say in Greensboro, and it is not
 * the founder's own name, so nobody thinks they are chatting with him.
 *
 * Ayo is software and always says so. The panel's header says "Virtual
 * assistant" for as long as it is open, and the prompt tells the model to say
 * it is an AI whenever it is asked, and to offer a person.
 *
 * No server imports: the chat widget, a client component, reads this file.
 */
export const PERSONA = {
  name: "Ayo",
  /** Said with the name, every time it introduces itself. */
  role: "virtual assistant",
  business: "Adedayo Aremu Autos",
  /** For the model, to use only if a visitor asks about the name. */
  nameMeaning:
    'Ayo means "joy" in Yoruba. It is the same joy that is in the name Adedayo, which means "the crown becomes joy".',
} as const;

/** Which greeting and quick replies a page gets. */
export type AssistantPage =
  | "home"
  | "rental"
  | "inventory"
  | "check"
  | "sell"
  | "referral"
  | "other";

/** Rental subpages that are not one car's page. */
const RENTAL_ROUTES = new Set(["paid", "reserved"]);

/** "/us/rentals/2013-hyundai-sonata" → "rental". Market-agnostic. */
export function assistantPage(pathname: string): AssistantPage {
  const [market, section, slug] = pathname.split("/").filter(Boolean);
  if (!market) return "other";
  if (!section) return "home";
  switch (section) {
    case "rentals":
      return slug && !RENTAL_ROUTES.has(slug) ? "rental" : "other";
    case "inventory":
      return "inventory";
    case "check":
      return "check";
    case "sell":
      return "sell";
    case "referral":
      return "referral";
    default:
      return "other";
  }
}

/** By the visitor's own clock. Late at night it is a plain hello. */
export function timeOfDay(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17) return "Good evening";
  return "Hello";
}

const OPENERS: Record<AssistantPage, string> = {
  home: "I can help you rent a car this week, find one to buy, or get an offer on yours. What brings you in?",
  rental:
    "Looking at this car? I can tell you what it costs for your dates and what you need to pick it up.",
  inventory: "Shopping for a car? Tell me your budget and I'll show you what fits.",
  check: "Want help reading a car check? Ask me what a recall means.",
  sell: "Thinking of selling? I can tell you how it works.",
  referral: "Want to earn by sending renters our way? Ask me how it works.",
  other:
    "I can help you rent a car this week, find one to buy, or get an offer on yours. What brings you in?",
};

/** The two bubbles Ayo opens with: who it is, then what it can do here. */
export function greeting(hour: number, page: AssistantPage): [string, string] {
  return [
    `${timeOfDay(hour)}. I'm ${PERSONA.name}, the ${PERSONA.role} at ${PERSONA.business}.`,
    OPENERS[page],
  ];
}

/**
 * The budget in the "Cars under …" quick reply, in minor units. A question
 * the visitor sends, not a price the business states. Nigeria has no figure:
 * its stock starts well above any round number worth suggesting.
 */
export const QUICK_BUDGET_MINOR: Record<MarketCode, number | null> = {
  us: 1_000_000,
  ng: null,
};

/**
 * Three or four one-tap questions under the greeting, until the first
 * message. Each is sent as the visitor's own words.
 *
 * @param budget the market's quick budget, already formatted ("$10,000"),
 *               or null where there is none.
 */
export function quickReplies(page: AssistantPage, budget: string | null): string[] {
  const under = budget ? `Cars under ${budget}` : "What cars do you have?";
  switch (page) {
    case "rental":
      return ["What does a week cost?", "What do I need to pick it up?", "Talk to a person"];
    case "inventory":
      return [under, "Which car costs the least?", "Talk to a person"];
    case "check":
      return ["What is a recall?", "What do the stars mean?", "Talk to a person"];
    case "sell":
      return ["How does selling work?", "Is there a fee?", "Talk to a person"];
    case "referral":
      return ["How does it work?", "When do I get paid?", "Talk to a person"];
    default:
      return ["Rent a car this week", under, "Sell my car", "Talk to a person"];
  }
}
