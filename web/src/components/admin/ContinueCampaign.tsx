"use client";

import { useActionState } from "react";
import { continueCampaign, type CampaignResult } from "@/lib/actions/campaigns";

/**
 * Picks up a send that stopped part-way.
 *
 * A long list will outlast a serverless function's wall clock. Because every
 * recipient is a row, stopping is safe and resuming only touches the ones
 * still marked pending — so this can be pressed as many times as it takes
 * without anybody being emailed twice.
 */
export function ContinueCampaign({ id }: { id: string }) {
  const [state, action, pending] = useActionState<CampaignResult | null, FormData>(
    continueCampaign,
    null,
  );

  return (
    <form action={action} className="mt-4 border-t border-[var(--border-subtle)] pt-3">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-60"
        >
          {pending ? "Sending…" : "Continue sending"}
        </button>
        {state?.message && (
          <span className="text-sm text-[var(--text-secondary)]">{state.message}</span>
        )}
      </div>
      {state?.error && (
        <p className="mt-2 text-sm text-[var(--danger)]">{state.error}</p>
      )}
    </form>
  );
}
