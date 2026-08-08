import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { locations } from "@/db/schema";
import type { MarketCode } from "../market";

export interface OpeningHour {
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  day: number;
  open: string;
  close: string;
}

export async function listLocations(market: MarketCode) {
  return db
    .select()
    .from(locations)
    .where(and(eq(locations.marketCode, market), eq(locations.isActive, true)))
    .orderBy(asc(locations.name));
}

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * "6 AM" from "06:00", in the market's locale.
 *
 * timeZone: "UTC" is load-bearing. The date is constructed with Date.UTC, so
 * without it Intl renders in the *server's* local zone and shifts the time —
 * which silently published "7 AM – 7 PM" for a business that opens at 6.
 * Opening hours are a wall-clock label, not an instant, and must not be
 * converted between zones at all.
 */
function formatTime(hhmm: string, locale: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: m ? "2-digit" : undefined,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, 0, 1, h, m)));
}

/**
 * Collapses opening hours into a compact human summary, grouping consecutive
 * days that share the same times: "Mon–Sat 6:00 AM – 6:00 PM".
 */
export function summariseHours(
  hours: OpeningHour[] | null | undefined,
  locale: string,
): string | null {
  if (!hours?.length) return null;

  const sorted = [...hours].sort((a, b) => a.day - b.day);
  const groups: { from: number; to: number; open: string; close: string }[] = [];

  for (const h of sorted) {
    const last = groups.at(-1);
    if (last && last.to === h.day - 1 && last.open === h.open && last.close === h.close) {
      last.to = h.day;
    } else {
      groups.push({ from: h.day, to: h.day, open: h.open, close: h.close });
    }
  }

  return groups
    .map((g) => {
      const days =
        g.from === g.to
          ? DAY_NAMES[g.from]
          : `${DAY_NAMES[g.from]}–${DAY_NAMES[g.to]}`;
      return `${days} ${formatTime(g.open, locale)} – ${formatTime(g.close, locale)}`;
    })
    .join(", ");
}

/** "+13362076521" -> "(336) 207-6521" for US numbers; unchanged otherwise. */
export function formatPhone(raw: string | null): string | null {
  if (!raw) return null;
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(raw);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : raw;
}
