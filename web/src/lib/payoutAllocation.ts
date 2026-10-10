/**
 * Which commissions a payout settles.
 *
 * Pure, and in a module of its own with no database import, so the arithmetic
 * that decides whose money is accounted for can be checked without a
 * connection string. Getting it wrong in one direction leaves a partner able
 * to request the same commission twice; in the other it quietly swallows
 * earnings they were never paid for. Neither failure announces itself — the
 * figures simply stop agreeing.
 */

/**
 * Picks the commissions covered by `amountMinor`, oldest first.
 *
 * Partial by design: a payout for less than everything confirmed settles the
 * oldest commissions it covers and leaves the rest available — the same rule
 * the finance ledger uses when allocating a customer's payment across
 * instalments, and the one a partner expects.
 *
 * An earning is never split across two payouts. One larger than the money
 * remaining is skipped rather than half-settled, because half a row is not
 * something anybody can reconcile. Skipped rather than ending the loop, so a
 * single large commission does not block the smaller ones behind it.
 */
export function chooseSettled<T extends { id: string; amountMinor: number }>(
  confirmedOldestFirst: T[],
  amountMinor: number,
): string[] {
  let remaining = amountMinor;
  const settling: string[] = [];
  for (const e of confirmedOldestFirst) {
    if (e.amountMinor <= 0 || e.amountMinor > remaining) continue;
    settling.push(e.id);
    remaining -= e.amountMinor;
    if (remaining <= 0) break;
  }
  return settling;
}
