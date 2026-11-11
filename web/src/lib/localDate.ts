/**
 * Calendar days where the business is, not in UTC.
 *
 * Rental dates are calendar days ("2026-11-12") and are stored as UTC
 * midnights, which is fine for comparing one booking's days with another's.
 * It is wrong for anything that needs a clock time: in Greensboro, UTC
 * midnight of the 12th is 7 PM on the 11th. Holds used that instant as the
 * moment the rental started, so a next-day pickup booked in the evening was
 * not held at all and a same-day pickup never was; "today" also turned into
 * tomorrow at 7 PM. These answer in the market's own time zone instead.
 *
 * Pure and shared by the server and the booking form.
 */

/** Local time minus UTC, in milliseconds, at a given instant (negative west of UTC). */
function zoneOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return local - Math.floor(at.getTime() / 1000) * 1000;
}

/** Today's date where the business is: "2026-11-11". */
export function todayIn(timeZone: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * The instant a calendar day ends where the business is: local midnight at
 * the start of the next day. "2026-11-12" in New York ends at
 * 2026-11-13T05:00Z (EST); in July it ends at 04:00Z (EDT).
 */
export function endOfLocalDay(isoDate: string, timeZone: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const nextMidnightAsIfUtc = Date.UTC(y, m - 1, d + 1);
  // The offset depends on the instant, and the instant on the offset; a
  // second pass settles it on the days the clocks change.
  let t = nextMidnightAsIfUtc - zoneOffsetMs(timeZone, new Date(nextMidnightAsIfUtc));
  t = nextMidnightAsIfUtc - zoneOffsetMs(timeZone, new Date(t));
  return new Date(t);
}
