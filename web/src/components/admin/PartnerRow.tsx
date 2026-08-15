"use client";

import { useActionState, useState } from "react";
import { updatePartner } from "@/lib/actions/referral";
import { formatBps } from "@/lib/referral";

interface Partner {
  id: string;
  code: string;
  fullName: string;
  marketCode: string;
  phone: string;
  email: string | null;
  whatsapp: string | null;
  status: string;
  commissionBps: number;
  createdAt: string;
  link: string;
  enquiries: number;
  sales: number;
  soldValue: string;
  owed: string;
}

export function PartnerRow({ partner }: { partner: Partner }) {
  const [state, action, pending] = useActionState(updatePartner, null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(partner.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the link is on screen to select.
    }
  };

  return (
    <li className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{partner.fullName}</span>
            <code className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-xs font-medium">
              {partner.code}
            </code>
            <span className="text-xs uppercase text-[var(--text-muted)]">
              {partner.marketCode}
            </span>
            {partner.status === "suspended" && (
              <span className="rounded-full border border-[var(--danger)]/40 px-2 py-0.5 text-xs text-[var(--danger)]">
                suspended
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a href={`tel:${partner.phone}`} className="text-[var(--link)] hover:underline">
              {partner.phone}
            </a>
            {partner.email && (
              <a href={`mailto:${partner.email}`} className="text-[var(--link)] hover:underline">
                {partner.email}
              </a>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="max-w-full truncate rounded bg-[var(--surface-2)] px-2 py-1 text-xs">
              {partner.link}
            </code>
            <button
              type="button"
              onClick={copy}
              className="rounded-lg border border-[var(--border-default)] px-2.5 py-1 text-xs"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>

        {/* What they have actually produced, which is the only thing that
            decides whether a commission conversation is worth having. */}
        <div className="text-right text-sm">
          <div className="font-bold tabular-nums">{partner.owed}</div>
          <div className="text-xs text-[var(--text-muted)]">
            owed at {formatBps(partner.commissionBps)}
          </div>
          <div className="mt-2 text-xs text-[var(--text-muted)]">
            {partner.enquiries} enquir{partner.enquiries === 1 ? "y" : "ies"} ·{" "}
            {partner.sales} sold
          </div>
          {partner.sales > 0 && (
            <div className="text-xs text-[var(--text-muted)]">
              {partner.soldValue} in sales
            </div>
          )}
        </div>
      </div>

      {state?.error && (
        <p className="mt-3 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {state.error}
        </p>
      )}
      {state?.fieldErrors?.code && (
        <p className="mt-3 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {state.fieldErrors.code[0]}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-full border border-[var(--border-default)] px-3 py-1 text-xs"
        >
          {open ? "Close" : "Edit terms"}
        </button>

        <form action={action}>
          <input type="hidden" name="id" value={partner.id} />
          <input
            type="hidden"
            name="status"
            value={partner.status === "active" ? "suspended" : "active"}
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full border border-[var(--border-default)] px-3 py-1 text-xs disabled:opacity-50"
          >
            {partner.status === "active" ? "Suspend" : "Reactivate"}
          </button>
        </form>
      </div>

      {open && (
        <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={partner.id} />

          <label className="text-xs">
            <span className="mb-1 block text-[var(--text-muted)]">Code</span>
            <input
              name="code"
              defaultValue={partner.code}
              className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-2 py-1.5 text-sm uppercase"
            />
          </label>

          <label className="text-xs">
            <span className="mb-1 block text-[var(--text-muted)]">
              Commission (basis points — 150 = 1.5%)
            </span>
            <input
              name="commissionBps"
              type="number"
              min={0}
              max={2000}
              defaultValue={partner.commissionBps}
              className="w-40 rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-2 py-1.5 text-sm"
            />
          </label>

          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-60"
          >
            Save
          </button>
        </form>
      )}
    </li>
  );
}
