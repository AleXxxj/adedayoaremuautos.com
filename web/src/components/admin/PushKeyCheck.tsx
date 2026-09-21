"use client";

import { useActionState } from "react";
import { checkPushKeys, type PushCheckResult } from "@/lib/actions/pushCheck";

/**
 * "Are notifications actually set up?"
 *
 * Sits with the notification composer, because that is where somebody goes
 * when they think alerts are not reaching anyone. Nothing is sent to any
 * customer — it reads the two keys and reports what is wrong with them.
 *
 * It exists because the customer-facing failure is silent on purpose: a
 * visitor whose browser cannot register just sees a button that does nothing
 * useful, and nobody tells the business. The same reasoning as the lead-alert
 * check on the Leads screen.
 */
export function PushKeyCheck() {
  const [state, action, pending] = useActionState<PushCheckResult | null, FormData>(
    async () => checkPushKeys(),
    null,
  );

  return (
    <details className="mt-4 rounded-lg border border-[var(--border-subtle)] px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">
        <i className="fas fa-key mr-2 text-[var(--text-muted)]" aria-hidden="true" />
        Notifications not working? Check the setup
      </summary>

      <p className="mt-3 text-sm text-[var(--text-muted)]">
        Reads the two notification keys on the server and reports any problem.
        Nothing is sent to any customer.
      </p>

      <form action={action} className="mt-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {pending ? "Checking…" : "Check the keys"}
        </button>
      </form>

      {state && (
        <div className="mt-4 space-y-3">
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              state.ok
                ? "border border-[var(--success)]/40 bg-[var(--success)]/10 text-[var(--success)]"
                : "border border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)]"
            }`}
          >
            {state.ok
              ? "Both keys are present, well formed, and a matching pair."
              : "Something is wrong with the setup."}
          </p>

          <ul className="space-y-2">
            {state.keys.map((k) => (
              <li key={k.name} className="text-sm">
                <span className="font-mono text-xs">{k.name}</span>
                <span className="ml-2 text-[var(--text-muted)]">
                  {k.present ? `${k.length} characters (expected ${k.expected})` : "missing"}
                </span>
                {k.problem && (
                  <span className="mt-0.5 block text-[var(--danger)]">{k.problem}</span>
                )}
              </li>
            ))}
          </ul>

          {state.pairValid === false && (
            <p className="rounded-lg bg-[var(--surface-2)] px-3 py-2 font-mono text-xs break-words text-[var(--text-muted)]">
              {state.pairError}
            </p>
          )}

          {state.advice && (
            <p className="text-sm text-[var(--text-secondary)]">{state.advice}</p>
          )}
        </div>
      )}
    </details>
  );
}
