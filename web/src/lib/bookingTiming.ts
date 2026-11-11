import { parseTstzRange } from "@/lib/pgRange";
import { todayIn } from "@/lib/localDate";

/**
 * What the dates say about a booking, separately from what its status says.
 *
 * The status cannot be automated, and it would be a mistake to try. These five
 * states track physical custody of a car — confirmed means a deposit was
 * taken, active means keys were handed over, returned means somebody looked at
 * the vehicle in the yard. A clock cannot know any of that. A booking whose
 * end date passed while the customer still has the car is not "returned"; it
 * is overdue, which is the single most expensive fact in a rental business and
 * exactly what a date-driven status would erase.
 *
 * So the dates drive urgency, not truth. Staff still say what happened; this
 * says what needs attention, and it is the disagreement between the two that
 * is worth surfacing — a car marked active a week after it was due back, or
 * one still merely confirmed on the morning it was meant to go out.
 */
export type Timing =
  | { kind: "overdue"; days: number }
  | { kind: "due-today" }
  | { kind: "out"; daysLeft: number }
  | { kind: "starts-today" }
  | { kind: "not-collected"; days: number }
  | { kind: "upcoming"; days: number }
  | { kind: "done" }
  | { kind: "none" };

/** Whole days from one calendar date ("2026-11-12") to another. */
function dayDiff(a: string, b: string): number {
  const at = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((at(a) - at(b)) / 86_400_000);
}

/**
 * `timeZone` is the booking's market's. The dates are calendar days (stored
 * as UTC midnights), and "today" has to be the business's: counted in UTC,
 * at 8 PM in Greensboro a car going out that day read "Not collected — due
 * out 1 day ago".
 */
export function bookingTiming(
  period: string,
  status: string,
  timeZone: string,
  now: Date = new Date(),
): Timing {
  if (status === "cancelled" || status === "returned") return { kind: "done" };

  const range = parseTstzRange(period);
  if (!range) return { kind: "none" };

  const today = todayIn(timeZone, now);
  const startsIn = dayDiff(range.start.toISOString().slice(0, 10), today);
  const endsIn = dayDiff(range.end.toISOString().slice(0, 10), today);

  if (status === "active") {
    if (endsIn < 0) return { kind: "overdue", days: -endsIn };
    if (endsIn === 0) return { kind: "due-today" };
    return { kind: "out", daysLeft: endsIn };
  }

  // Confirmed or still a quote, and the start has come and gone: either the
  // customer never collected, or somebody forgot to mark it. Both need a call.
  if (startsIn < 0) return { kind: "not-collected", days: -startsIn };
  if (startsIn === 0) return { kind: "starts-today" };
  return { kind: "upcoming", days: startsIn };
}

export interface TimingLabel {
  text: string;
  /** Ordered so the most urgent sorts first. */
  urgency: 0 | 1 | 2 | 3;
}

export function timingLabel(t: Timing): TimingLabel | null {
  switch (t.kind) {
    case "overdue":
      return { text: `Overdue by ${t.days} day${t.days === 1 ? "" : "s"}`, urgency: 0 };
    case "not-collected":
      return {
        text: `Not collected — due out ${t.days} day${t.days === 1 ? "" : "s"} ago`,
        urgency: 0,
      };
    case "due-today":
      return { text: "Due back today", urgency: 1 };
    case "starts-today":
      return { text: "Goes out today", urgency: 1 };
    case "out":
      return { text: `Out — back in ${t.daysLeft} day${t.daysLeft === 1 ? "" : "s"}`, urgency: 2 };
    case "upcoming":
      return { text: `Starts in ${t.days} day${t.days === 1 ? "" : "s"}`, urgency: 3 };
    default:
      return null;
  }
}

/** Lowest first: overdue at the top of the list, finished at the bottom. */
export function urgencyOf(period: string, status: string, timeZone: string, now?: Date): number {
  const label = timingLabel(bookingTiming(period, status, timeZone, now));
  return label ? label.urgency : 4;
}
