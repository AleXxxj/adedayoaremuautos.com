"use client";

import { useActionState } from "react";
import { createAgreementFromDeal } from "@/lib/actions/finance";

/** Default first payment to one month after contracting. */
function defaultFirstDue(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function CreateAgreement({ dealId }: { dealId: string }) {
  const [state, action, pending] = useActionState(createAgreementFromDeal, null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="dealId" value={dealId} />

      {state?.error && (
        <p className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">First payment due</span>
          <input
            name="firstDueDate"
            type="date"
            required
            defaultValue={defaultFirstDue()}
            className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 outline-none focus:border-[var(--focus)]"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--cta-bg)] px-5 py-2.5 font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)] disabled:opacity-60"
        >
          {pending ? "Generating…" : "Create finance agreement"}
        </button>
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        Generates the full instalment schedule from the deal&rsquo;s financed
        amount, rate and term. The schedule is stored once and becomes the
        record of what the customer signed — it is never recomputed.
      </p>
    </form>
  );
}
