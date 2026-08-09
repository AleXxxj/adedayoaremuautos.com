"use client";

import { useActionState } from "react";
import { recordPayment } from "@/lib/actions/finance";

export function RecordPayment({
  agreementId,
  currency,
}: {
  agreementId: string;
  currency: string;
}) {
  const [state, action, pending] = useActionState(recordPayment, null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="agreementId" value={agreementId} />

      {state?.error && (
        <p
          className={`rounded-lg border px-4 py-3 text-sm ${
            state.ok
              ? "border-[var(--warning)]/40 bg-[var(--warning)]/10 text-[var(--warning)]"
              : "border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)]"
          }`}
        >
          {state.error}
        </p>
      )}
      {state?.ok && !state.error && (
        <p className="rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 px-4 py-3 text-sm text-[var(--success)]">
          Payment recorded and allocated to the oldest outstanding instalments.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Amount ({currency})</span>
          <input name="amount" type="number" step="0.01" min="0.01" required className={inp} />
          {state?.fieldErrors?.amount && <Err>{state.fieldErrors.amount[0]}</Err>}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Method</span>
          <select name="method" defaultValue="bank_transfer" className={inp}>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="cheque">Cheque</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Reference</span>
          <input name="reference" placeholder="Teller / transfer ref" className={inp} />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Received</span>
          <input name="receivedAt" type="date" className={inp} />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--cta-bg)] px-6 py-2.5 font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)] disabled:opacity-60"
      >
        {pending ? "Recording…" : "Record payment"}
      </button>

      <p className="text-xs text-[var(--text-muted)]">
        Applied to the oldest outstanding instalment first, so arrears clear before
        future instalments.
      </p>
    </form>
  );
}

const inp =
  "w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 outline-none focus:border-[var(--focus)]";

function Err({ children }: { children: React.ReactNode }) {
  return <span className="mt-1 block text-sm text-[var(--danger)]">{children}</span>;
}
