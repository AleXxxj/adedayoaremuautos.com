#!/usr/bin/env node
/**
 * Deal arithmetic assertions.
 *
 * This runs on every build. The numbers here end up on a contract a customer
 * signs, so "looks about right" is not a standard — each case below is worked
 * by hand in the comment and compared exactly.
 *
 * Run: npm run test:deal
 */


// Run via tsx, which resolves extensionless TS imports the same way Next does.
import { computeDeal } from "../src/lib/deal";

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

const USD = "USD";
const NGN = "NGN";

// ── 1. Cash deal, no tax, no fees ──────────────────────────────────────────
console.log("\nPlain cash deal");
{
  const d = computeDeal({ currency: USD, vehiclePriceMinor: 2_850_000 });
  eq("out the door = price", d.outTheDoor, 2_850_000);
  eq("tax = 0", d.tax, 0);
  eq("amount financed = full price", d.amountFinanced, 2_850_000);
  eq("no payment without financing", d.monthlyPayment, null);
}

// ── 2. NC highway use tax, 3% ──────────────────────────────────────────────
// $28,500.00 * 3% = $855.00 -> out the door $29,355.00
console.log("\nSales tax at 3% (NC highway use)");
{
  const d = computeDeal({
    currency: USD,
    vehiclePriceMinor: 2_850_000,
    taxRateBps: 300,
  });
  eq("tax", d.tax, 85_500);
  eq("out the door", d.outTheDoor, 2_935_500);
}

// ── 3. Trade-in reduces the taxable base ───────────────────────────────────
// Taxable = 28,500 - 8,000 = 20,500 -> tax 3% = $615.00
// Out the door = 28,500 + 615 = 29,115
console.log("\nTrade-in tax credit");
{
  const d = computeDeal({
    currency: USD,
    vehiclePriceMinor: 2_850_000,
    tradeInAllowanceMinor: 800_000,
    taxRateBps: 300,
    tradeReducesTaxableBase: true,
  });
  eq("taxable base", d.taxableBase, 2_050_000);
  eq("tax", d.tax, 61_500);
  eq("out the door", d.outTheDoor, 2_911_500);
  eq("net trade equity", d.netTradeEquity, 800_000);
  eq("financed = OTD - trade", d.amountFinanced, 2_111_500);
}

// Without the credit the customer pays tax on the full price — $240 more.
{
  const d = computeDeal({
    currency: USD,
    vehiclePriceMinor: 2_850_000,
    tradeInAllowanceMinor: 800_000,
    taxRateBps: 300,
    tradeReducesTaxableBase: false,
  });
  eq("tax without credit", d.tax, 85_500);
  eq("difference to customer", 85_500 - 61_500, 24_000);
}

// ── 4. Trade worth more than the car ───────────────────────────────────────
console.log("\nTrade larger than the sale price");
{
  const d = computeDeal({
    currency: USD,
    vehiclePriceMinor: 1_000_000,
    tradeInAllowanceMinor: 1_500_000,
    taxRateBps: 300,
    tradeReducesTaxableBase: true,
  });
  eq("taxable base floors at zero", d.taxableBase, 0);
  eq("tax", d.tax, 0);
  eq("amount financed floors at zero", d.amountFinanced, 0);
}

// ── 5. Negative equity ─────────────────────────────────────────────────────
// Allowance 8,000, still owes 11,000 -> net -3,000, rolled into the loan.
console.log("\nNegative equity (upside down trade)");
{
  const d = computeDeal({
    currency: USD,
    vehiclePriceMinor: 2_850_000,
    tradeInAllowanceMinor: 800_000,
    tradeInPayoffMinor: 1_100_000,
    downPaymentMinor: 200_000,
  });
  eq("net trade equity is negative", d.netTradeEquity, -300_000);
  eq("flagged", d.hasNegativeEquity, true);
  // 28,500 - 2,000 down - (-3,000) = 29,500
  eq("negative equity increases the loan", d.amountFinanced, 2_950_000);
}

// ── 6. Taxable vs non-taxable fees ─────────────────────────────────────────
// Doc fee $599 taxable, title $110 not. Taxable base = 28,500 + 599 = 29,099
// tax 3% = 872.97 -> rounds to 87297 cents
console.log("\nMixed taxable and non-taxable fees");
{
  const d = computeDeal({
    currency: USD,
    vehiclePriceMinor: 2_850_000,
    taxRateBps: 300,
    fees: [
      { label: "Doc fee", amountMinor: 59_900, taxable: true },
      { label: "Title & registration", amountMinor: 11_000, taxable: false },
    ],
  });
  eq("fees total", d.feesTotal, 70_900);
  eq("taxable fees only", d.taxableFees, 59_900);
  eq("taxable base", d.taxableBase, 2_909_900);
  eq("tax rounds to the cent", d.tax, 87_297);
  eq("out the door", d.outTheDoor, 3_008_197);
}

// ── 7. Financing ───────────────────────────────────────────────────────────
// $20,000 at 7.9% for 60 months. i = 0.079/12; P = L*i/(1-(1+i)^-n) = $404.57
console.log("\nAmortisation");
{
  const d = computeDeal({
    currency: USD,
    vehiclePriceMinor: 2_000_000,
    isFinanced: true,
    aprBps: 790,
    termMonths: 60,
  });
  eq("monthly payment", d.monthlyPayment, 40_457);
  eq("total of payments", d.totalOfPayments, 40_457 * 60);
  eq("finance charge", d.financeCharge, 40_457 * 60 - 2_000_000);
}

// Zero-interest instalment plan, common in the Nigerian market.
{
  const d = computeDeal({
    currency: NGN,
    vehiclePriceMinor: 1_200_000_000, // ₦12,000,000
    isFinanced: true,
    aprBps: 0,
    termMonths: 12,
  });
  eq("interest-free monthly", d.monthlyPayment, 100_000_000);
  eq("no finance charge", d.financeCharge, 0);
}

// ── 8. Naira scale ─────────────────────────────────────────────────────────
// ₦25,000,000 = 2,500,000,000 kobo. Well past int4; must survive exactly.
console.log("\nNaira magnitude");
{
  const d = computeDeal({
    currency: NGN,
    vehiclePriceMinor: 2_500_000_000,
    downPaymentMinor: 500_000_000,
    isFinanced: true,
    aprBps: 0,
    termMonths: 24,
  });
  eq("out the door exact", d.outTheDoor, 2_500_000_000);
  eq("financed exact", d.amountFinanced, 2_000_000_000);
  eq("monthly exact", d.monthlyPayment, 83_333_333);
  eq("no float drift", d.amountFinanced.minor % 1, 0);
}

console.log(
  `\n${passed} passed, ${failed} failed.` +
    (failed ? "  \x1b[31mDEAL MATH WRONG\x1b[0m\n" : "  \x1b[32mDeal math verified.\x1b[0m\n"),
);
process.exit(failed ? 1 : 0);
