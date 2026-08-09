/**
 * Payment allocation.
 *
 * When a customer pays, the money has to land somewhere specific. Getting this
 * wrong is how a ledger drifts out of agreement with reality: a payment that
 * clears an instalment but leaves it marked "due", or a part-payment recorded
 * against the newest instalment while an older one silently stays in arrears.
 *
 * Rule: oldest outstanding instalment first. That is what a customer expects
 * (it clears their arrears) and what keeps arrears reporting honest.
 */

export type InstalmentState = "due" | "paid" | "partial" | "late" | "written_off";

export interface AllocatableInstalment {
  id: string;
  number: number;
  dueDate: Date;
  amountMinor: number;
  paidMinor: number;
  state: InstalmentState;
}

export interface Allocation {
  instalmentId: string;
  number: number;
  /** Money applied to this instalment by this payment. */
  appliedMinor: number;
  /** Cumulative paid on the instalment after applying. */
  paidAfterMinor: number;
  stateAfter: InstalmentState;
}

export interface AllocationResult {
  allocations: Allocation[];
  /** Money left over after every instalment is satisfied — an overpayment. */
  unappliedMinor: number;
  /** True when this payment settles the whole agreement. */
  settlesAgreement: boolean;
}

/**
 * Spread `amountMinor` across instalments, oldest first.
 *
 * `asOf` decides whether an unpaid instalment is "due" or "late" after the
 * allocation, so the resulting state is truthful at the moment of recording.
 */
export function allocatePayment(
  instalments: AllocatableInstalment[],
  amountMinor: number,
  asOf: Date = new Date(),
): AllocationResult {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new RangeError("Payment must be a positive whole number of minor units");
  }

  // Oldest first, by instalment number — the schedule's own ordering.
  const ordered = [...instalments].sort((a, b) => a.number - b.number);

  let remaining = amountMinor;
  const allocations: Allocation[] = [];

  for (const inst of ordered) {
    if (remaining <= 0) break;
    if (inst.state === "written_off") continue;

    const outstanding = inst.amountMinor - inst.paidMinor;
    if (outstanding <= 0) continue;

    const applied = Math.min(remaining, outstanding);
    const paidAfter = inst.paidMinor + applied;
    remaining -= applied;

    const stateAfter: InstalmentState =
      paidAfter === inst.amountMinor
        ? "paid"
        : paidAfter > 0
          ? "partial"
          : inst.dueDate <= asOf
            ? "late"
            : "due";

    allocations.push({
      instalmentId: inst.id,
      number: inst.number,
      appliedMinor: applied,
      paidAfterMinor: paidAfter,
      stateAfter,
    });
  }

  const everythingSettled = ordered.every((i) => {
    const alloc = allocations.find((a) => a.instalmentId === i.id);
    const paid = alloc ? alloc.paidAfterMinor : i.paidMinor;
    return i.state === "written_off" || paid >= i.amountMinor;
  });

  return {
    allocations,
    unappliedMinor: remaining,
    settlesAgreement: everythingSettled,
  };
}

/**
 * Marks instalments late where their due date has passed and they are unpaid.
 *
 * Run before displaying a ledger: an instalment does not become late through
 * any action, it becomes late through time passing, so nothing else would ever
 * update it.
 */
export function markLate(
  instalments: AllocatableInstalment[],
  asOf: Date = new Date(),
): { id: string; state: InstalmentState }[] {
  const changes: { id: string; state: InstalmentState }[] = [];

  for (const i of instalments) {
    if (i.state === "paid" || i.state === "written_off") continue;
    const outstanding = i.amountMinor - i.paidMinor;
    if (outstanding <= 0) continue;

    const shouldBe: InstalmentState =
      i.dueDate <= asOf ? "late" : i.paidMinor > 0 ? "partial" : "due";

    // 'partial' already conveys money received; only escalate to late when
    // overdue, and only downgrade when the state is plainly wrong.
    const target = i.dueDate <= asOf && i.paidMinor > 0 ? "partial" : shouldBe;
    if (target !== i.state) changes.push({ id: i.id, state: target });
  }

  return changes;
}

export interface LedgerSummary {
  principalMinor: number;
  scheduledTotalMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  overdueMinor: number;
  overdueCount: number;
  nextDueDate: Date | null;
  nextDueMinor: number;
  progressPercent: number;
}

export function summarise(
  instalments: AllocatableInstalment[],
  principalMinor: number,
  asOf: Date = new Date(),
): LedgerSummary {
  let scheduled = 0;
  let paid = 0;
  let overdue = 0;
  let overdueCount = 0;
  let nextDueDate: Date | null = null;
  let nextDueMinor = 0;

  for (const i of instalments) {
    scheduled += i.amountMinor;
    paid += i.paidMinor;

    const outstanding = i.amountMinor - i.paidMinor;
    if (outstanding <= 0 || i.state === "written_off") continue;

    if (i.dueDate <= asOf) {
      overdue += outstanding;
      overdueCount++;
    } else if (!nextDueDate || i.dueDate < nextDueDate) {
      nextDueDate = i.dueDate;
      nextDueMinor = outstanding;
    }
  }

  return {
    principalMinor,
    scheduledTotalMinor: scheduled,
    paidMinor: paid,
    outstandingMinor: scheduled - paid,
    overdueMinor: overdue,
    overdueCount,
    nextDueDate,
    nextDueMinor,
    progressPercent: scheduled === 0 ? 0 : Math.round((paid / scheduled) * 100),
  };
}
