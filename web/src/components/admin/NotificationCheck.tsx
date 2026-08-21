"use client";

import { useActionState } from "react";
import { sendTestNotification } from "@/lib/actions/notifyCheck";

/**
 * "Am I actually going to be told when a lead arrives?"
 *
 * Sits on the Leads screen because that is where somebody goes when they think
 * enquiries are not reaching them. Collapsed by default so it does not compete
 * with the actual work.
 */
export function NotificationCheck() {
  const [state, action, pending] = useActionState(
    async () => sendTestNotification(),
    null,
  );

  const o = state?.outcome;

  return (
    <details className="mb-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-5 py-4">
      <summary className="cursor-pointer text-sm font-medium">
        <i className="fas fa-bell mr-2 text-[var(--text-muted)]" aria-hidden="true" />
        Lead alerts — check they are working
      </summary>

      <p className="mt-3 text-sm text-[var(--text-muted)]">
        Alerts never block an enquiry: if email or SMS fails, the lead is still
        saved and still appears below. That safety means a broken setup is
        invisible, so this sends a real test and reports exactly what happened.
      </p>

      <form action={action} className="mt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send a test alert"}
        </button>
      </form>

      {state?.error && (
        <p className="mt-3 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {state.error}
        </p>
      )}

      {state?.configured && (
        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex gap-2">
            <dt className="text-[var(--text-muted)]">Email configured:</dt>
            <dd className={state.configured.email ? "text-[var(--success)]" : "text-[var(--warning)]"}>
              {state.configured.email
                ? "yes"
                : "no — RESEND_API_KEY or LEAD_ALERT_EMAIL is missing"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-[var(--text-muted)]">Sending from:</dt>
            <dd className="font-mono text-xs">{state.configured.from}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-[var(--text-muted)]">SMS configured:</dt>
            <dd className={state.configured.sms ? "text-[var(--success)]" : "text-[var(--text-muted)]"}>
              {state.configured.sms ? "yes" : "no (optional)"}
            </dd>
          </div>
        </dl>
      )}

      {o && (
        <div className="mt-4 space-y-2 text-sm">
          {o.delivered.length > 0 && (
            <p className="rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 px-3 py-2 text-[var(--success)]">
              Delivered by {o.delivered.join(" and ")}. Check the inbox — allow
              a minute, and look in spam the first time.
            </p>
          )}

          {o.skipped.map((s) => (
            <p
              key={s.channel}
              className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-[var(--text-muted)]"
            >
              <strong className="capitalize">{s.channel}</strong> skipped — {s.reason}
            </p>
          ))}

          {/* The provider's own words. "Domain is not verified" and "invalid
              API key" need completely different fixes and look identical from
              an empty inbox. */}
          {o.failed.map((f) => (
            <div
              key={f.channel}
              className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2"
            >
              <p className="text-[var(--danger)]">
                <strong className="capitalize">{f.channel}</strong> failed.
              </p>
              <p className="mt-1 font-mono text-xs break-words text-[var(--text-secondary)]">
                {f.error}
              </p>
            </div>
          ))}

          {o.attempted.length === 0 && o.skipped.length === 0 && (
            <p className="text-[var(--text-muted)]">Nothing was attempted.</p>
          )}
        </div>
      )}
    </details>
  );
}
