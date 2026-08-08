"use client";

import { useActionState } from "react";
import type { DealResult } from "@/lib/actions/deals";

export function NewDealForm({
  action,
  vehicles,
  leadId,
  defaultVehicleId,
  defaults,
}: {
  action: (prev: DealResult | null, fd: FormData) => Promise<DealResult>;
  vehicles: { id: string; label: string }[];
  leadId?: string;
  defaultVehicleId?: string;
  defaults: { customerName: string; customerPhone: string; customerEmail: string };
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-5">
      {leadId && <input type="hidden" name="leadId" value={leadId} />}

      {state?.error && (
        <p className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {state.error}
        </p>
      )}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Vehicle</span>
        <select name="vehicleId" defaultValue={defaultVehicleId ?? ""} required className={inp}>
          <option value="">Select a vehicle…</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Customer name</span>
          <input name="customerName" defaultValue={defaults.customerName} required className={inp} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Phone</span>
          <input name="customerPhone" defaultValue={defaults.customerPhone} required className={inp} />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          Email <span className="text-[var(--text-muted)]">(optional)</span>
        </span>
        <input name="customerEmail" type="email" defaultValue={defaults.customerEmail} className={inp} />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--cta-bg)] px-6 py-2.5 font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)] disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create deal"}
      </button>

      <p className="text-xs text-[var(--text-muted)]">
        Creating a deal marks the vehicle as sale pending, so it stays visible
        on the site but is flagged internally.
      </p>
    </form>
  );
}

const inp =
  "w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 outline-none focus:border-[var(--focus)]";
