import { formatMoney, money, type CurrencyCode } from "@/lib/money";
import type { ExtendChoice, ExtendStatus } from "@/components/ExtendCard";
import type { ExtensionView } from "./store";

/**
 * Turns the priced view into the words and figures the card shows.
 *
 * Done on the server so the browser is handed finished text: it never formats
 * money, never does date arithmetic, and so can't disagree with the server
 * about either.
 */

/** A calendar day stored as "YYYY-MM-DD": "Fri, Nov 27". */
export function dayLabel(isoDate: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

const BLOCK_TEXT: Record<string, string> = {
  "booked-next": "Someone else has this car right after you. Call us and we will find you another one.",
  longest: "This rental is already at its longest. Call us to talk about more time.",
  "no-rate": "Call us to keep this vehicle longer.",
  "too-many": "You have asked a few times already. Call us and we will sort it out.",
};

export function extendCardProps(
  view: ExtensionView,
  q: { currency: CurrencyCode; locale: string },
): {
  choices: ExtendChoice[];
  latest: ExtendStatus | null;
  canAsk: boolean;
  blockText: string | null;
  bookedFromLabel: string | null;
} {
  const fmt = (minor: number) => formatMoney(money(minor, q.currency), q.locale);
  return {
    choices: view.options.map((o) => ({
      days: o.addedDays,
      newEnd: o.newEnd,
      newEndLabel: dayLabel(o.newEnd, q.locale),
      added: o.addedMinor > 0 ? fmt(o.addedMinor) : null,
      newTotal: fmt(o.newTotalMinor),
      // Only worth a line when the extra days do cost something.
      saving: o.savingMinor > 0 && o.addedMinor > 0 ? fmt(o.savingMinor) : null,
    })),
    latest: view.latest
      ? {
          status: view.latest.status,
          newEndLabel: dayLabel(view.latest.newEnd, q.locale),
          added: view.latest.addedMinor > 0 ? fmt(view.latest.addedMinor) : null,
        }
      : null,
    canAsk: view.canAsk,
    blockText:
      view.block && view.block !== "status"
        ? (view.blockMessage ?? BLOCK_TEXT[view.block] ?? null)
        : null,
    // Said only when that booking is what limits the choice.
    bookedFromLabel:
      view.canAsk &&
      view.bookedFrom &&
      view.bookedFrom === view.options[view.options.length - 1]?.newEnd
        ? dayLabel(view.bookedFrom, q.locale)
        : null,
  };
}
