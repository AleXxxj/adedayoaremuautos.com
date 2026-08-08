"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateLeadStatus } from "@/lib/actions/leads";

interface Lead {
  id: string;
  marketCode: string;
  type: string;
  status: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  preferredContact: string | null;
  source: string | null;
  createdAt: string;
  firstResponseAt: string | null;
}

const STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;

const STATUS_STYLE: Record<string, string> = {
  new: "text-[var(--warning)] border-[var(--warning)]/40",
  contacted: "text-[var(--info)] border-[var(--info)]/40",
  qualified: "text-[var(--info)] border-[var(--info)]/40",
  won: "text-[var(--success)] border-[var(--success)]/40",
  lost: "text-[var(--text-muted)] border-[var(--border-default)]",
};

/** "4 minutes", "2 hours", "3 days" */
function elapsed(fromIso: string, toIso?: string | null): string {
  const ms = (toIso ? new Date(toIso) : new Date()).getTime() - new Date(fromIso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function LeadRow({
  lead,
  vehicle,
}: {
  lead: Lead;
  vehicle: { label: string; slug: string } | null;
}) {
  const [state, action, pending] = useActionState(updateLeadStatus, null);

  const waiting = lead.status === "new" && !lead.firstResponseAt;
  const age = elapsed(lead.createdAt, lead.firstResponseAt);

  return (
    <li
      className={`rounded-xl border bg-[var(--surface-1)] p-5 ${
        waiting
          ? "border-[var(--warning)]/40"
          : "border-[var(--border-subtle)]"
      }`}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{lead.name}</span>
            <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              {lead.type.replace(/_/g, " ")}
            </span>
            <span className="text-xs uppercase text-[var(--text-muted)]">
              {lead.marketCode}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[lead.status]}`}
            >
              {lead.status}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className="text-[var(--link)] hover:underline">
                {lead.phone}
              </a>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="text-[var(--link)] hover:underline">
                {lead.email}
              </a>
            )}
            {lead.preferredContact && (
              <span className="text-[var(--text-muted)]">
                prefers {lead.preferredContact}
              </span>
            )}
          </div>

          {vehicle && (
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Re:{" "}
              <Link
                href={`/${lead.marketCode}/inventory/${vehicle.slug}`}
                target="_blank"
                className="text-[var(--link)] hover:underline"
              >
                {vehicle.label}
              </Link>
            </p>
          )}

          {lead.message && (
            <p className="mt-2 whitespace-pre-line text-sm text-[var(--text-secondary)]">
              {lead.message}
            </p>
          )}
        </div>

        <div className="text-right text-xs text-[var(--text-muted)]">
          {/* Response time, shown prominently because it is the number that
              predicts whether a lead closes. */}
          <div className={waiting ? "font-semibold text-[var(--warning)]" : ""}>
            {waiting ? `waiting ${age}` : `answered in ${age}`}
          </div>
          <div className="mt-1">
            {new Date(lead.createdAt).toLocaleString()}
          </div>
        </div>
      </div>

      <form action={action} className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
        <input type="hidden" name="id" value={lead.id} />
        <span className="text-xs text-[var(--text-muted)]">Mark as</span>
        {STATUSES.filter((s) => s !== lead.status).map((s) => (
          <button
            key={s}
            type="submit"
            name="status"
            value={s}
            disabled={pending}
            className="rounded-full border border-[var(--border-default)] px-3 py-1 text-xs capitalize hover:bg-[var(--surface-2)] disabled:opacity-50"
          >
            {s}
          </button>
        ))}
        {state?.error && (
          <span className="text-xs text-[var(--danger)]">{state.error}</span>
        )}
      </form>
    </li>
  );
}
