#!/usr/bin/env node
/**
 * Which commissions a payout settles.
 *
 * This is the arithmetic that decides whose money is accounted for. Getting it
 * wrong in one direction leaves a partner able to request the same commission
 * twice; in the other it quietly swallows earnings they were never paid for.
 * Neither failure announces itself — the figures simply stop agreeing — so it
 * is checked here rather than trusted.
 *
 * Run: npm run test:payout
 */

import { chooseSettled } from "../src/lib/payoutAllocation";

let passed = 0;
let failed = 0;

function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m  expected ${b}, got ${a}`);
  }
}

const e = (id: string, amountMinor: number) => ({ id, amountMinor });

console.log("\nPayout allocation");

eq("nothing confirmed settles nothing", chooseSettled([], 5000), []);

eq(
  "an exact match settles the one commission",
  chooseSettled([e("a", 900)], 900),
  ["a"],
);

eq(
  "a payout covering everything settles everything",
  chooseSettled([e("a", 900), e("b", 1500), e("c", 600)], 3000),
  ["a", "b", "c"],
);

eq(
  "oldest first — a part payment settles the earliest it covers",
  chooseSettled([e("a", 900), e("b", 1500), e("c", 600)], 2400),
  ["a", "b"],
);

eq(
  "a commission larger than the money left is skipped, not split",
  chooseSettled([e("a", 5000), e("b", 900)], 1000),
  ["b"],
);

eq(
  "one large commission does not block the smaller ones behind it",
  chooseSettled([e("big", 50_000), e("a", 400), e("b", 500)], 900),
  ["a", "b"],
);

eq("a payout of nothing settles nothing", chooseSettled([e("a", 900)], 0), []);

eq(
  "a zero-value commission is never attached to a payout",
  chooseSettled([e("zero", 0), e("a", 900)], 900),
  ["a"],
);

/*
 * The property that matters: whatever is settled must never add up to more
 * than the money actually sent. Everything else is presentation; this is the
 * line between a reconciled ledger and paying somebody twice.
 */
let overAllocated = 0;
for (let run = 0; run < 2000; run++) {
  const n = 1 + Math.floor(Math.random() * 8);
  const rows = Array.from({ length: n }, (_, i) =>
    e(`e${i}`, Math.floor(Math.random() * 5000)),
  );
  const payout = Math.floor(Math.random() * 20_000);
  const chosen = new Set(chooseSettled(rows, payout));
  const total = rows
    .filter((r) => chosen.has(r.id))
    .reduce((s, r) => s + r.amountMinor, 0);
  if (total > payout) overAllocated++;
}
eq("2,000 random payouts never settle more than was sent", overAllocated, 0);

console.log(
  `\n${passed} passed, ${failed} failed.` +
    (failed
      ? "  \x1b[31mALLOCATION NOT VERIFIED\x1b[0m\n"
      : "  \x1b[32mAllocation verified.\x1b[0m\n"),
);
process.exit(failed ? 1 : 0);
