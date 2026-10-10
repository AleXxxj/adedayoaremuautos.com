"use client";

import { useActionState, useState } from "react";
import { useActionToast } from "@/components/Toast";
import { decidePayout } from "@/lib/actions/payouts";

interface Payout {
  id: string;
  amount: string;
  state: string;
  note: string | null;
  requestedAt: string;
  decidedByEmail: string | null;
  paidAt: string | null;
  reference: string | null;
  rejectReason: string | null;
  marketCode: string;
  partnerName: string;
  partnerCode: string;
  partnerPhone: string;
  partnerEmail: string | null;
}

/**
 * One request, and the three things that can be done with it.
 *
 * Marking it paid asks for a reference before it will submit. That is not
 * bureaucracy: the reference is the only thing that turns "we paid you" into
 * something either side can check, and the partner is emailed it.
 */
export function PayoutRow({ payout }: { payout: Payout }) {
  const [state, action, pending] = useActionState(decidePayout, null);
  useActionToast(state);
  const [mode, setMode] = useState<"none" | "pay" | "reject">("none");

  const settled = payout.state === "paid" || payout.state === "rejected";

  return (
    <li className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="text-xl font-bold tabular-nums">{payout.amount}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{payout.partnerName}</span>
            <code className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-xs">
              {payout.partnerCode}
            </code>
            <span className="text-xs uppercase text-[var(--text-muted)]">
              {payout.marketCode}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a
              href={`tel:${payout.partnerPhone}`}
              className="text-[var(--link)] hover:underline"
            >
              {payout.partnerPhone}
            </a>
            {payout.partnerEmail && (
              <a
                href={`mailto:${payout.partnerEmail}`}
                className="text-[var(--link)] hover:underline"
              >
                {payout.partnerEmail}
              </a>
            )}
          </div>
        </div>

        <div className="text-right text-xs text-[var(--text-muted)]">
          <div>requested {relative(payout.requestedAt)}</div>
          {payout.state === "approved" && (
            <div className="mt-1 text-[var(--warning)]">approved, not sent</div>
          )}
          {payout.state === "paid" && (
            <>
              <div className="mt-1 text-[var(--success)]">
                paid {payout.paidAt ? relative(payout.paidAt) : ""}
              </div>
              {payout.reference && <div>ref {payout.reference}</div>}
            </>
          )}
          {payout.state === "rejected" && (
            <div className="mt-1 text-[var(--danger)]">declined</div>
          )}
          {payout.decidedByEmail && <div>by {payout.decidedByEmail}</div>}
        </div>
      </div>

      {payout.note && (
        <p className="mt-3 whitespace-pre-line border-l-2 border-[var(--border-default)] pl-3 text-sm text-[var(--text-secondary)]">
          {payout.note}
        </p>
      )}

      {payout.rejectReason && (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Reason given: {payout.rejectReason}
        </p>
      )}

      {state?.error && (
        <p
          className="mt-3 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]"
          aria-live="polite"
        >
          {state.error}
        </p>
      )}

      {!settled && (
        <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
          {mode === "pay" ? (
            <form action={action} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={payout.id} />
              <input type="hidden" name="decision" value="paid" />
              <label className="text-xs">
                <span className="mb-1 block text-[var(--text-muted)]">
                  Your transfer reference
                </span>
                <input
                  name="reference"
                  required
                  maxLength={120}
                  placeholder="FT26101000991"
                  className="w-56 rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-2 py-1.5 text-sm"
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-50"
              >
                {pending ? "Recording…" : `Mark ${payout.amount} paid`}
              </button>
              <button
                type="button"
                onClick={() => setMode("none")}
                className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm"
              >
                Cancel
              </button>
            </form>
          ) : mode === "reject" ? (
            <form action={action} className="space-y-2">
              <input type="hidden" name="id" value={payout.id} />
              <input type="hidden" name="decision" value="rejected" />
              <label className="block text-xs text-[var(--text-muted)]">
                Why — the partner is told this
                <textarea
                  name="reason"
                  rows={2}
                  required
                  maxLength={500}
                  className="mt-1 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-primary)]"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg border border-[var(--danger)]/50 px-3 py-1.5 text-sm text-[var(--danger)] disabled:opacity-50"
                >
                  Decline the request
                </button>
                <button
                  type="button"
                  onClick={() => setMode("none")}
                  className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode("pay")}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)]"
              >
                Mark as paid
              </button>

              {payout.state === "requested" && (
                <form action={action}>
                  <input type="hidden" name="id" value={payout.id} />
                  <input type="hidden" name="decision" value="approved" />
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm disabled:opacity-50"
                  >
                    Approve for the next run
                  </button>
                </form>
              )}

              <button
                type="button"
                onClick={() => setMode("reject")}
                className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm"
              >
                Decline
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function relative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
