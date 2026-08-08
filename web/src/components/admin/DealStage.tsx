"use client";

import { useActionState, useState } from "react";
import { transitionDeal } from "@/lib/actions/deals";

const NEXT: Record<string, { to: string; label: string; tone?: "go" | "stop" }[]> = {
  draft: [
    { to: "negotiating", label: "Start negotiating", tone: "go" },
    { to: "lost", label: "Mark lost", tone: "stop" },
  ],
  negotiating: [
    { to: "agreed", label: "Terms agreed", tone: "go" },
    { to: "lost", label: "Mark lost", tone: "stop" },
  ],
  agreed: [
    { to: "financing", label: "Send to financing" },
    { to: "contracted", label: "Contract signed", tone: "go" },
    { to: "lost", label: "Mark lost", tone: "stop" },
  ],
  financing: [
    { to: "contracted", label: "Contract signed", tone: "go" },
    { to: "lost", label: "Mark lost", tone: "stop" },
  ],
  contracted: [
    { to: "delivered", label: "Delivered — hand over keys", tone: "go" },
    { to: "lost", label: "Mark lost", tone: "stop" },
  ],
  delivered: [],
  lost: [{ to: "draft", label: "Reopen as draft" }],
};

export function DealStage({ dealId, status }: { dealId: string; status: string }) {
  const [state, action, pending] = useActionState(transitionDeal, null);
  const [pendingTo, setPendingTo] = useState<string | null>(null);

  const options = NEXT[status] ?? [];

  if (status === "delivered") {
    return (
      <p className="rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 px-4 py-3 text-sm text-[var(--success)]">
        Delivered. The vehicle is marked sold and counted in the public total.
        This deal is now read-only.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {state?.error && (
        <p className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {state.error}
        </p>
      )}

      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={dealId} />

        {/* A lost deal needs a reason — the database constraint enforces it, so
            the UI asks for it rather than letting the save fail. */}
        {pendingTo === "lost" && (
          <input
            name="note"
            required
            autoFocus
            placeholder="Why was it lost? (required)"
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 text-sm outline-none focus:border-[var(--focus)]"
          />
        )}

        {options.map((o) => (
          <button
            key={o.to}
            type="submit"
            name="to"
            value={o.to}
            disabled={pending}
            onClick={() => setPendingTo(o.to)}
            className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 ${
              o.tone === "go"
                ? "bg-[var(--cta-bg)] text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)]"
                : o.tone === "stop"
                  ? "border border-[var(--danger)]/50 text-[var(--danger)] hover:bg-[var(--danger)]/10"
                  : "border border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
            }`}
          >
            {o.label}
          </button>
        ))}
      </form>

      {status === "contracted" && (
        <p className="text-xs text-[var(--text-muted)]">
          Marking delivered sets the vehicle to sold and increments the public
          &ldquo;vehicles sold&rdquo; figure. It cannot be undone.
        </p>
      )}
    </div>
  );
}
