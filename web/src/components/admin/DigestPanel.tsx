"use client";

import { useActionState, useEffect, useState } from "react";
import {
  sendDigestNow,
  previewDigest,
  digestReadiness,
  type DigestActionResult,
  type DigestPreviewRow,
  type DigestReadiness,
} from "@/lib/actions/digest";

/**
 * The weekly digest, and what is currently queued for it.
 *
 * The list matters more than the button. A scheduled email that goes out on
 * its own is invisible until a customer mentions it, so the one thing the
 * business needs is to be able to look, on any day of the week, and see
 * exactly what Saturday will say.
 */
export function DigestPanel({ markets }: { markets: string[] }) {
  const [state, action, pending] = useActionState<DigestActionResult | null, FormData>(
    sendDigestNow,
    null,
  );
  const [market, setMarket] = useState(markets[0] ?? "us");
  const [rows, setRows] = useState<DigestPreviewRow[] | null>(null);
  const [ready, setReady] = useState<DigestReadiness | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await digestReadiness();
      if (!cancelled) setReady(r);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Wrapped rather than calling setRows straight away, because React does
    // not allow a state update in the body of an effect — and clearing the
    // list first matters, so switching market cannot show the other one's
    // vehicles while the new answer is still in flight.
    let cancelled = false;
    void (async () => {
      if (!cancelled) setRows(null);
      const r = await previewDigest(market);
      if (!cancelled) setRows(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [market, state]);

  return (
    <section className="mt-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
      <h2 className="text-lg font-semibold">Weekly digest</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Every Saturday at 9am Greensboro time (2pm Lagos), subscribers get one
        email listing the vehicles that went live that week. A week with no new
        stock sends nothing at all.
      </p>

      {ready && !ready.cronSecretSet && (
        <p className="mt-4 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          <strong>Saturday will not run.</strong> CRON_SECRET is not set on the
          server, so the scheduled job is refused. Add it in Vercel under
          Settings → Environment Variables and redeploy. Until then the digest
          only goes out if somebody presses the button below.
        </p>
      )}
      {ready && !ready.mailConfigured && (
        <p className="mt-4 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          Email is not configured on the server, so nothing can be sent.
        </p>
      )}

      {state?.error && (
        <p className="mt-4 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-3 text-sm text-[var(--warning)]">
          {state.error}
        </p>
      )}
      {state?.ok && state.message && (
        <p className="mt-4 rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 px-4 py-3 text-sm text-[var(--success)]">
          {state.message}
        </p>
      )}

      <form action={action} className="mt-4 space-y-4">
        <label className="block max-w-xs">
          <span className="mb-1.5 block text-sm font-medium">Market</span>
          <select
            name="marketCode"
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 outline-none focus:border-[var(--focus)]"
          >
            {markets.map((m) => (
              <option key={m} value={m}>
                {m.toUpperCase()}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] p-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">
            Queued for this Saturday
          </p>

          {rows === null ? (
            <p className="text-sm text-[var(--text-muted)]">Checking…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              Nothing new in the last 7 days, so no email would go out. Set a
              vehicle to Available and it appears here.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {rows.map((r) => (
                <li key={r.id} className="flex gap-2">
                  <i className="fas fa-car mt-1 text-xs text-[var(--text-muted)]" aria-hidden="true" />
                  {r.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border-subtle)] pt-4">
          <button
            type="submit"
            disabled={pending || !rows || rows.length === 0}
            className="rounded-lg border border-[var(--border-default)] px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send it now instead"}
          </button>
          <span className="text-xs text-[var(--text-muted)]">
            Only needed if you would rather not wait for Saturday. It goes out
            immediately and cannot be recalled.
          </span>
        </div>
      </form>
    </section>
  );
}
