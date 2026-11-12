/**
 * The "Sell your car" form's questions, answers and rules, shared by the
 * page, the server and scripts/verify-sell.ts.
 *
 * Pure: no React, no DOM and no zod, so the page ships no zod and the checks
 * run under tsx. The server's schema (src/lib/sellRequest.ts) takes its
 * messages and its number rules from here, so what the form says before Next
 * is what the server says after Send.
 */
import { MARKETS, type MarketCode } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import { todayIn } from "@/lib/localDate";
import { EMAIL_RE, digitCount } from "@/components/rentalBookingSteps";

export type Step = 1 | 2 | 3 | 4;

export const STEP_TITLES: Record<Step, string> = {
  1: "Your car",
  2: "Its condition",
  3: "What you want",
  4: "How to reach you",
};

/** What the leads table's `source` says for a request from this page. */
export const SELL_SOURCE = "website-sell";

export interface Choice {
  value: string;
  label: string;
  /** One line under the label, where the label alone could be read two ways. */
  help?: string;
}

export const CONDITIONS: readonly Choice[] = [
  { value: "like_new", label: "Like new", help: "Looks and runs like new." },
  { value: "good", label: "Good", help: "A few small marks. Nothing to fix." },
  { value: "fair", label: "Fair", help: "Dents or wear. Needs some repairs." },
  { value: "needs_work", label: "Needs work", help: "Needs big repairs, or doesn't run." },
];

export const ACCIDENT: readonly Choice[] = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
  { value: "not_sure", label: "Not sure" },
];

export const LIGHTS: readonly Choice[] = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
];

export const KEYS: readonly Choice[] = [
  { value: "2", label: "2 or more" },
  { value: "1", label: "1" },
];

/** In the US the question is the title; in Nigeria it is the papers. */
export const TITLE_US: readonly Choice[] = [
  { value: "clean", label: "Clean title in my name", help: "No loan on it." },
  { value: "owe", label: "I still owe money on it", help: "A bank or lender is on the title." },
  { value: "salvage", label: "Salvage or rebuilt title", help: "An insurer totaled it before." },
  { value: "not_sure", label: "Not sure", help: "That's fine. We'll ask when we call." },
];

export const PAPERS_NG: readonly Choice[] = [
  { value: "all", label: "All papers in my name", help: "Customs papers and registration." },
  { value: "some", label: "Some papers", help: "Some missing, or in another name." },
  { value: "none", label: "No papers yet", help: "Not yet cleared or registered." },
];

export const WANTS: readonly Choice[] = [
  { value: "sell", label: "Sell it to us", help: "We make you an offer for it." },
  { value: "trade", label: "Trade it in for one of your cars", help: "Its value goes toward a car from us." },
  { value: "not_sure", label: "Not sure yet", help: "We can talk about both." },
];

/**
 * How to reply. "sms" is stored as it is named in the staff inbox's reply
 * buttons (components/admin/LeadReply.tsx); the others are the values the
 * contact form already stores.
 */
const REPLY: Record<MarketCode, readonly Choice[]> = {
  us: [
    { value: "phone", label: "Call" },
    { value: "sms", label: "Text" },
    { value: "email", label: "Email" },
  ],
  ng: [
    { value: "phone", label: "Call" },
    { value: "whatsapp", label: "WhatsApp" },
    { value: "email", label: "Email" },
  ],
};

export const titleChoices = (market: MarketCode): readonly Choice[] =>
  market === "us" ? TITLE_US : PAPERS_NG;

export const replyChoices = (market: MarketCode): readonly Choice[] => REPLY[market];

export const valuesOf = (choices: readonly Choice[]): string[] => choices.map((c) => c.value);

const isChoice = (choices: readonly Choice[], value: string): boolean =>
  choices.some((c) => c.value === value);

const labelOf = (choices: readonly Choice[], value: string): string =>
  choices.find((c) => c.value === value)?.label ?? value;

/** Makes people type most, for the make box's suggestions. */
export const COMMON_MAKES: readonly string[] = [
  "Acura", "Audi", "BMW", "Buick", "Cadillac", "Chevrolet", "Chrysler", "Dodge",
  "Ford", "GMC", "Honda", "Hyundai", "Infiniti", "Jaguar", "Jeep", "Kia",
  "Land Rover", "Lexus", "Lincoln", "Mazda", "Mercedes-Benz", "MINI",
  "Mitsubishi", "Nissan", "Peugeot", "Porsche", "Ram", "Subaru", "Tesla",
  "Toyota", "Volkswagen", "Volvo",
];

export const MIN_YEAR = 1990;
export const MAX_MILEAGE = 1_000_000;
/** Far above any car's price in either currency: a guard against typos, not a cap on offers. */
export const MAX_PRICE = 10_000_000_000;
export const MAX_MAKE = 40;
export const MAX_MODEL = 60;
export const MAX_LOCATION = 80;
export const MAX_NOTES = 2000;
export const MAX_NAME = 120;
export const MAX_PHONE = 40;

const wholeNumber = (n: number) => new Intl.NumberFormat("en-US").format(n);

/** Every message the form and the server can show, in one market's words. */
export function sellMessages(market: MarketCode) {
  const us = market === "us";
  const unit = us ? "miles" : "km";
  return {
    vinMissing: "Type the VIN, or tap “No VIN? Type it in”.",
    vinLookUp: "Tap “Look it up” to find your car.",
    confirm: "Is this your car? Tap Yes or No.",
    year: "Choose the year.",
    yearOld: `This form is for cars from ${MIN_YEAR} on. Call us about an older car.`,
    make: "What make is it? For example, Toyota.",
    makeLong: "That make is too long.",
    model: "What model is it? For example, Camry.",
    modelLong: "That model is too long.",
    mileage: `How many ${unit} are on it?`,
    mileageBad: `Type the ${unit} as a number, like ${us ? "85000" : "120000"}.`,
    mileageHigh: `That's over ${wholeNumber(MAX_MILEAGE)} ${unit}. Check the number.`,
    location: us ? "Keep it short, like a city or ZIP." : "Keep it short, like a city or area.",
    condition: "What shape is it in? Choose one.",
    accident: "Has it been in an accident? Choose one.",
    warningLights: "Any warning lights on? Choose one.",
    title: us ? "What about the title? Choose one." : "What about the papers? Choose one.",
    keys: "How many keys? Choose one.",
    wants: "What would you like to do? Choose one.",
    price: `Type the price as a number, like ${us ? "18000" : "6500000"}.`,
    priceHigh: "That price looks too high. Check the number.",
    notes: `Please keep it under ${wholeNumber(MAX_NOTES)} characters.`,
    name: "Please enter your name.",
    nameLong: "That name is too long.",
    phone: "Please enter your phone number.",
    phoneShort: "Please enter your full phone number, with the area code.",
    phoneLong: "That phone number is too long.",
    email: "That email doesn't look right.",
    emailNeeded: us
      ? "Add your email, or choose Call or Text."
      : "Add your email, or choose Call or WhatsApp.",
    replyBy: "How should we reply? Choose one.",
    reload: "Please reload the page and try again.",
  };
}

export type SellMessages = ReturnType<typeof sellMessages>;

/** One line, single-spaced: what a single-line box holds, newlines and all. */
export const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Postgres can't store a NUL character in text; a request with one would fail to save. */
export const stripNul = (s: string): string => s.replace(/\u0000/g, "");

/** Notes as typed, with their line breaks, and no run of blank lines. */
export function tidyNotes(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * "85,000", "$18,000", "₦6,500,000" or "N6500000" as a whole number; null
 * for anything else, including a minus sign.
 */
export function parseWhole(raw: string): number | null {
  const s = raw
    .trim()
    .replace(/^(?:\$|₦|N(?=\s*\d))\s*/i, "")
    .replace(/[\s,]/g, "")
    .replace(/\.0{1,2}$/, "");
  if (!/^\d{1,13}$/.test(s)) return null;
  return Number(s);
}

/** The newest model year offered: next year's models go on sale this year. */
export function maxModelYear(market: MarketCode, now = new Date()): number {
  return Number(todayIn(MARKETS[market].timezone, now).slice(0, 4)) + 1;
}

/** The year list, newest first. */
export function yearOptions(maxYear: number): number[] {
  const years: number[] = [];
  for (let y = maxYear; y >= MIN_YEAR; y--) years.push(y);
  return years;
}

export function yearProblem(raw: string, maxYear: number, m: SellMessages): string | null {
  const s = raw.trim();
  if (!/^\d{4}$/.test(s)) return m.year;
  const y = Number(s);
  if (y < MIN_YEAR) return m.yearOld;
  if (y > maxYear) return m.year;
  return null;
}

export function mileageProblem(raw: string, m: SellMessages): string | null {
  if (!raw.trim()) return m.mileage;
  const n = parseWhole(raw);
  if (n === null) return m.mileageBad;
  if (n > MAX_MILEAGE) return m.mileageHigh;
  return null;
}

/** The price is optional: nothing typed is no problem. */
export function priceProblem(raw: string, m: SellMessages): string | null {
  if (!raw.trim()) return null;
  const n = parseWhole(raw);
  if (n === null) return m.price;
  if (n > MAX_PRICE) return m.priceHigh;
  return null;
}

/** Makes NHTSA spells in capitals that are written that way. */
const ACRONYMS = new Set(["BMW", "GMC", "MINI", "SRT", "AMG", "VW"]);

/** A make as NHTSA decodes it: "MERCEDES-BENZ" -> "Mercedes-Benz", "BMW" stays "BMW". */
export function decodedMake(make: string): string {
  const s = oneLine(make);
  if (ACRONYMS.has(s.toUpperCase())) return s.toUpperCase();
  return s
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}

/** A typed make in its usual spelling when it is a common one ("toyota" -> "Toyota"); otherwise as typed. */
export function makeName(make: string): string {
  const s = oneLine(make);
  return COMMON_MAKES.find((k) => k.toLowerCase() === s.toLowerCase()) ?? s;
}

/** NHTSA's model without its note: "RAV4 Prime (PHEV)" -> "RAV4 Prime". */
export const cleanModel = (model: string): string =>
  oneLine(model.replace(/\s*\([^)]*\)\s*$/, ""));

/** "2017 Toyota Highlander XLE": what the staff alert and the inbox call the car. */
export function carName(c: {
  year: number | string;
  make: string;
  model: string;
  trim?: string | null;
}): string {
  const model = oneLine(c.model);
  const trim = c.trim ? oneLine(c.trim) : "";
  const withTrim = trim && !model.toLowerCase().endsWith(trim.toLowerCase()) ? trim : "";
  return [String(c.year), oneLine(c.make), model, withTrim].filter(Boolean).join(" ");
}

/** "S-4F2A", from the lead's id: short enough to read down a phone. */
export function sellReference(leadId: string): string {
  return `S-${leadId.replace(/[^0-9a-f]/gi, "").slice(0, 4).toUpperCase()}`;
}

/** What a sell request's message names the car, for the inbox's reply buttons. */
export function carFromSellMessage(message: string | null | undefined): string | null {
  return message?.match(/^Car: (.+)$/m)?.[1]?.trim() || null;
}

export interface SellDetails {
  market: MarketCode;
  reference: string;
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  vin?: string | null;
  mileage: number;
  location?: string | null;
  condition: string;
  accident: string;
  warningLights: string;
  title: string;
  keys: string;
  wants: string;
  price?: number | null;
  replyBy: string;
  notes?: string | null;
}

/**
 * The request as staff read it in the inbox and the alert email: one fact
 * per line, in the order they ask about a car on the phone. Every value is
 * flattened to one line except the notes, which come last, so nothing typed
 * can pass itself off as another line.
 */
export function composeSellMessage(d: SellDetails): string {
  const m = MARKETS[d.market];
  const us = d.market === "us";
  const location = d.location ? oneLine(d.location) : "";
  const notes = d.notes ? tidyNotes(d.notes) : "";
  const price =
    d.price != null
      ? ` · Price in mind: ${formatMoney(money(d.price * 100, m.currency), m.locale)}`
      : "";
  return [
    `Sell request · Ref ${d.reference}`,
    `Car: ${carName(d)}`,
    d.vin ? `VIN: ${oneLine(d.vin)}` : null,
    `Mileage: ${new Intl.NumberFormat(m.locale).format(d.mileage)} ${us ? "miles" : "km"}`,
    `Condition: ${labelOf(CONDITIONS, d.condition)} · Accident: ${labelOf(ACCIDENT, d.accident)} · ` +
      `Warning lights: ${labelOf(LIGHTS, d.warningLights)} · Keys: ${labelOf(KEYS, d.keys)}`,
    `${us ? "Title" : "Papers"}: ${labelOf(titleChoices(d.market), d.title)}`,
    `Wants to: ${labelOf(WANTS, d.wants)}${price}`,
    location ? `Car is in: ${location}` : null,
    `Reply by: ${labelOf(replyChoices(d.market), d.replyBy)}`,
    notes ? `Notes: ${notes}` : null,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

/** Where every field the server can name lives. Insertion order = page order. */
export const FIELD_STEP: Record<string, Step> = {
  vin: 1, found: 1, confirm: 1, year: 1, make: 1, model: 1, trim: 1, mileage: 1, location: 1,
  condition: 2, accident: 2, warningLights: 2, title: 2, keys: 2,
  wants: 3, price: 3, notes: 3,
  name: 4, phone: 4, email: 4, replyBy: 4,
};

/** Read by the server, never typed by the owner. */
export const NO_STEP: readonly string[] = ["marketCode", "leave_empty", "elapsedMs", "landingPath"];

/**
 * How the car is being given, in the US: by VIN ("vin" while typing it,
 * "confirm" while asking "Is this your car?", "found" once it is), or typed
 * in ("manual", which is the only way in Nigeria).
 */
export type CarMode = "vin" | "confirm" | "found" | "manual";

/** What the step checks read: the form's fields as text, and where the car step is. */
export interface Snapshot {
  market: MarketCode;
  maxYear: number;
  mode: CarMode;
  vinText: string;
  year: string;
  make: string;
  model: string;
  mileage: string;
  location: string;
  condition: string;
  accident: string;
  warningLights: string;
  title: string;
  keys: string;
  wants: string;
  price: string;
  notes: string;
  name: string;
  phone: string;
  email: string;
  replyBy: string;
}

export interface Problem {
  field: string;
  message: string;
}

/** The first thing to fix on a step, in page order; null when the step is done. */
export function stepProblem(step: Step, s: Snapshot): Problem | null {
  const m = sellMessages(s.market);
  if (step === 1) {
    if (s.mode === "vin") return { field: "vin", message: s.vinText.trim() ? m.vinLookUp : m.vinMissing };
    if (s.mode === "confirm") return { field: "confirm", message: m.confirm };
    // A car found by its VIN has its year from NHTSA: a problem with it is
    // shown beside the car, since there is no year box to fix.
    const yp = yearProblem(s.year, s.maxYear, m);
    if (yp) return { field: s.mode === "found" ? "found" : "year", message: yp };
    const make = oneLine(s.make);
    if (!make) return { field: "make", message: m.make };
    if (make.length > MAX_MAKE) return { field: "make", message: m.makeLong };
    const model = oneLine(s.model);
    if (!model) return { field: "model", message: m.model };
    if (model.length > MAX_MODEL) return { field: "model", message: m.modelLong };
    const mp = mileageProblem(s.mileage, m);
    if (mp) return { field: "mileage", message: mp };
    if (oneLine(s.location).length > MAX_LOCATION) return { field: "location", message: m.location };
    return null;
  }
  if (step === 2) {
    const groups: [keyof Snapshot & keyof SellMessages, readonly Choice[]][] = [
      ["condition", CONDITIONS],
      ["accident", ACCIDENT],
      ["warningLights", LIGHTS],
      ["title", titleChoices(s.market)],
      ["keys", KEYS],
    ];
    for (const [field, choices] of groups) {
      if (!isChoice(choices, s[field] as string)) return { field, message: m[field] };
    }
    return null;
  }
  if (step === 3) {
    if (!isChoice(WANTS, s.wants)) return { field: "wants", message: m.wants };
    const pp = priceProblem(s.price, m);
    if (pp) return { field: "price", message: pp };
    if (tidyNotes(s.notes).length > MAX_NOTES) return { field: "notes", message: m.notes };
    return null;
  }
  const name = oneLine(s.name);
  if (name.length < 2) return { field: "name", message: m.name };
  if (name.length > MAX_NAME) return { field: "name", message: m.nameLong };
  const phone = s.phone.trim();
  if (!phone) return { field: "phone", message: m.phone };
  if (phone.length > MAX_PHONE) return { field: "phone", message: m.phoneLong };
  if (digitCount(phone) < 10) return { field: "phone", message: m.phoneShort };
  const email = s.email.trim();
  if (!email && s.replyBy === "email") return { field: "email", message: m.emailNeeded };
  if (email && !EMAIL_RE.test(email)) return { field: "email", message: m.email };
  if (!isChoice(replyChoices(s.market), s.replyBy)) return { field: "replyBy", message: m.replyBy };
  return null;
}

/** Earliest step holding a field the server named, and that field. */
export function routeForResult(
  fieldErrors: Record<string, string[] | undefined>,
): { step: Step; field: string } | null {
  for (const field of Object.keys(FIELD_STEP)) {
    if (fieldErrors[field]?.[0]) return { step: FIELD_STEP[field], field };
  }
  return null;
}

/** What the confirmation promises, by the way the owner asked us to reply. */
export function replyPromise(replyBy: string): string {
  const how =
    replyBy === "sms"
      ? "text you"
      : replyBy === "whatsapp"
        ? "message you on WhatsApp"
        : replyBy === "email"
          ? "email you"
          : "call you";
  return `Adedayo or someone from the team will ${how} within one business day.`;
}

/** The line above Send, in the same terms. */
export function photosLine(replyBy: string): string {
  return replyBy === "sms"
    ? "We'll ask for a few photos when we text you."
    : replyBy === "whatsapp"
      ? "We'll ask for a few photos on WhatsApp."
      : replyBy === "email"
        ? "We'll ask for a few photos when we email you."
        : "We'll ask for a few photos when we call.";
}
