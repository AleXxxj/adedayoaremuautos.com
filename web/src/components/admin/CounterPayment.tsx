"use client";

import { useActionState, useRef } from "react";
import { useActionToast } from "@/components/Toast";
import {
  recordCounterPayment,
  type CounterPaymentResult,
} from "@/lib/actions/counterPayments";

/**
 * "Took payment" — money handed over at the counter, recorded in one step.
 *
 * The amount starts at what is still owed, because that is nearly always
 * what was paid. Each payment carries a key made in this browser and reused
 * if the same submit is retried, so pressing Record twice over a bad
 * connection records the money once (the database refuses the second).
 */
export function CounterPayment({
  bookingId,
  paid,
  total,
  owedMajor,
  currencySymbol,
}: {
  bookingId: string;
  /** Formatted, e.g. "$225.00". */
  paid: string;
  total: string;
  /** What is still owed, in dollars or naira, to prefill the amount. */
  owedMajor: number;
  currencySymbol: string;
}) {
  const key = useRef<string | null>(null);
  const [state, action, pending] = useActionState<CounterPaymentResult | null, FormData>(
    async (_prev, formData) => {
      key.current ??= crypto.randomUUID();
      formData.set("clientKey", key.current);
      try {
        const result = await recordCounterPayment(null, formData);
        if (result.ok) key.current = null; // the next payment is a new one
        return result;
      } catch {
        return {
          ok: false,
          error:
            "No reply from the server. Check the connection and press Record again — it will not be counted twice.",
        };
      }
    },
    null,
  );
  useActionToast(state);

  const paidInFull = owedMajor <= 0;

  return (
    <div className="mt-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-3">
      <p className="text-sm">
        <i className="fas fa-cash-register mr-2 text-[var(--text-muted)]" aria-hidden="true" />
        {paidInFull ? (
          <span className="font-medium text-[var(--success)]">Paid in full · {total}</span>
        ) : (
          <>
            Paid <strong className="tabular-nums">{paid}</strong> of{" "}
            <span className="tabular-nums">{total}</span>
          </>
        )}
      </p>

      {!paidInFull && (
        <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="bookingId" value={bookingId} />
          <label className="text-xs text-[var(--text-muted)]">
            Amount taken
            <span className="mt-1 flex items-center rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] px-2">
              <span className="text-sm text-[var(--text-muted)]">{currencySymbol}</span>
              <input
                name="amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                max={owedMajor}
                defaultValue={owedMajor}
                required
                className="w-28 bg-transparent px-1 py-2 text-sm tabular-nums text-[var(--text-primary)] outline-none"
              />
            </span>
          </label>
          <label className="text-xs text-[var(--text-muted)]">
            How
            <select
              name="method"
              defaultValue="cash"
              className="mt-1 block rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] px-2 py-2 text-sm text-[var(--text-primary)]"
            >
              <option value="cash">Cash</option>
              <option value="card">Card machine</option>
              <option value="other">Other</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={pending}
            className="min-h-[38px] rounded-lg bg-[var(--cta-bg)] px-4 py-2 text-sm font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)] disabled:opacity-60"
          >
            {pending ? "Recording…" : "Record payment"}
          </button>
          <p className="w-full text-xs text-[var(--text-muted)]">
            The rental charge only — not the refundable deposit. Never write a card or
            account number anywhere.
          </p>
        </form>
      )}
    </div>
  );
}
