/**
 * How the guides write numbers: one place, so "$350" and "16 cars" read the
 * same in every guide and in every tool.
 */
import { formatMoney, money } from "@/lib/money";
import type { GuideData } from "./types";

type Fmt = Pick<GuideData, "currency" | "locale">;

/** "$350", "$17.50": cents only when there are some. */
export const cash = (d: Fmt, minor: number) => formatMoney(money(minor, d.currency), d.locale);

/** "$250" when both ends are the same, or "$250 to $1,000". */
export function cashRange(d: Fmt, minors: number[]): string {
  const lo = Math.min(...minors);
  const hi = Math.max(...minors);
  return lo === hi ? cash(d, lo) : `${cash(d, lo)} to ${cash(d, hi)}`;
}

/** "1 car", "11 cars". */
export const carsLabel = (n: number) => `${n} ${n === 1 ? "car" : "cars"}`;

/** "157,500" */
export const count = (d: Pick<GuideData, "locale">, n: number) => new Intl.NumberFormat(d.locale).format(n);

/** "A", "A and B", "A, B and C". */
export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The business, as the guides name it in answers that stand alone in search results. */
export const BUSINESS = "Adedayo Aremu Autos";

/** The two marks guide text may carry: **bold** and [a link](/us/rentals). */
export const MARKS = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** The text as read, with the marks taken out. */
export const plain = (text: string) => text.replace(MARKS, (_m, bold, label) => bold ?? label);
