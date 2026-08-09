#!/usr/bin/env node
/**
 * Rental pricing assertions.
 *
 * The important one is optimality: for a few thousand random tariffs and
 * durations, the tier combination chosen must equal the true cheapest,
 * established by brute force. A pricing engine that is merely "usually right"
 * quietly overcharges customers on the cases it gets wrong.
 *
 * Run: npm run test:rental
 */

import { quoteRental, rentalDays, RentalError, type RentalTariff } from "../src/lib/rental";

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

/** $75/day, $450/week, $1,500/month, $300 deposit. */
const US: RentalTariff = {
  dailyMinor: 7_500,
  weeklyMinor: 45_000,
  monthlyMinor: 150_000,
  depositMinor: 30_000,
  currency: "USD",
  minDays: 1,
  maxDays: 90,
  withDriverAvailable: true,
  driverDailyMinor: 5_000,
};

// ── 1. Straight daily ──────────────────────────────────────────────────────
console.log("\nShort hire");
{
  const q = quoteRental(US, 1);
  eq("one day at the daily rate", q.hireMinor, 7_500);
  eq("one line", q.lines.length, 1);
  eq("deposit quoted separately", q.depositMinor, 30_000);
  eq("total excludes the refundable deposit", q.totalMinor, 7_500);
}
{
  const q = quoteRental(US, 3);
  eq("three days", q.hireMinor, 22_500);
  eq("no saving note", q.savingNote, null);
}

// ── 2. The overcharge trap ─────────────────────────────────────────────────
// With a $400 weekly rate, six days at $75 comes to $450 — so a full week is
// genuinely cheaper than the exact duration. Naive tier-stacking bills six
// daily rates here and quietly overcharges by $50.
console.log("\nA longer tier that is cheaper than the exact days");
{
  const keenWeekly = { ...US, weeklyMinor: 40_000 };
  const q = quoteRental(keenWeekly, 6);
  eq("charged the weekly rate", q.hireMinor, 40_000);
  eq("billed as one week", q.lines[0].tier, "weekly");
  eq("covers 7 days for a 6 day hire", q.chargedDays, 7);
  ok("undercuts six daily rates", q.hireMinor < 6 * US.dailyMinor);
  ok("customer is told why", Boolean(q.savingNote?.includes("weekly")));
}

// On a tie, the shorter tier wins — charging a week for six days at the same
// price would mean billing a day the customer did not ask for.
{
  const q = quoteRental(US, 6);   // 6 x $75 = $450 = the weekly rate exactly
  eq("tie is priced the same", q.hireMinor, 45_000);
  eq("but billed as the exact days", q.lines[0].tier, "daily");
  eq("no overshoot", q.chargedDays, 6);
}

// ── 3. Whole tiers ─────────────────────────────────────────────────────────
console.log("\nWhole tiers");
{
  const q = quoteRental(US, 7);
  eq("a week", q.hireMinor, 45_000);
  eq("single weekly line", q.lines.length, 1);
}
{
  const q = quoteRental(US, 30);
  eq("a month", q.hireMinor, 150_000);
  eq("billed monthly", q.lines[0].tier, "monthly");
}

// ── 4. Mixed durations ─────────────────────────────────────────────────────
console.log("\nMixed durations");
{
  // 45 days = 1 month (30) + 15 days remaining.
  // Options for those 15: 2 weeks covers only 14, so 2 weeks + 1 day = $975;
  // 3 weeks = $1,350; 15 daily = $1,125. Cheapest is 2 weeks + 1 day.
  // Total: $1,500 + $900 + $75 = $2,475.
  const q = quoteRental(US, 45);
  eq("month + two weeks + a day", q.hireMinor, 150_000 + 2 * 45_000 + 7_500);
  eq("three lines", q.lines.length, 3);
  eq("monthly first", q.lines[0].tier, "monthly");
  eq("then weekly", q.lines[1].tier, "weekly");
  eq("then the odd day", q.lines[2].tier, "daily");
  eq("covers exactly 45 days", q.chargedDays, 45);
}

// ── 5. Limits ──────────────────────────────────────────────────────────────
console.log("\nLimits");
{
  const min3 = { ...US, minDays: 3 };
  let threw = false;
  try { quoteRental(min3, 2); } catch (e) { threw = e instanceof RentalError; }
  ok("refuses below the minimum hire", threw);

  threw = false;
  try { quoteRental(US, 91); } catch (e) { threw = e instanceof RentalError; }
  ok("refuses beyond the maximum hire", threw);

  threw = false;
  try { quoteRental(US, 0); } catch (e) { threw = e instanceof RentalError; }
  ok("refuses zero days", threw);
}

// ── 6. Driver ──────────────────────────────────────────────────────────────
console.log("\nChauffeur option");
{
  const q = quoteRental(US, 7, { withDriver: true });
  eq("driver charged per actual day", q.driverMinor, 7 * 5_000);
  eq("subtotal includes the driver", q.subtotalMinor, 45_000 + 35_000);

  const noDriver = { ...US, withDriverAvailable: false };
  let threw = false;
  try { quoteRental(noDriver, 3, { withDriver: true }); } catch (e) { threw = e instanceof RentalError; }
  ok("refuses a driver where none is offered", threw);
}

// ── 7. Missing tiers ───────────────────────────────────────────────────────
console.log("\nTariffs without every tier");
{
  const dailyOnly: RentalTariff = { ...US, weeklyMinor: null, monthlyMinor: null };
  const q = quoteRental(dailyOnly, 10);
  eq("falls back to daily throughout", q.hireMinor, 10 * 7_500);
  eq("one daily line", q.lines[0].tier, "daily");
}

// ── 8. Naira scale ─────────────────────────────────────────────────────────
console.log("\nNaira magnitude");
{
  const NG: RentalTariff = {
    dailyMinor: 4_500_000,      // ₦45,000/day
    weeklyMinor: 27_000_000,    // ₦270,000/week
    monthlyMinor: 90_000_000,   // ₦900,000/month
    depositMinor: 20_000_000,
    currency: "NGN",
    minDays: 1,
    maxDays: null,
    withDriverAvailable: true,
    driverDailyMinor: 1_500_000,
  };
  const q = quoteRental(NG, 30, { withDriver: true });
  eq("monthly rate exact", q.hireMinor, 90_000_000);
  eq("driver for 30 days exact", q.driverMinor, 45_000_000);
  eq("subtotal exact", q.subtotalMinor, 135_000_000);
  ok("all integers", Number.isInteger(q.subtotalMinor));
}

// ── 9. Optimality, by brute force ──────────────────────────────────────────
console.log("\nProperty: chosen price equals the true cheapest (2000 cases)");
{
  let seed = 20260808;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  /** Cheapest cost covering at least `days`, by exhaustive search. */
  function brute(t: RentalTariff, days: number): number {
    let bestCost = Number.POSITIVE_INFINITY;
    const maxM = t.monthlyMinor != null ? Math.ceil(days / 30) : 0;
    for (let m = 0; m <= maxM; m++) {
      const afterM = days - m * 30;
      const maxW = t.weeklyMinor != null ? Math.max(0, Math.ceil(afterM / 7)) : 0;
      for (let w = 0; w <= maxW; w++) {
        const afterW = afterM - w * 7;
        const d = Math.max(0, afterW);
        const cost =
          m * (t.monthlyMinor ?? 0) + w * (t.weeklyMinor ?? 0) + d * t.dailyMinor;
        if (cost < bestCost) bestCost = cost;
      }
    }
    return bestCost;
  }

  let mismatches = 0;
  let overDaily = 0;

  for (let n = 0; n < 2000; n++) {
    const daily = 1000 + Math.floor(rnd() * 200_000);
    const hasWeekly = rnd() > 0.15;
    const hasMonthly = rnd() > 0.25;
    // Discounts anywhere from generous to none at all.
    const weekly = hasWeekly ? Math.round(daily * 7 * (0.5 + rnd() * 0.6)) : null;
    const monthly = hasMonthly ? Math.round(daily * 30 * (0.4 + rnd() * 0.7)) : null;

    const t: RentalTariff = {
      dailyMinor: daily,
      weeklyMinor: weekly,
      monthlyMinor: monthly,
      depositMinor: 0,
      currency: "USD",
      minDays: 1,
      maxDays: null,
      withDriverAvailable: false,
      driverDailyMinor: null,
    };

    const days = 1 + Math.floor(rnd() * 75);
    const q = quoteRental(t, days);
    if (q.hireMinor !== brute(t, days)) mismatches++;
    // A quote must never exceed simply paying the daily rate for every day.
    if (q.hireMinor > days * daily) overDaily++;
  }

  ok("2000 tariffs: matches brute-force optimum", mismatches === 0, `${mismatches} mismatches`);
  ok("never charges more than straight daily", overDaily === 0, `${overDaily} overcharges`);
}

// ── 10. Day counting ───────────────────────────────────────────────────────
console.log("\nDay counting");
{
  const d = (s: string) => new Date(s + "T00:00:00Z");
  eq("Mon to Tue is one day", rentalDays(d("2026-09-01"), d("2026-09-02")), 1);
  eq("a full week", rentalDays(d("2026-09-01"), d("2026-09-08")), 7);
  eq("same day is zero", rentalDays(d("2026-09-01"), d("2026-09-01")), 0);
  eq("reversed is zero", rentalDays(d("2026-09-08"), d("2026-09-01")), 0);
  // Part of a day counts as a day — the car is out.
  eq(
    "part day rounds up",
    rentalDays(new Date("2026-09-01T09:00:00Z"), new Date("2026-09-02T11:00:00Z")),
    2,
  );
}

console.log(
  `\n${passed} passed, ${failed} failed.` +
    (failed ? "  \x1b[31mPRICING WRONG\x1b[0m\n" : "  \x1b[32mRental pricing verified.\x1b[0m\n"),
);
process.exit(failed ? 1 : 0);
