#!/usr/bin/env node
/**
 * VIN checks, before anything is looked up.
 *
 * A typo must be caught here with a message that says what to fix — NHTSA's
 * decoder answers "success" for nonsense — and a correct VIN must never be
 * refused, however it was typed.
 *
 * Run: npm run test:vin
 */
import { checkVin, expectedCheckDigit, normalizeVin, charValue, VIN_WEIGHTS } from "../src/lib/vin/validate";

let passed = 0;
let failed = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m  expected ${String(expected)}, got ${String(actual)}`);
  }
}

console.log("\nThe federal table (49 CFR 565.15)");
{
  // Copied again here from the regulation, so a slip in either copy shows:
  // a test that only checks a few VINs passes with several letters wrong.
  const TABLE: Record<string, number> = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5,
    P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  };
  const wrong = Object.entries(TABLE).filter(([c, v]) => charValue(c) !== v).map(([c]) => c);
  eq("every letter counts what the regulation says", wrong.join(""), "");
  eq("every digit counts for itself", "0123456789".split("").filter((d) => charValue(d) !== Number(d)).join(""), "");
  eq("the position weights", VIN_WEIGHTS.join(","), "8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2");
  // The worked example from the regulation's commentary and many references.
  eq("a known VIN with check digit X", expectedCheckDigit("1M8GDM9AXKP042788"), "X");
}

console.log("\nWell-formed VINs");
{
  // The textbook example: its 9th character is X, meaning a remainder of 10.
  const a = checkVin("1HGBH41JXMN109186");
  eq("a valid VIN passes", a.wellFormed && a.checkDigitOk, true);
  eq("check digit X is computed as X", expectedCheckDigit("1HGBH41JXMN109186"), "X");

  // All ones: 89 mod 11 = 1, so it is valid by the arithmetic.
  eq("all ones is valid by the arithmetic", checkVin("11111111111111111").checkDigitOk, true);

  const typed = checkVin("  1hgbh41jxm-n109186 ");
  eq("lowercase, spaces and dashes are tidied", typed.vin, "1HGBH41JXMN109186");
  eq("and then pass", typed.wellFormed && typed.checkDigitOk, true);
  eq("normalizing keeps the 17 characters", normalizeVin("1hg bh41 jxmn109186").length, 17);
}

console.log("\nTypos the visitor is told how to fix");
{
  const short = checkVin("1HGBH41JXMN10918");
  eq("16 characters is refused", short.problem, "length");
  eq("and says how many it has", short.message, "A VIN has 17 characters. This one has 16.");

  eq("an empty box asks for the VIN", checkVin("   ").message, "Enter the 17-character VIN.");

  const letterO = checkVin("1HGBH41JXMN1O9186");
  eq("the letter O is refused", letterO.problem, "characters");
  eq("with the 1-and-0 hint", /I, O or Q/.test(letterO.message ?? ""), true);

  eq("punctuation is refused", checkVin("1HGBH41JXMN10918!").problem, "characters");

  const typo = checkVin("1HGBH41JXMN109187");
  eq("one wrong digit fails the check digit", typo.checkDigitOk, false);
  eq("but is still well-formed, so it can go on", typo.wellFormed, true);
  eq("as a warning", typo.problem, "checkDigit");
}

console.log("\nEvery single-character change is noticed");
{
  // Change each position (except the check digit itself) to another legal
  // character and count how often the check digit still agrees. It should
  // catch nearly all of them; a weak implementation catches far fewer.
  const base = "1HGBH41JXMN109186";
  const alphabet = "0123456789ABCDEFGHJKLMNPRSTUVWXYZ";
  let changes = 0;
  let caught = 0;
  for (let i = 0; i < 17; i++) {
    if (i === 8) continue;
    for (const c of alphabet) {
      if (c === base[i]) continue;
      const v = base.slice(0, i) + c + base.slice(i + 1);
      changes++;
      if (!checkVin(v).checkDigitOk) caught++;
    }
  }
  eq(`catches at least 85% of ${changes} one-character typos (caught ${caught})`, caught / changes >= 0.85, true);
}

console.log(
  `\n${passed} passed, ${failed} failed.` +
    (failed ? "  \x1b[31mVIN CHECKS WRONG\x1b[0m\n" : "  \x1b[32mVIN checks verified.\x1b[0m\n"),
);
process.exit(failed ? 1 : 0);
