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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { regexes } from "zod/v4/core";
import { quoteRental, rentalDays, RentalError, type RentalTariff } from "../src/lib/rental";
import {
  reservationExpiry,
  canReserve,
  holdRemaining,
  holdAfterCheckout,
  holdForPickup,
} from "../src/lib/reservation";
import { todayIn, endOfLocalDay } from "../src/lib/localDate";
import { bookingTiming, timingLabel } from "../src/lib/bookingTiming";
import { phoneDigitsKey } from "../src/lib/phoneKey";
import { FIELD_STEP, NO_STEP, MESSAGES, EMAIL_RE, stepProblem, routeForResult, isDatesError, overlapsTaken, addDaysIso, lengthsFor, type Snapshot } from "../src/components/rentalBookingSteps";

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
  injuryCoverDailyMinor: 1_500,
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

// ── The injury cover ──────────────────────────────────────────────────────
//
// The fee has to be in the total the customer is shown and charged. A waiver
// quoted separately, or added at the counter, is the late-fee pattern the FTC
// rule on deceptive fees is aimed squarely at — and the reason the business
// asked for it to be boldly displayed in the first place.
console.log("\nInjury cover");
{
  const plain = quoteRental(US, 7);
  const covered = quoteRental(US, 7, { injuryCover: true });

  eq("no cover unless asked for", plain.injuryCoverMinor, 0);
  eq("seven days at $15", covered.injuryCoverMinor, 10_500);
  eq("the fee is inside the total charged", covered.totalMinor, plain.totalMinor + 10_500);
  eq("the hire itself is unchanged", covered.hireMinor, plain.hireMinor);
  eq("the deposit is unchanged", covered.depositMinor, plain.depositMinor);

  // The overshoot case, which is the one worth pinning down.
  //
  // With a weekly rate that genuinely undercuts six days, the hire is priced
  // as a full week — chargedDays is 7 — while the car is only out for six.
  // The waiver must follow the car, not the invoice: charging cover for the
  // seventh day is billing for a day the vehicle is already back.
  const cheapWeek: RentalTariff = { ...US, weeklyMinor: 40_000 };
  const six = quoteRental(cheapWeek, 6, { injuryCover: true });
  eq("six days priced as a week", six.chargedDays, 7);
  eq("the hire is the weekly rate", six.hireMinor, 40_000);
  eq("but the cover is six days, not seven", six.injuryCoverMinor, 9_000);

  // Both extras at once, each on actual days.
  const both = quoteRental(US, 3, { injuryCover: true, withDriver: true });
  eq("driver and cover together", both.totalMinor, both.hireMinor + 15_000 + 4_500);

  // A vehicle with no fee set must not give the cover away.
  const noFee: RentalTariff = { ...US, injuryCoverDailyMinor: null };
  let refused = false;
  try {
    quoteRental(noFee, 3, { injuryCover: true });
  } catch (e) {
    refused = e instanceof RentalError;
  }
  ok("REFUSES cover where no fee is set", refused);
  eq("and still quotes the hire normally", quoteRental(noFee, 3).totalMinor, 22_500);
}

// ── Reservation holds ──────────────────────────────────────────────────────
//
// A reservation that outlasts the hire it protects blocks the car for a day
// after the booking has already failed to happen; one that is offered on a
// hire starting in twenty minutes promises time the business cannot give.
console.log("\nReservation holds");
{
  const at = (iso: string) => new Date(iso);
  const now = at("2026-10-12T09:00:00Z");

  // Ordinary case: a hire well in the future gets the full window.
  const farOff = at("2026-11-01T09:00:00Z");
  eq(
    "a distant hire is held the full 48 hours",
    reservationExpiry(farOff, now).toISOString(),
    "2026-10-14T09:00:00.000Z",
  );

  // The hold must never outlast the thing it protects.
  const tomorrow = at("2026-10-13T08:00:00Z");
  eq(
    "a hire tomorrow is held only until pickup",
    reservationExpiry(tomorrow, now).toISOString(),
    tomorrow.toISOString(),
  );

  const exactly48 = at("2026-10-14T09:00:00Z");
  eq(
    "a hire exactly 48 hours out is held to pickup, not beyond",
    reservationExpiry(exactly48, now).toISOString(),
    exactly48.toISOString(),
  );

  ok("a hire in three hours can be reserved", canReserve(at("2026-10-12T12:00:00Z"), now));
  ok("a hire in ninety minutes can be reserved", canReserve(at("2026-10-12T10:30:00Z"), now));
  ok("a hire in twenty minutes cannot", !canReserve(at("2026-10-12T09:20:00Z"), now));
  ok("a hire already started cannot", !canReserve(at("2026-10-12T08:00:00Z"), now));

  eq("remaining, two days", holdRemaining(at("2026-10-14T09:00:00Z"), now), "2 days");
  eq("remaining, six hours", holdRemaining(at("2026-10-12T15:00:00Z"), now), "6 hours");
  eq("remaining, one hour", holdRemaining(at("2026-10-12T10:00:00Z"), now), "1 hour");
  eq("remaining, minutes", holdRemaining(at("2026-10-12T09:45:00Z"), now), "45 minutes");
  eq("remaining, gone", holdRemaining(at("2026-10-12T08:00:00Z"), now), "expired");

  // Backing out of the payment page must not cancel the reservation. The
  // checkout stretched the hold to cover itself; when it ends unpaid, the hold
  // goes back to the two days the customer was promised, not to nothing.
  const reservedTo = at("2026-10-14T09:00:00Z");
  eq(
    "an unpaid checkout hands back the reservation",
    holdAfterCheckout(reservedTo, now)?.toISOString() ?? "none",
    reservedTo.toISOString(),
  );
  eq(
    "a reservation that has already run out is not revived",
    holdAfterCheckout(at("2026-10-12T08:59:00Z"), now)?.toISOString() ?? "none",
    "none",
  );
  eq(
    "a reservation ending this very moment is over",
    holdAfterCheckout(now, now)?.toISOString() ?? "none",
    "none",
  );
  eq(
    "a booking that never had a reservation holds nothing",
    holdAfterCheckout(null, now)?.toISOString() ?? "none",
    "none",
  );
}

// ── Phone keys ─────────────────────────────────────────────────────────────
//
// One person, however they type their number. The two-reservation limit and
// the retry check both match on this, so a different spelling of the same
// phone must not count as a different renter.
console.log("\nPhone keys");
{
  const us = "3365550100";
  eq("US, plain", phoneDigitsKey("3365550100"), us);
  eq("US, punctuated", phoneDigitsKey("(336) 555-0100"), us);
  eq("US, with +1", phoneDigitsKey("+1 336 555 0100"), us);
  eq("US, with leading 1", phoneDigitsKey("13365550100"), us);
  const ng = "8012345678";
  eq("Nigeria, local 0", phoneDigitsKey("0801 234 5678"), ng);
  eq("Nigeria, +234", phoneDigitsKey("+234 801 234 5678"), ng);
  eq("too short to be a number matches nothing", phoneDigitsKey("12345"), null);
}

console.log("\nDays where the business is (src/lib/localDate.ts)");
{
  const ny = "America/New_York";
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  eq("a Greensboro day ends at 5 AM UTC in winter", iso(endOfLocalDay("2026-11-12", ny)), "2026-11-13T05:00:00.000Z");
  eq("and at 4 AM UTC in summer", iso(endOfLocalDay("2026-07-04", ny)), "2026-07-05T04:00:00.000Z");
  eq("the day the clocks go forward", iso(endOfLocalDay("2026-03-08", ny)), "2026-03-09T04:00:00.000Z");
  eq("the day the clocks go back", iso(endOfLocalDay("2026-11-01", ny)), "2026-11-02T05:00:00.000Z");
  eq("a Lagos day ends at 11 PM UTC", iso(endOfLocalDay("2026-11-12", "Africa/Lagos")), "2026-11-12T23:00:00.000Z");
  eq("8 PM in Greensboro is still today there", todayIn(ny, new Date("2026-11-12T01:00:00Z")), "2026-11-11");
}

console.log("\nHow long a request holds the car");
{
  const ny = "America/New_York";
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  // Each of these was wrong when the hold ended at the UTC start of the pickup date.
  eq(
    "next-day pickup booked at 3 PM: held through the pickup day, not until 7 PM tonight",
    iso(holdForPickup("2026-11-12", ny, new Date("2026-11-11T20:00:00Z"))),
    "2026-11-13T04:59:00.000Z",
  );
  eq(
    "next-day pickup booked at 8 PM: held, where it used to be refused a hold",
    iso(holdForPickup("2026-11-12", ny, new Date("2026-11-12T01:00:00Z"))),
    "2026-11-13T04:59:00.000Z",
  );
  eq(
    "same-day pickup booked at 9 AM: held until the day ends",
    iso(holdForPickup("2026-11-12", ny, new Date("2026-11-12T14:00:00Z"))),
    "2026-11-13T04:59:00.000Z",
  );
  eq(
    "and the email can say so: 11:59 PM on the pickup day, not 12:00 AM the day after",
    new Intl.DateTimeFormat("en-US", { weekday: "long", hour: "numeric", minute: "2-digit", timeZone: ny }).format(
      holdForPickup("2026-11-12", ny, new Date("2026-11-11T20:00:00Z"))!,
    ),
    "Thursday 11:59 PM",
  );
  eq(
    "same-day pickup at 11:30 PM: too late to hold",
    holdForPickup("2026-11-12", ny, new Date("2026-11-13T04:30:00Z")),
    null,
  );
  eq(
    "a pickup next week: two days, as promised",
    iso(holdForPickup("2026-11-20", ny, new Date("2026-11-11T20:00:00Z"))),
    "2026-11-13T20:00:00.000Z",
  );
}

console.log("\nWhat the admin list says about a booking's dates (src/lib/bookingTiming.ts)");
{
  const ny = "America/New_York";
  // As Postgres returns the period: calendar days at UTC midnight.
  const week = '["2026-11-12 00:00:00+00","2026-11-19 00:00:00+00")';
  const say = (status: string, at: string) => timingLabel(bookingTiming(week, status, ny, new Date(at)))?.text;
  eq("8 PM on the pickup day: goes out today, not 'not collected'", say("confirmed", "2026-11-13T01:00:00Z"), "Goes out today");
  eq("the next morning it is late", say("confirmed", "2026-11-13T15:00:00Z"), "Not collected — due out 1 day ago");
  eq("8 PM on the return day: due back today, not overdue", say("active", "2026-11-20T01:00:00Z"), "Due back today");
  eq("the next morning it is overdue", say("active", "2026-11-20T15:00:00Z"), "Overdue by 1 day");
}

// ── The booking form's steps ───────────────────────────────────────────────
//
// The form checks each step in the browser before moving on, with the
// server's own messages. If requestRental's wording or fields change and the
// steps module doesn't, the renter is told one thing on the phone and another
// by the server: this fails the build instead.
console.log("\nBooking steps (src/components/rentalBookingSteps.ts)");
{
  const actions = readFileSync(join(process.cwd(), "src/lib/actions/rentals.ts"), "utf8");
  const at = actions.indexOf("const schema = z.object({");
  const keys = [...actions.slice(at, actions.indexOf("\n});", at)).matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]).concat("licenceFile", "insuranceFile");
  ok("the request schema was found", keys.length >= 19, keys.join(", "));
  for (const k of keys) ok(`${k} belongs to a step or is a constant`, k in FIELD_STEP || NO_STEP.includes(k));
  ok("dates, then details, then license and insurance", FIELD_STEP.from < FIELD_STEP.name && FIELD_STEP.name < FIELD_STEP.insuranceChoice);
  eq("coverage on step 3", FIELD_STEP.insuranceChoice, 3); eq("license photo on step 3", FIELD_STEP.licenceFile, 3);
  eq("eligibility on step 3", FIELD_STEP.confirmEligible, 3); eq("terms on step 4", FIELD_STEP.acceptTerms, 4);
  for (const m of [MESSAGES.pickupMissing, MESSAGES.pickupPast, MESSAGES.returnMissing, MESSAGES.returnBeforePickup, MESSAGES.taken,
    MESSAGES.name, MESSAGES.phoneMissing, MESSAGES.phoneShort, MESSAGES.email, MESSAGES.license, MESSAGES.proof, MESSAGES.eligible, MESSAGES.terms])
    ok(`the server still says "${m}"`, actions.includes(m));
  const base: Snapshot = { today: "2026-11-11", from: "2026-11-20", to: "2026-11-27", days: 7, quoteError: null, overlap: false,
    name: "Ann Smith", phone: "(336) 555-0100", email: "", preparing: null, hasLicence: true, own: true, hasProof: true,
    sizeMessage: null, eligible: true, acceptedTerms: true };
  const msg = (s: 1 | 2 | 3 | 4, p: Partial<Snapshot>) => stepProblem(s, { ...base, ...p })?.message ?? null;
  const thrown = (f: () => unknown) => { try { f(); return null; } catch (e) { return (e as Error).message; } };
  const short = thrown(() => quoteRental({ ...US, minDays: 3 }, 2));
  const long = thrown(() => quoteRental({ ...US, maxDays: 30 }, 31));
  const driver = thrown(() => quoteRental({ ...US, withDriverAvailable: false }, 7, { withDriver: true }));
  for (const s of [1, 2, 3, 4] as const) eq(`step ${s} passes`, msg(s, {}), null);
  eq("no pickup", msg(1, { from: "" }), MESSAGES.pickupMissing); eq("pickup yesterday", msg(1, { from: "2026-11-10" }), MESSAGES.pickupPast);
  eq("pickup today", msg(1, { from: "2026-11-11" }), null); eq("no return", msg(1, { to: "" }), MESSAGES.returnMissing);
  eq("same-day return", msg(1, { to: "2026-11-20", days: 0 }), MESSAGES.returnBeforePickup);
  eq("too short, in quoteRental's words", msg(1, { quoteError: short, days: 2 }), short);
  eq("a driver problem points at the driver box", stepProblem(1, { ...base, quoteError: driver })?.field, "withDriver");
  eq("taken dates", msg(1, { overlap: true }), MESSAGES.taken);
  eq("one-letter name", msg(2, { name: " a " }), MESSAGES.name); eq("no phone", msg(2, { phone: " " }), MESSAGES.phoneMissing);
  eq("7-digit phone", msg(2, { phone: "555-0100" }), MESSAGES.phoneShort);
  for (const p of ["(336) 555-0100", "+1 336 555 0100", "0801 234 5678", "+234 801 234 5678"]) eq(`phone ${p}`, msg(2, { phone: p }), null);
  eq("ann@gmail", msg(2, { email: "ann@gmail" }), MESSAGES.email); eq("a@b.c", msg(2, { email: "a@b.c" }), MESSAGES.email);
  eq("ann@gmail.com", msg(2, { email: " ann@gmail.com " }), null);
  eq("still preparing", stepProblem(3, { ...base, preparing: "insuranceFile" })?.field, "insuranceFile");
  eq("no license", msg(3, { hasLicence: false }), MESSAGES.license); eq("own, no proof", msg(3, { hasProof: false }), MESSAGES.proof);
  eq("declined, no proof", msg(3, { own: false, hasProof: false }), null); eq("not eligible", msg(3, { eligible: false }), MESSAGES.eligible);
  eq("terms", msg(4, { acceptedTerms: false }), MESSAGES.terms);
  eq("email pattern is zod's", EMAIL_RE.source, regexes.email.source);
  for (const s of ["Those dates could not be read.", "That vehicle is already booked for some of those dates. Please choose different dates.",
    "That vehicle has just been booked for those dates. Please choose different dates.", "Those dates are not a valid rental period."]) {
    ok(`still in rentals.ts: ${s}`, actions.includes(s)); ok(`Change dates for: ${s}`, isDatesError(s)); }
  for (const s of [short, long, driver]) ok(`Change dates for: ${s}`, isDatesError(s ?? ""));
  for (const s of ["You're already holding 2 cars. Let one of those holds end before reserving another, or call us and we'll help.",
    "That vehicle is not available to rent.", "Something went wrong saving your request. Please call us and we will sort it out."])
    ok(`no Change dates for: ${s}`, !isDatesError(s));
  const w = [{ start: "2026-11-20", end: "2026-11-27", label: "", heldUntil: null }];
  eq("pickup on a return day", overlapsTaken("2026-11-27", "2026-11-30", w, 0), false);
  eq("return on a start day", overlapsTaken("2026-11-15", "2026-11-20", w, 0), false);
  eq("26th to 28th", overlapsTaken("2026-11-26", "2026-11-28", w, 0), true);
  const held = [{ ...w[0], heldUntil: "2026-11-12T04:59:00.000Z" }];
  eq("a running hold blocks", overlapsTaken("2026-11-21", "2026-11-22", held, Date.parse("2026-11-12T00:00:00Z")), true);
  eq("an ended hold does not", overlapsTaken("2026-11-21", "2026-11-22", held, Date.parse("2026-11-12T06:00:00Z")), false);
  eq("month end", addDaysIso("2026-11-28", 7), "2026-12-05"); eq("year end", addDaysIso("2026-12-28", 7), "2027-01-04");
  eq("leap day", addDaysIso("2028-02-28", 1), "2028-02-29");
  eq("lengths", lengthsFor({ minDays: 1, maxDays: null }).join(","), "7,14,30"); eq("lengths min 10", lengthsFor({ minDays: 10, maxDays: null }).join(","), "14,30");
  eq("lengths max 5", lengthsFor({ minDays: 1, maxDays: 5 }).join(","), "");
  eq("earliest field wins", routeForResult({ acceptTerms: ["x"], phone: ["y"] })?.field, "phone");
  eq("constants route nowhere", routeForResult({ vehicleSlug: ["x"] }), null);
}

console.log(
  `\n${passed} passed, ${failed} failed.` +
    (failed ? "  \x1b[31mPRICING WRONG\x1b[0m\n" : "  \x1b[32mRental pricing verified.\x1b[0m\n"),
);
process.exit(failed ? 1 : 0);
