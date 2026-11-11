import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * What one person's phone number has in common however they type it.
 *
 * Bookings store the number exactly as entered, so "+1 (336) 555-0100",
 * "336-555-0100" and "3365550100" are three different strings for one phone.
 * Compared as typed, the same person could slip past the two-reservation
 * limit, and a retry of their own booking would not be recognized as theirs.
 *
 * The last ten digits drop a US "1" country code and a Nigerian "234" or
 * leading "0" alike (234 801 234 5678, 0801 234 5678 and 801 234 5678 all end
 * 8012345678). Fewer than seven digits is not a usable number, so it matches
 * nothing rather than everything.
 */
export function phoneDigitsKey(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : null;
}

/** The same key computed by Postgres from a stored phone column. */
export function phoneKeySql(column: AnyColumn): SQL {
  return sql`right(regexp_replace(${column}, '\\D', '', 'g'), 10)`;
}
