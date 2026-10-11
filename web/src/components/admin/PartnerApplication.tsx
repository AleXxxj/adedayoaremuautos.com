"use client";

import { useActionState, useState } from "react";
import { useActionToast } from "@/components/Toast";
import { approvePartner, declinePartner } from "@/lib/actions/referral";
import { formatBps } from "@/lib/referral";

export interface Application {
  id: string;
  code: string;
  fullName: string;
  businessName: string | null;
  city: string | null;
  marketCode: string;
  phone: string;
  email: string | null;
  whatsapp: string | null;
  website: string | null;
  proposal: string | null;
  status: string;
  commissionBps: number;
  rentalCommissionBps: number;
  appliedAt: string | null;
  reviewedAt: string | null;
  reviewedByEmail: string | null;
  declineReason: string | null;
  agreementSentAt: string | null;
}

/**
 * One application, and the decision.
 *
 * The proposal is shown in full rather than truncated with a "more" link.
 * It is the only part a reviewer is actually reading, it is at most a couple
 * of hundred words, and a decision made on the first line of it is a decision
 * made on the applicant's opening pleasantry.
 *
 * The rate is editable on the same form as the approval, because the moment
 * somebody is deciding whether to accept a partner is the moment they have an
 * opinion about what that partner is worth — and the figure is quoted in the
 * agreement email, so changing it afterwards means a second email correcting
 * the first.
 */
export function PartnerApplication({ app }: { app: Application }) {
  const [approved, approveAction, approving] = useActionState(approvePartner, null);
  const [declined, declineAction, declining] = useActionState(declinePartner, null);
  useActionToast(approved, "Approved — the agreement is on its way.");
  useActionToast(declined, "Declined, and they have been told.");

  const [decliningOpen, setDecliningOpen] = useState(false);
  const busy = approving || declining;

  const awaitingSignature = app.status === "approved";
  const error = approved?.error || declined?.error;

  return (
    <li className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{app.fullName}</span>
            <span className="text-xs uppercase text-[var(--text-muted)]">
              {app.marketCode}
            </span>
            {awaitingSignature && (
              <span className="rounded-full border border-[var(--warning)]/40 px-2 py-0.5 text-xs text-[var(--warning)]">
                agreement sent — not signed
              </span>
            )}
            {app.status === "declined" && (
              <span className="rounded-full border border-[var(--danger)]/40 px-2 py-0.5 text-xs text-[var(--danger)]">
                declined
              </span>
            )}
          </div>

          {(app.businessName || app.city) && (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {[app.businessName, app.city].filter(Boolean).join(" · ")}
            </p>
          )}

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a href={`tel:${app.phone}`} className="text-[var(--link)] hover:underline">
              {app.phone}
            </a>
            {app.email && (
              <a
                href={`mailto:${app.email}`}
                className="text-[var(--link)] hover:underline"
              >
                {app.email}
              </a>
            )}
            {app.whatsapp && (
              <span className="text-[var(--text-muted)]">
                WhatsApp {app.whatsapp}
              </span>
            )}
            {app.website && (
              // rel is not optional here: this is a URL a stranger typed into a
              // public form, rendered in the admin.
              <a
                href={app.website}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                className="text-[var(--link)] hover:underline"
              >
                their site
              </a>
            )}
          </div>
        </div>

        <div className="text-right text-xs text-[var(--text-muted)]">
          {app.appliedAt && <div>applied {relative(app.appliedAt)}</div>}
          {awaitingSignature && app.agreementSentAt && (
            <div>agreement sent {relative(app.agreementSentAt)}</div>
          )}
          {app.reviewedAt && app.reviewedByEmail && (
            <div className="mt-1">by {app.reviewedByEmail}</div>
          )}
        </div>
      </div>

      {app.proposal && (
        <div className="mt-3">
          <div className="text-xs text-[var(--text-muted)]">
            How they plan to refer
          </div>
          <p className="mt-1 whitespace-pre-line border-l-2 border-[var(--border-default)] pl-3 text-sm leading-relaxed text-[var(--text-secondary)]">
            {app.proposal}
          </p>
        </div>
      )}

      {app.declineReason && app.status === "declined" && (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Reason given: {app.declineReason}
        </p>
      )}

      {error && (
        <p
          className="mt-3 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]"
          aria-live="polite"
        >
          {error}
        </p>
      )}

      {!app.email && (
        <p className="mt-3 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-3 py-2 text-sm text-[var(--warning)]">
          No email address — the agreement cannot be sent. Call them for one.
        </p>
      )}

      <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
        {decliningOpen ? (
          <form action={declineAction} className="space-y-2">
            <input type="hidden" name="id" value={app.id} />
            <label className="block text-xs text-[var(--text-muted)]">
              Why — this is sent to them, so write it as they will read it
              (optional)
              <textarea
                name="reason"
                rows={2}
                maxLength={1000}
                placeholder="We are only taking on partners in Greensboro at the moment."
                className="mt-1 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-primary)]"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg border border-[var(--danger)]/50 px-3 py-1.5 text-sm text-[var(--danger)] disabled:opacity-50"
              >
                {declining ? "Sending…" : "Decline and email them"}
              </button>
              <button
                type="button"
                onClick={() => setDecliningOpen(false)}
                className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <form action={approveAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={app.id} />

            {/* Both rates, here, because the figures are quoted in the
                agreement email this button sends — changing one afterwards
                means a second email correcting the first. */}
            <label className="text-xs">
              <span className="mb-1 block text-[var(--text-muted)]">
                Hire — bps ({formatBps(app.rentalCommissionBps)})
              </span>
              <input
                name="rentalCommissionBps"
                type="number"
                min={0}
                max={2000}
                defaultValue={app.rentalCommissionBps}
                className="w-24 rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-2 py-1.5 text-sm"
              />
            </label>

            <label className="text-xs">
              <span className="mb-1 block text-[var(--text-muted)]">
                Sales — bps ({formatBps(app.commissionBps)})
              </span>
              <input
                name="commissionBps"
                type="number"
                min={0}
                max={2000}
                defaultValue={app.commissionBps}
                className="w-24 rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-2 py-1.5 text-sm"
              />
            </label>

            <button
              type="submit"
              disabled={busy || !app.email}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-50"
            >
              {approving
                ? "Sending…"
                : awaitingSignature
                  ? "Re-send the agreement"
                  : "Approve and send the agreement"}
            </button>

            <button
              type="button"
              onClick={() => setDecliningOpen(true)}
              className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm"
            >
              Decline
            </button>
          </form>
        )}
      </div>
    </li>
  );
}

/** "3 days ago" — enough for a queue that is meant to be cleared daily. */
function relative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
