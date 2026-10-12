/**
 * Recognising which database constraint refused a write.
 *
 * Every constraint in this system exists to stop a specific bad outcome, and
 * most of them have a sentence written for the person who hit it: "those
 * dates have just been taken", "that code is already in use". Turning the
 * violation into that sentence means identifying which constraint fired.
 *
 * The obvious way — `e.message.includes("rental_bookings_no_overlap")` — was
 * used throughout and is wrong. Drizzle wraps the driver's error:
 *
 *   Error: Failed query: insert into "rental_bookings" (...)   ← e.message
 *     [cause]: PostgresError: conflicting key value violates
 *              exclusion constraint "rental_bookings_no_overlap"
 *              constraint_name: 'rental_bookings_no_overlap'    ← e.cause
 *
 * The name is never in `e.message`, so every one of those checks silently
 * failed and fell through to a generic apology. Two of them were worse than
 * cosmetic: a customer hitting a booked week was told "something went wrong,
 * please call us" rather than to pick other dates, and the deal-number
 * generator stopped retrying on the collision it exists to retry.
 *
 * So the chain is walked instead, and `constraint_name` is preferred over
 * text — postgres.js sets it as a field, which is exact, where matching
 * prose is a guess that breaks when Postgres rewords a message.
 */

/** Postgres error fields that survive onto the driver's error object. */
interface PgErrorish {
  constraint_name?: unknown;
  message?: unknown;
  cause?: unknown;
}

/** The constraint a write violated, if the error says. */
export function constraintName(error: unknown): string | null {
  // Bounded rather than `while (true)`: a cyclic cause would otherwise hang
  // the request, and no real error nests more than two or three deep.
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    const e = current as PgErrorish;
    if (typeof e.constraint_name === "string" && e.constraint_name) {
      return e.constraint_name;
    }
    current = e.cause;
  }
  return null;
}

/**
 * Whether this error is the named constraint refusing the write.
 *
 * Falls back to searching the message text of every error in the chain, for
 * the cases where the driver did not set the field — a check constraint
 * raised inside a function, for instance, or PGlite in the test suite.
 */
export function violates(error: unknown, constraint: string): boolean {
  if (constraintName(error) === constraint) return true;

  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    const e = current as PgErrorish;
    if (typeof e.message === "string" && e.message.includes(constraint)) {
      return true;
    }
    current = e.cause;
  }
  return false;
}

/** Whether the error is any one of several constraints. */
export function violatesAny(error: unknown, constraints: string[]): boolean {
  return constraints.some((c) => violates(error, c));
}
