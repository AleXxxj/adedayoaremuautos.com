#!/usr/bin/env node
/**
 * Blocks British spellings and terms from reaching the live site.
 *
 * The founder asked that everything written for the site be checked for
 * American English before it goes live, and he was right to: a sweep in
 * October 2026 found 159 lines of customer-facing copy saying "hire",
 * "licence", "collect the vehicle", "programme" and "enquiry". Those read as
 * foreign to a Greensboro customer, and on a rental form they read as
 * careless. This runs in the build, so a regression fails the deploy rather
 * than waiting for someone to notice.
 *
 * Scope is what people read: page and component text, emails, server-action
 * messages, terms and legal pages. Code comments are skipped, and so are
 * identifiers — `licenceFile`, the stored document kind "licence", CSS classes
 * like `booking-licence` — which are internal names, not copy. Blog articles
 * are editorial content and are not checked.
 *
 *   node scripts/check-american-english.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "../..");

const TARGETS = [
  "src/components",
  "src/app",
  "src/lib/mail",
  "src/lib/actions",
  "src/content/rentalTerms.ts",
  "src/content/partnerTerms.ts",
  "src/content/legal.ts",
  "src/content/rentalPolicyUs.ts",
  // Pricing and reservation rules: their errors are shown to renters.
  "src/lib/rental.ts",
  "src/lib/reservation.ts",
];

/** [pattern, the American form] — word-bounded, case-insensitive. */
const RULES = [
  [/\blicences?\b/i, "license"],
  [/\bhire[sd]?\b|\bhiring\b/i, "rent / rental"],
  [/\bprogrammes?\b/i, "program"],
  [/\benquir(e|es|ed|ing|y|ies)\b/i, "inquire / inquiry, or 'ask' / 'contact us'"],
  [/\bcolour\w*/i, "color"],
  [/\borganis(e|es|ed|ing|ation|ations|ational)\b/i, "organize / organization"],
  [/\bauthoris(e|es|ed|ing|ation)\b/i, "authorize"],
  [/\btyres?\b/i, "tire"],
  [/\bcheques?\b/i, "check"],
  [/\bwhilst\b/i, "while"],
  [/\binstalments?\b/i, "installment"],
  // The noun is "pickup"; the verb is "pick up". "Pick-up" is neither.
  [/\bpick-ups?\b/i, "pickup (noun) or pick up (verb)"],
  [/\btravell(ed|ing|er)\b/i, "traveled / traveling"],
  [/\banalys(e|es|ed|ing)\b/i, "analyze"],
  [/\bcollect(ing|ion)? (the|your) (vehicle|car)\b|\bcollection time\b|\bwhen you collect\b/i, "pick up / pickup"],
];

/**
 * Whether this match is an internal name rather than words on the page:
 * part of an identifier, a CSS class, an object key, a property access, a
 * storage path, or a quoted enum value.
 */
function isIdentifier(line, start, end) {
  const before = line[start - 1] ?? " ";
  const after = line[end] ?? " ";
  if (/[\w$.\-/]/.test(before)) return true; // fooLicence, .licence, booking-licence, rto-licence, path/licence
  if (/[\w$\-/(]/.test(after)) return true; // licenceFile, licence-note, licence/2026-10, authorised(
  // hire.licence is a property lookup; "…car hire." is the end of a sentence.
  if (after === "." && /[A-Za-z_$]/.test(line[end + 1] ?? "")) return true;
  if (/\b(const|let|var|function|type|interface)\s+$/.test(line.slice(0, start))) return true;
  // An object or type key — `licence: …` or `licence?: …` — at the start of a
  // line or straight after `{`, `,` or `(`. "Licence: " inside a sentence or
  // a template string is copy, and is still reported.
  if (/^\??\s*:/.test(line.slice(end)) && /(^|[{,(])\s*$/.test(line.slice(0, start))) return true;
  // A lone argument — .from(instalments) — is a name, not a sentence.
  if (before === "(" && after === ")") return true;
  const q = line[start - 1];
  if ((q === '"' || q === "'" || q === "`") && line[end] === q) return true; // "licence" as a value
  return false;
}

function* files(path) {
  const s = statSync(path);
  if (s.isFile()) {
    if (/\.(ts|tsx)$/.test(path)) yield path;
    return;
  }
  for (const name of readdirSync(path)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    yield* files(join(path, name));
  }
}

const problems = [];
for (const target of TARGETS) {
  for (const file of files(join(root, target))) {
    const lines = readFileSync(file, "utf8").split("\n");
    let inBlock = false;
    lines.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith("/*") || t.startsWith("{/*")) inBlock = true;
      if (inBlock) {
        if (t.includes("*/")) inBlock = false;
        return;
      }
      if (t.startsWith("//") || t.startsWith("*")) return;
      if (t.startsWith("import ") || t.includes("console.")) return;
      for (const [rule, american] of RULES) {
        const re = new RegExp(rule.source, "gi");
        let m;
        while ((m = re.exec(line))) {
          if (isIdentifier(line, m.index, m.index + m[0].length)) continue;
          problems.push(`  ${relative(root, file)}:${i + 1}  "${m[0]}" → ${american}\n      ${t.slice(0, 120)}`);
        }
      }
    });
  }
}

if (problems.length) {
  console.log(`\x1b[31m${problems.length} British spelling(s) in site copy:\x1b[0m\n`);
  console.log(problems.join("\n"));
  console.log(
    "\nThe site is written in American English for Greensboro customers. " +
      "If one of these is an internal name rather than words on the page, rename " +
      "the identifier or adjust isIdentifier() in this script.\n",
  );
  process.exit(1);
}
console.log("Site copy is in American English.  \x1b[32mAll good.\x1b[0m");
