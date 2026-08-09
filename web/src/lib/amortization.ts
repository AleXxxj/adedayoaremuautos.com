import { money, monthlyPayment, type CurrencyCode, type Money } from "./money";

/**
 * Instalment schedule generation.
 *
 * THE PROPERTY THAT MATTERS: the principal portions across every instalment
 * must sum to exactly the amount financed. Not approximately — exactly.
 *
 * The naive approach (compute a level payment, split it by a formula each
 * month) drifts by a few minor units over a long term, leaving a schedule whose
 * principal column does not foot. The customer pays it all off and the ledger
 * still shows a balance of ₦37, or shows the loan closed with ₦12 unpaid.
 *
 * The fix is standard practice: derive interest from the *running balance* each
 * period, take principal as the remainder, and let the final instalment absorb
 * whatever rounding produced. The last payment therefore differs slightly from
 * the others, which is exactly how real lenders do it.
 */

export interface Instalment {
  /** 1-based. */
  number: number;
  dueDate: Date;
  /** What the customer pays this period. */
  amount: Money;
  interest: Money;
  principal: Money;
  /** Balance remaining after this instalment. Zero on the last. */
  balanceAfter: Money;
}

export interface Schedule {
  principal: Money;
  aprBps: number;
  termMonths: number;
  /** The level payment. The final instalment may differ by a few units. */
  regularPayment: Money;
  instalments: Instalment[];
  totalInterest: Money;
  totalPaid: Money;
}

/** Same day-of-month n months on, clamped for short months. */
function addMonths(start: Date, n: number): Date {
  const d = new Date(start);
  const targetDay = start.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + n, 1);
  const daysInTarget = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  // 31 Jan + 1 month lands on 28/29 Feb, not 2/3 March.
  d.setUTCDate(Math.min(targetDay, daysInTarget));
  return d;
}

export function generateSchedule(
  principal: Money,
  aprBps: number,
  termMonths: number,
  firstDueDate: Date,
): Schedule {
  if (termMonths <= 0) throw new RangeError("termMonths must be positive");
  if (aprBps < 0) throw new RangeError("APR cannot be negative");
  if (principal.minor < 0) throw new RangeError("principal cannot be negative");

  const cur: CurrencyCode = principal.currency;
  const m = (n: number) => money(n, cur);

  const aprPercent = aprBps / 100;
  const periodicRate = aprPercent / 100 / 12;

  const regular =
    aprBps === 0
      ? m(Math.floor(principal.minor / termMonths))
      : monthlyPayment(principal, aprPercent, termMonths);

  const instalments: Instalment[] = [];
  let balance = principal.minor;
  let totalInterest = 0;

  for (let i = 1; i <= termMonths; i++) {
    const isLast = i === termMonths;

    // Interest always accrues on what is actually outstanding.
    const interest = aprBps === 0 ? 0 : Math.round(balance * periodicRate);

    let principalPart: number;
    let payment: number;

    if (isLast) {
      // The final instalment clears the balance exactly, whatever rounding
      // has accumulated. This is what makes the schedule foot.
      principalPart = balance;
      payment = principalPart + interest;
    } else {
      principalPart = regular.minor - interest;
      // Guard against a payment too small to cover interest (negative
      // amortisation). Better to fail loudly than to silently grow the debt.
      if (principalPart <= 0) {
        throw new RangeError(
          "Payment does not cover interest — the balance would grow. " +
            "Check the rate and term.",
        );
      }
      payment = regular.minor;
    }

    balance -= principalPart;
    totalInterest += interest;

    instalments.push({
      number: i,
      dueDate: addMonths(firstDueDate, i - 1),
      amount: m(payment),
      interest: m(interest),
      principal: m(principalPart),
      balanceAfter: m(balance),
    });
  }

  return {
    principal,
    aprBps,
    termMonths,
    regularPayment: regular,
    instalments,
    totalInterest: m(totalInterest),
    totalPaid: m(principal.minor + totalInterest),
  };
}

/** Sum of a field across instalments, for verification and display. */
export function sumField(
  s: Schedule,
  field: "amount" | "interest" | "principal",
): number {
  return s.instalments.reduce((acc, i) => acc + i[field].minor, 0);
}

export type InstalmentState = "due" | "paid" | "partial" | "late" | "written_off";

/** Arrears as of a given moment: what is overdue and by how much. */
export function arrears(
  instalments: { dueDate: Date; amountMinor: number; paidMinor: number; state: string }[],
  asOf: Date = new Date(),
): { overdueCount: number; overdueMinor: number; oldestDueDate: Date | null } {
  let overdueCount = 0;
  let overdueMinor = 0;
  let oldest: Date | null = null;

  for (const i of instalments) {
    if (i.state === "paid" || i.state === "written_off") continue;
    if (i.dueDate > asOf) continue;
    const outstanding = i.amountMinor - i.paidMinor;
    if (outstanding <= 0) continue;
    overdueCount++;
    overdueMinor += outstanding;
    if (!oldest || i.dueDate < oldest) oldest = i.dueDate;
  }

  return { overdueCount, overdueMinor, oldestDueDate: oldest };
}
