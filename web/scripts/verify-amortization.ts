#!/usr/bin/env node
/**
 * Instalment schedule assertions, including a randomised property test.
 *
 * The headline property: across every schedule, the principal column must sum
 * to exactly the amount financed. A schedule that is a few minor units out
 * leaves a loan that can never be closed cleanly — the customer pays every
 * instalment and the ledger still shows a balance.
 *
 * Run: npm run test:amort
 */

import { generateSchedule, sumField, arrears } from "../src/lib/amortization";
import { money } from "../src/lib/money";

let passed = 0;
let failed = 0;

function eq(label: string, actual: unknown, expected: unknown) {
  const a =
    typeof actual === "object" && actual !== null && "minor" in actual
      ? (actual as { minor: number }).minor
      : actual;
  if (a === expected) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}  = ${a}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m  expected ${expected}, got ${a}`);
  }
}

function ok(label: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m ${detail}`);
  }
}

const START = new Date(Date.UTC(2026, 8, 1)); // 1 Sep 2026

// ── 1. A worked USD example ────────────────────────────────────────────────
console.log("\n$20,000 at 7.9% over 60 months");
{
  const s = generateSchedule(money(2_000_000, "USD"), 790, 60, START);
  eq("regular payment", s.regularPayment, 40_457);
  eq("instalment count", s.instalments.length, 60);
  eq("principal column sums to the loan", sumField(s, "principal"), 2_000_000);
  eq(
    "amount column = principal + interest",
    sumField(s, "amount"),
    2_000_000 + sumField(s, "interest"),
  );
  eq("final balance is exactly zero", s.instalments[59].balanceAfter, 0);
  // First month's interest is the balance times the periodic rate:
  // 2,000,000 * (0.079 / 12) = 13,166.67 -> 13,167 cents.
  eq("first month interest", s.instalments[0].interest, 13_167);
  ok(
    "interest declines every single month",
    s.instalments.every(
      (x, i) => i === 0 || x.interest.minor <= s.instalments[i - 1].interest.minor,
    ),
  );
  ok(
    "principal grows every single month",
    s.instalments.every(
      (x, i) =>
        i === 0 || i === s.instalments.length - 1 ||
        x.principal.minor >= s.instalments[i - 1].principal.minor,
    ),
  );
  ok(
    "last instalment is almost all principal",
    s.instalments[59].interest.minor < s.instalments[59].principal.minor / 20,
  );
  ok(
    "final payment differs slightly (absorbs rounding)",
    s.instalments[59].amount.minor !== s.regularPayment.minor,
    `final ${s.instalments[59].amount.minor} vs regular ${s.regularPayment.minor}`,
  );
}

// ── 2. Zero-interest naira plan ────────────────────────────────────────────
console.log("\n₦12,000,000 interest-free over 18 months");
{
  const s = generateSchedule(money(1_200_000_000, "NGN"), 0, 18, START);
  eq("no interest at all", s.totalInterest, 0);
  eq("principal column foots", sumField(s, "principal"), 1_200_000_000);
  eq("total paid equals the loan", s.totalPaid, 1_200_000_000);
  eq("final balance zero", s.instalments[17].balanceAfter, 0);
}

// ── 3. Awkward division ────────────────────────────────────────────────────
// 100,000 kobo over 7 months does not divide evenly; the remainder must land
// somewhere and must not vanish.
console.log("\nIndivisible amounts");
{
  const s = generateSchedule(money(100_000, "NGN"), 0, 7, START);
  eq("still foots exactly", sumField(s, "principal"), 100_000);
  ok(
    "remainder lands on the final instalment",
    s.instalments[6].amount.minor !== s.instalments[0].amount.minor,
    `${s.instalments[6].amount.minor} vs ${s.instalments[0].amount.minor}`,
  );
}

// ── 4. Due dates ───────────────────────────────────────────────────────────
console.log("\nDue dates");
{
  const s = generateSchedule(money(120_000, "USD"), 0, 12, new Date(Date.UTC(2026, 0, 31)));
  eq("first due date", s.instalments[0].dueDate.toISOString().slice(0, 10), "2026-01-31");
  // 31 Jan + 1 month must clamp to end of February, not spill into March.
  eq("31 Jan + 1 month clamps to Feb", s.instalments[1].dueDate.toISOString().slice(0, 10), "2026-02-28");
  eq("and recovers to 31 in March", s.instalments[2].dueDate.toISOString().slice(0, 10), "2026-03-31");
  eq("twelfth instalment", s.instalments[11].dueDate.toISOString().slice(0, 10), "2026-12-31");
}

// ── 5. Negative amortisation is refused ────────────────────────────────────
console.log("\nRefusals");
{
  let threw = false;
  try {
    // A rate so high the level payment cannot cover the first month's interest.
    generateSchedule(money(1_000_000, "USD"), 9_900, 360, START);
  } catch {
    threw = true;
  }
  ok("refuses a schedule where the balance would grow", threw);

  let threwTerm = false;
  try {
    generateSchedule(money(1_000_000, "USD"), 500, 0, START);
  } catch {
    threwTerm = true;
  }
  ok("refuses a zero term", threwTerm);
}

// ── 6. Property test — this is the important one ───────────────────────────
console.log("\nProperty: principal always foots (400 random schedules)");
{
  let worst = 0;
  let checked = 0;
  let violations = 0;

  // Deterministic pseudo-random so a failure is reproducible.
  let seed = 20260808;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let n = 0; n < 400; n++) {
    const cur = rnd() < 0.5 ? "USD" : "NGN";
    const principalMinor =
      cur === "USD"
        ? Math.floor(rnd() * 9_000_000) + 100_000
        : Math.floor(rnd() * 4_000_000_000) + 10_000_000;
    const aprBps = Math.floor(rnd() * 2_500); // 0% – 25%
    const term = [6, 12, 18, 24, 36, 48, 60, 72][Math.floor(rnd() * 8)];

    const s = generateSchedule(money(principalMinor, cur), aprBps, term, START);
    checked++;

    const diff = Math.abs(sumField(s, "principal") - principalMinor);
    if (diff !== 0) {
      violations++;
      worst = Math.max(worst, diff);
      if (violations <= 3) {
        console.log(
          `      ${cur} ${principalMinor} @ ${aprBps}bps × ${term} → off by ${diff}`,
        );
      }
    }

    const last = s.instalments[s.instalments.length - 1];
    if (last.balanceAfter.minor !== 0) violations++;
  }

  ok(
    `${checked} schedules, principal foots exactly every time`,
    violations === 0,
    `${violations} violations, worst ${worst} minor units`,
  );
}

// ── 7. Arrears ─────────────────────────────────────────────────────────────
console.log("\nArrears");
{
  const asOf = new Date(Date.UTC(2026, 10, 15)); // 15 Nov 2026
  const rows = [
    { dueDate: new Date(Date.UTC(2026, 8, 1)), amountMinor: 40_457, paidMinor: 40_457, state: "paid" },
    { dueDate: new Date(Date.UTC(2026, 9, 1)), amountMinor: 40_457, paidMinor: 10_000, state: "partial" },
    { dueDate: new Date(Date.UTC(2026, 10, 1)), amountMinor: 40_457, paidMinor: 0, state: "due" },
    { dueDate: new Date(Date.UTC(2026, 11, 1)), amountMinor: 40_457, paidMinor: 0, state: "due" },
  ];
  const a = arrears(rows, asOf);
  eq("two instalments overdue", a.overdueCount, 2);
  eq("arrears amount", a.overdueMinor, 40_457 - 10_000 + 40_457);
  eq(
    "oldest arrears date",
    a.oldestDueDate?.toISOString().slice(0, 10),
    "2026-10-01",
  );
  ok("future instalment not counted as arrears", a.overdueCount === 2);
}

console.log(
  `\n${passed} passed, ${failed} failed.` +
    (failed
      ? "  \x1b[31mSCHEDULE MATH WRONG\x1b[0m\n"
      : "  \x1b[32mSchedules verified.\x1b[0m\n"),
);
process.exit(failed ? 1 : 0);
