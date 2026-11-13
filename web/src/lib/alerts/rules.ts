/**
 * Price-drop alerts: the rules, with no database and no network.
 *
 * Everything that decides whether a car can be watched, whether a saved
 * change is a drop worth a message, and what that message says. Pure, so
 * scripts/verify-price-alerts.mts can check each rule by itself.
 */

import { formatMoney, money } from "@/lib/money";
import { MARKETS, type MarketCode } from "@/lib/market";

/**
 * The switch. Off unless PRICE_ALERTS_ENABLED is 1 or true: off hides the
 * button, refuses new watchers and sends nothing.
 */
export function priceAlertsEnabled(): boolean {
  const v = (process.env.PRICE_ALERTS_ENABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}

/** Whether alerts by email can be offered at all (a mail key is set). */
export const mailConfigured = (): boolean => Boolean(process.env.RESEND_API_KEY?.trim());

/** How long a sold or unlisted car's watchers are kept before deletion. */
export const ENDED_KEEP_DAYS = 30;
/** How long an email address that never confirmed is kept. */
export const UNCONFIRMED_KEEP_DAYS = 7;
/** Cars one browser may watch. */
export const MAX_PER_BROWSER = 50;
/** Cars one email address may watch. */
export const MAX_PER_EMAIL = 20;
/** Confirmation emails one address may have waiting, unanswered. */
export const MAX_PENDING_PER_EMAIL = 3;
/** Confirmation emails the whole site sends in an hour, as a fuse. */
export const MAX_CONFIRMS_PER_HOUR = 40;
/** A second confirmation email for the same car waits this long. */
export const CONFIRM_RESEND_MINUTES = 30;

export interface WatchableCar {
  status: string;
  listingKind: string;
  priceMinor: number | null;
}

/**
 * Whether a car can be watched: for sale, public, not sold, with a price.
 * A sale that is pending can still fall through, so it can be watched.
 */
export function canWatch(car: WatchableCar): boolean {
  return (
    (car.status === "available" || car.status === "pending") &&
    car.listingKind !== "rental" &&
    car.priceMinor != null &&
    car.priceMinor > 0
  );
}

export interface PriceState {
  status: string;
  priceMinor: number | null;
}

/**
 * Whether a saved change is worth asking the watchers about at all.
 *
 * Only for a car that is on sale now, and only when the price went down or
 * the car just came back on sale (its price may have changed while it was
 * off). A rise, an unchanged price, a draft and a sold car all answer no.
 * Each watcher is then judged by `owedAlert`.
 */
export function isDropWorthChecking(before: PriceState, after: PriceState): boolean {
  if (after.status !== "available") return false;
  if (after.priceMinor == null || after.priceMinor <= 0) return false;
  if (before.status !== "available") return true;
  return before.priceMinor != null && after.priceMinor < before.priceMinor;
}

export interface WatcherPrices {
  priceMinorAtWatch: number;
  lastAlertPriceMinor: number | null;
}

/** The last price this watcher knows: the last alert's, or the one they saw. */
export function knownPrice(w: WatcherPrices): number {
  return w.lastAlertPriceMinor ?? w.priceMinorAtWatch;
}

/**
 * Whether this watcher is owed a message at the new price: only when it is
 * lower than the last price they know. That is what makes it one alert per
 * drop (saving the same price twice sends nothing the second time) and what
 * keeps a rise followed by a smaller cut quiet.
 */
export function owedAlert(w: WatcherPrices, newPriceMinor: number): boolean {
  return newPriceMinor > 0 && newPriceMinor < knownPrice(w);
}

export interface AlertCar {
  marketCode: MarketCode;
  slug: string;
  year: number | null;
  make: string;
  model: string;
  trim: string | null;
}

export function carName(car: AlertCar): string {
  return [car.year, car.make, car.model, car.trim].filter(Boolean).join(" ");
}

/** The car's page, opened at the alert control. Site-relative. */
export function carPath(car: Pick<AlertCar, "marketCode" | "slug">): string {
  return `/${car.marketCode}/inventory/${car.slug}`;
}

export interface DropMessage {
  name: string;
  oldPrice: string;
  newPrice: string;
  /** Site-relative link to the car. */
  path: string;
}

/** The four things every alert says: car, old price, new price, link. */
export function dropMessage(car: AlertCar, oldMinor: number, newMinor: number): DropMessage {
  const cfg = MARKETS[car.marketCode];
  const fmt = (minor: number) => formatMoney(money(minor, cfg.currency), cfg.locale);
  return {
    name: carName(car),
    oldPrice: fmt(oldMinor),
    newPrice: fmt(newMinor),
    path: carPath(car),
  };
}

/** The same message as a browser notification. A tap lands on the car. */
export function dropPush(m: DropMessage, slug: string) {
  return {
    title: "Price drop",
    body: `${m.name}: now ${m.newPrice}, was ${m.oldPrice}`,
    // Lands on the control, where "Stop price alerts" is.
    url: `${m.path}#price-alert`,
    tag: `price-drop-${slug}`,
  };
}

/**
 * The push services browsers use. An endpoint is a URL this server later
 * sends requests to, so it is checked against a list and never taken as
 * given (the same list as /api/push/subscribe).
 */
const PUSH_HOSTS = [
  /\.googleapis\.com$/,
  /\.mozilla\.com$/,
  /\.push\.apple\.com$/,
  /\.windows\.com$/,
  /\.microsoft\.com$/,
];

export function pushEndpointAllowed(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return PUSH_HOSTS.some((re) => re.test(url.hostname));
}
