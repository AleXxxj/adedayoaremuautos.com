"use client";

import { useActionState } from "react";
import { checkPaymentSetup, type PaymentCheckResult } from "@/lib/actions/paymentCheck";

const TONE: Record<string, string> = {
  ok: "text-[var(--success)]",
  missing: "text-[var(--warning)]",
  bad: "text-[var(--danger)]",
};

const MARK: Record<string, string> = {
  ok: "fa-circle-check",
  missing: "fa-circle-minus",
  bad: "fa-circle-exclamation",
};

/**
 * "Can customers actually pay?"
 *
 * On the Rentals screen because that is where somebody goes when a booking has
 * not been paid for. Nothing is charged and no money moves — the secret key is
 * checked by asking Stripe for the account balance, which is read-only.
 */
export function PaymentCheck() {
  const [state, action, pending] = useActionState<PaymentCheckResult | null, FormData>(
    async () => checkPaymentSetup(),
    null,
  );

  return (
    <details className="mb-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-5 py-4">
      <summary className="cursor-pointer text-sm font-medium">
        <i className="fas fa-credit-card mr-2 text-[var(--text-muted)]" aria-hidden="true" />
        Card payments — check they are working
      </summary>

      <p className="mt-3 text-sm text-[var(--text-muted)]">
        With no keys the pay button simply does not appear, and a customer
        cannot tell that from a business that does not take cards. This asks
        Stripe directly. Nothing is charged.
      </p>

      <form action={action} className="mt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {pending ? "Checking…" : "Check the setup"}
        </button>
      </form>

      {state && (
        <div className="mt-4 space-y-3">
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              state.usReady
                ? "border border-[var(--success)]/40 bg-[var(--success)]/10 text-[var(--success)]"
                : "border border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)]"
            }`}
          >
            {state.usReady
              ? "US rentals can be paid for online."
              : "US rentals cannot be paid for online yet."}
            {state.ngReady ? " Nigeria is ready too." : " Nigeria is not set up yet."}
          </p>

          <ul className="space-y-2">
            {state.rows.map((r) => (
              <li key={r.label} className="text-sm">
                <span className={TONE[r.state]}>
                  <i className={`fas ${MARK[r.state]} mr-2`} aria-hidden="true" />
                  {r.label}
                </span>
                <span className="mt-0.5 block pl-6 text-[var(--text-muted)]">{r.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}
