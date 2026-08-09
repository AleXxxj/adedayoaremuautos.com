#!/usr/bin/env node
/**
 * Payment allocation assertions.
 *
 * The conservation property is the one that matters: every minor unit a
 * customer hands over must be either applied to an instalment or explicitly
 * reported as unapplied. Money must never evaporate in the allocator, and the
 * allocator must never invent money that was not paid.
 *
 * Run: npm run test:ledger
 */

import { allocatePayment, summarise, markLate, type AllocatableInstalment } from "../src/lib/ledger";

let passed = 0;
let failed = 0;

function eq(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}  = ${String(actual)}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m  expected ${String(expected)}, got ${String(actual)}`);
  }
}

function ok(label: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m ${detail}`);
  }
}

const d = (iso: string) => new Date(iso + "T00:00:00Z");
const NOW = d("2026-11-15");

/** Four monthly instalments of 40,457; the first two already overdue. */
function schedule(overrides: Partial<AllocatableInstalment>[] = []): AllocatableInstalment[] {
  const base: AllocatableInstalment[] = [
    { id: "i1", number: 1, dueDate: d("2026-09-01"), amountMinor: 40_457, paidMinor: 0, state: "late" },
    { id: "i2", number: 2, dueDate: d("2026-10-01"), amountMinor: 40_457, paidMinor: 0, state: "late" },
    { id: "i3", number: 3, dueDate: d("2026-11-01"), amountMinor: 40_457, paidMinor: 0, state: "late" },
    { id: "i4", number: 4, dueDate: d("2026-12-01"), amountMinor: 40_457, paidMinor: 0, state: "due" },
  ];
  return base.map((b, i) => ({ ...b, ...(overrides[i] ?? {}) }));
}

// ── 1. Exact instalment ────────────────────────────────────────────────────
console.log("\nExact payment");
{
  const r = allocatePayment(schedule(), 40_457, NOW);
  eq("one instalment touched", r.allocations.length, 1);
  eq("applied to the oldest", r.allocations[0].number, 1);
  eq("marked paid", r.allocations[0].stateAfter, "paid");
  eq("nothing left over", r.unappliedMinor, 0);
  eq("does not settle the agreement", r.settlesAgreement, false);
}

// ── 2. Part payment ────────────────────────────────────────────────────────
console.log("\nPart payment");
{
  const r = allocatePayment(schedule(), 10_000, NOW);
  eq("state is partial", r.allocations[0].stateAfter, "partial");
  eq("paid so far", r.allocations[0].paidAfterMinor, 10_000);
  eq("nothing unapplied", r.unappliedMinor, 0);
}

// ── 3. Spreads oldest-first ────────────────────────────────────────────────
console.log("\nLump sum spreads across instalments, oldest first");
{
  const r = allocatePayment(schedule(), 100_000, NOW);
  eq("touches three instalments", r.allocations.length, 3);
  eq("first cleared", r.allocations[0].stateAfter, "paid");
  eq("second cleared", r.allocations[1].stateAfter, "paid");
  eq("third partial", r.allocations[2].stateAfter, "partial");
  eq("third received the remainder", r.allocations[2].appliedMinor, 100_000 - 80_914);
  eq("order is 1,2,3", r.allocations.map((a) => a.number).join(","), "1,2,3");
}

// ── 4. Resuming a part-paid instalment ─────────────────────────────────────
console.log("\nTops up an instalment already part paid");
{
  const s = schedule([{ paidMinor: 10_000, state: "partial" }]);
  const r = allocatePayment(s, 30_457, NOW);
  eq("only the shortfall is taken", r.allocations[0].appliedMinor, 30_457);
  eq("now fully paid", r.allocations[0].stateAfter, "paid");
  eq("nothing spills over", r.unappliedMinor, 0);
}

// ── 5. Skips settled and written-off rows ──────────────────────────────────
console.log("\nSkips rows that need nothing");
{
  const s = schedule([
    { paidMinor: 40_457, state: "paid" },
    { paidMinor: 0, state: "written_off" },
  ]);
  const r = allocatePayment(s, 40_457, NOW);
  eq("lands on instalment 3", r.allocations[0].number, 3);
  ok("does not touch the paid row", !r.allocations.some((a) => a.number === 1));
  ok("does not touch the written-off row", !r.allocations.some((a) => a.number === 2));
}

// ── 6. Overpayment is reported, not swallowed ──────────────────────────────
console.log("\nOverpayment");
{
  const r = allocatePayment(schedule(), 200_000, NOW);
  eq("all four cleared", r.allocations.filter((a) => a.stateAfter === "paid").length, 4);
  eq("surplus reported", r.unappliedMinor, 200_000 - 4 * 40_457);
  eq("settles the agreement", r.settlesAgreement, true);
}

// ── 7. Refusals ────────────────────────────────────────────────────────────
console.log("\nRefusals");
{
  for (const [label, amount] of [["zero", 0], ["negative", -100], ["fractional", 100.5]] as const) {
    let threw = false;
    try {
      allocatePayment(schedule(), amount as number, NOW);
    } catch {
      threw = true;
    }
    ok(`refuses a ${label} payment`, threw);
  }
}

// ── 8. Conservation — the property that matters ────────────────────────────
console.log("\nProperty: money is conserved (500 random payments)");
{
  let seed = 8081986;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  let violations = 0;
  let overAllocated = 0;

  for (let n = 0; n < 500; n++) {
    const count = 1 + Math.floor(rnd() * 24);
    const amount = 1000 + Math.floor(rnd() * 5_000_000);
    const insts: AllocatableInstalment[] = Array.from({ length: count }, (_, i) => {
      const amountMinor = 1000 + Math.floor(rnd() * 200_000);
      const alreadyPaid = Math.floor(rnd() * amountMinor);
      const state = alreadyPaid === 0 ? "due" : alreadyPaid >= amountMinor ? "paid" : "partial";
      return {
        id: `x${i}`,
        number: i + 1,
        dueDate: d("2026-09-01"),
        amountMinor,
        paidMinor: alreadyPaid,
        state: state as AllocatableInstalment["state"],
      };
    });

    const r = allocatePayment(insts, amount, NOW);
    const applied = r.allocations.reduce((s, a) => s + a.appliedMinor, 0);

    // Every unit paid is either applied or reported unapplied.
    if (applied + r.unappliedMinor !== amount) violations++;

    // No instalment may end up holding more than it is worth — this is what
    // the database CHECK would reject, so the allocator must never produce it.
    for (const a of r.allocations) {
      const inst = insts.find((i) => i.id === a.instalmentId)!;
      if (a.paidAfterMinor > inst.amountMinor) overAllocated++;
    }
  }

  ok("500 payments: applied + unapplied === amount paid", violations === 0, `${violations} violations`);
  ok("no instalment ever over-allocated", overAllocated === 0, `${overAllocated} over-allocations`);
}

// ── 9. Summary ─────────────────────────────────────────────────────────────
console.log("\nLedger summary");
{
  const s = schedule([{ paidMinor: 40_457, state: "paid" }, { paidMinor: 10_000, state: "partial" }]);
  const sum = summarise(s, 150_000, NOW);
  eq("scheduled total", sum.scheduledTotalMinor, 4 * 40_457);
  eq("paid to date", sum.paidMinor, 50_457);
  eq("outstanding", sum.outstandingMinor, 4 * 40_457 - 50_457);
  eq("overdue instalments", sum.overdueCount, 2);
  eq("overdue amount", sum.overdueMinor, 30_457 + 40_457);
  eq("next due date is the future one", sum.nextDueDate?.toISOString().slice(0, 10), "2026-12-01");
  eq("progress percent", sum.progressPercent, Math.round((50_457 / 161_828) * 100));
}

// ── 10. Late marking ───────────────────────────────────────────────────────
console.log("\nLate marking (time passing, not an action)");
{
  const s = schedule([{ state: "due" }, { state: "due" }, { state: "due" }, { state: "due" }]);
  const changes = markLate(s, NOW);
  eq("three overdue rows escalate", changes.filter((c) => c.state === "late").length, 3);
  ok("the future instalment is untouched", !changes.some((c) => c.id === "i4"));
}

console.log(
  `\n${passed} passed, ${failed} failed.` +
    (failed ? "  \x1b[31mALLOCATION WRONG\x1b[0m\n" : "  \x1b[32mAllocation verified.\x1b[0m\n"),
);
process.exit(failed ? 1 : 0);
