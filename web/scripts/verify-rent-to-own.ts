/**
 * Verification for the rent-to-own maths.
 *
 * The "total to own" figure is a disclosure a US rental-purchase agreement is
 * required to state correctly, so it gets checked against brute force rather
 * than trusted.
 */
import { pathToOwnership, ownershipProgress, tariffFor, type OwnershipTier } from "../src/lib/rentToOwn";
import { quoteRental } from "../src/lib/rental";

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail = "") {
  checks++;
  if (!cond) {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const economy: OwnershipTier = {
  slug: "economy",
  name: "Economy",
  tagline: null,
  dailyMinor: 4_000,          // $40.00
  weeklyMinor: 25_000,        // $250.00
  monthlyMinor: null,
  ownershipThresholdMinor: 500_000, // $5,000.00
  depositMinor: 0,
  currency: "USD",
};

/* ── The stated offer ──────────────────────────────────────────────────── */
const path = pathToOwnership(economy)!;
check("economy reaches ownership", path !== null);
// $250/week is the cheaper route: 20 weeks × $250 = exactly $5,000 = 140 days.
check("economy: 140 days", path.days === 140, `got ${path.days}`);
check("economy: total is exactly the threshold", path.totalPaid.minor === 500_000,
  `got ${path.totalPaid.minor}`);
check("economy: no overshoot", path.overshoot.minor === 0, `got ${path.overshoot.minor}`);

/* ── Brute force: the binary search must agree with counting ───────────── */
const tariff = tariffFor(economy);
let brute = 0;
for (let d = 1; d <= 5000; d++) {
  if (quoteRental(tariff, d).hireMinor >= 500_000) { brute = d; break; }
}
check("binary search matches brute force", brute === path.days, `brute ${brute} vs ${path.days}`);

/* ── The day before must be short of the threshold ─────────────────────── */
const dayBefore = quoteRental(tariff, path.days - 1).hireMinor;
check("day before is under threshold", dayBefore < 500_000, `got ${dayBefore}`);

/* ── Cost must never decrease as days increase ─────────────────────────── */
let monotonic = true;
let prev = 0;
for (let d = 1; d <= 400; d++) {
  const c = quoteRental(tariff, d).hireMinor;
  if (c < prev) { monotonic = false; break; }
  prev = c;
}
check("cost is non-decreasing in days", monotonic);

/* ── Randomised tiers: the invariant holds for any sane pricing ────────── */
let rngFails = 0;
for (let i = 0; i < 400; i++) {
  const daily = 1_000 + Math.floor(Math.random() * 50_000);
  // Weekly must not exceed seven days, matching the database constraint.
  const weekly = Math.floor(daily * (4 + Math.random() * 3));
  const threshold = 100_000 + Math.floor(Math.random() * 5_000_000);
  const t: OwnershipTier = { ...economy, dailyMinor: daily, weeklyMinor: weekly, ownershipThresholdMinor: threshold };
  const p = pathToOwnership(t);
  if (!p) { rngFails++; continue; }
  const at = quoteRental(tariffFor(t), p.days).hireMinor;
  const before = p.days > 1 ? quoteRental(tariffFor(t), p.days - 1).hireMinor : 0;
  if (at < threshold || before >= threshold) rngFails++;
}
check("400 random tiers land on the exact crossing day", rngFails === 0, `${rngFails} wrong`);

/* ── Progress never claims ownership early ─────────────────────────────── */
const justShort = ownershipProgress(499_999, economy)!;
check("1 cent short is not owned", justShort.owned === false);
check("1 cent short does not display 100%", justShort.percent < 100, `got ${justShort.percent}`);
check("1 cent short shows 1 cent remaining", justShort.remaining.minor === 1);

const exact = ownershipProgress(500_000, economy)!;
check("exactly at threshold is owned", exact.owned === true);
check("exactly at threshold shows nothing remaining", exact.remaining.minor === 0);

const over = ownershipProgress(600_000, economy)!;
check("over threshold is owned", over.owned === true);
check("over threshold clamps to 100%", over.percent === 100);
check("over threshold never shows negative remaining", over.remaining.minor === 0);

/* ── Hire-only tiers have no path ──────────────────────────────────────── */
check("no threshold means no ownership path",
  pathToOwnership({ ...economy, ownershipThresholdMinor: null }) === null);
check("no threshold means no progress",
  ownershipProgress(100_000, { ...economy, ownershipThresholdMinor: null }) === null);

console.log(`\nrent-to-own: ${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
