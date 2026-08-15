/**
 * Parsing Postgres range literals.
 *
 * `tstzrange` comes back from the driver as text, and two call sites were
 * splitting it with a regular expression written against the shape in a
 * comment rather than the shape Postgres emits:
 *
 *     assumed:  [2026-09-01 00:00+00,2026-09-08 00:00+00)
 *     actual:   ["2026-08-11 00:00:00+00","2026-08-15 00:00:00+00")
 *
 * Postgres quotes any bound containing a comma, a quote, a backslash, a
 * bracket or whitespace — and a timestamp always contains a space, so these
 * bounds are always quoted. The quotes were being fed to `new Date`, which
 * tolerates them only because V8's legacy date parser is permissive. That
 * leniency is implementation-defined: on a stricter engine the same string is
 * an Invalid Date, and `Intl.DateTimeFormat.format` throws a RangeError on an
 * Invalid Date rather than returning a placeholder — taking down the whole
 * page for the sake of one line of text.
 *
 * The offsets need the same care. Postgres writes `+00`, which ISO 8601 does
 * not allow; it must be `+00:00` or `Z`.
 */

export interface DateRange {
  start: Date;
  end: Date;
  /** `[` rather than `(`. Bookings use `[start, end)`. */
  startInclusive: boolean;
  endInclusive: boolean;
}

/** Splits on the top-level comma, honouring quoting and backslash escapes. */
function splitBounds(body: string): [string, string] | null {
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quoted) {
      if (c === "\\") i++;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      return [body.slice(0, i), body.slice(i + 1)];
    }
  }
  return null;
}

function unquote(bound: string): string {
  const t = bound.trim();
  if (!t.startsWith('"')) return t;
  let out = "";
  for (let i = 1; i < t.length; i++) {
    const c = t[i];
    if (c === "\\") {
      out += t[++i] ?? "";
    } else if (c === '"') {
      break;
    } else {
      out += c;
    }
  }
  return out;
}

/**
 * Postgres timestamp text into something every engine parses identically:
 * `2026-08-11 00:00:00+00` -> `2026-08-11T00:00:00+00:00`.
 */
function toDate(bound: string): Date | null {
  if (!bound) return null;
  const iso = bound
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Returns null for anything unparseable, so callers can fall back to raw text. */
export function parseTstzRange(raw: string): DateRange | null {
  const t = raw?.trim();
  if (!t || t.length < 3) return null;

  const open = t[0];
  const close = t[t.length - 1];
  if ((open !== "[" && open !== "(") || (close !== "]" && close !== ")")) return null;

  const parts = splitBounds(t.slice(1, -1));
  if (!parts) return null;

  const start = toDate(unquote(parts[0]));
  const end = toDate(unquote(parts[1]));
  // An unbounded range has an empty bound. Nothing here creates one, but a
  // half-parsed range must not be presented as if it were complete.
  if (!start || !end) return null;

  return {
    start,
    end,
    startInclusive: open === "[",
    endInclusive: close === "]",
  };
}

/**
 * A range as a line of text. Falls back to the raw literal rather than
 * throwing: an odd-looking date is a cosmetic problem, a blank screen is not.
 */
export function formatRange(raw: string, locale: string, separator = "→"): string {
  const range = parseTstzRange(raw);
  if (!range) return raw;
  const f = new Intl.DateTimeFormat(locale || "en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  return `${f.format(range.start)} ${separator} ${f.format(range.end)}`;
}
