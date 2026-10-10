"use client";

import { useActionState, useState } from "react";
import { requestPayout } from "@/lib/actions/payouts";

/**
 * Asking to be paid.
 *
 * Closed until pressed, so the dashboard's first impression is what somebody
 * has earned rather than a form. The success message renders right here under
 * the button, which is the whole lesson from the rest of this site: a
 * confirmation that needs scrolling to is a confirmation that did not happen.
 *
 * There is no field for bank details and the note says so. How the money
 * actually moves is arranged with the partner directly — the same rule that
 * keeps account numbers off every other form on this site.
 */
export function PayoutRequest({
  availableMinor,
  available,
  currencySymbol,
  outstanding,
}: {
  availableMinor: number;
  available: string;
  currencySymbol: string;
  /** A request already in, formatted — read from the database, not from state. */
  outstanding?: string;
}) {
  const [state, action, pending] = useActionState(requestPayout, null);
  const [open, setOpen] = useState(false);

  if (state?.ok) {
    return (
      <p
        className="mt-5 rounded-xl border border-[#2a5c42] bg-[#112018] px-4 py-3.5 text-sm text-[#b4d4c2]"
        aria-live="polite"
      >
        {state.message}
      </p>
    );
  }

  /*
   * The same confirmation, derived from the database rather than from this
   * component's own state.
   *
   * The action calls revalidatePath, which re-renders this route — and a
   * re-render can replace this component, taking its `useActionState` with
   * it. Relying on that state alone means a partner who has just asked to be
   * paid sees the panel telling them they have nothing available, which reads
   * exactly like a request that vanished. Reading it back makes the message
   * survive a re-render, a reload, and coming back tomorrow.
   */
  if (outstanding) {
    return (
      <p
        className="mt-5 rounded-xl border border-[#2a5c42] bg-[#112018] px-4 py-3.5 text-sm text-[#b4d4c2]"
        aria-live="polite"
      >
        You have asked for {outstanding}. We will be in touch to arrange it —
        you will get an email when it has been sent.
      </p>
    );
  }

  if (availableMinor <= 0) {
    return (
      <p className="mt-5 text-sm text-[#7d7d7d]">
        Once a hire or sale you introduced has completed, what you have earned
        appears here and you can request it.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-5 w-full rounded-xl bg-[#2a5c42] px-5 py-3.5 text-sm font-bold text-white sm:w-auto sm:px-7"
      >
        Request a payout
      </button>
    );
  }

  return (
    <form action={action} className="mt-5 space-y-3 border-t border-[#1f1f1f] pt-5">
      {state?.error && (
        <p
          className="rounded-lg border border-[#7f3030] bg-[#2a1515] px-4 py-3 text-sm text-[#f0a0a0]"
          aria-live="polite"
        >
          {state.error}
        </p>
      )}

      <label className="block text-sm">
        <span className="mb-1.5 block text-[#b4b4b4]">
          How much? You have {available} available.
        </span>
        <div className="flex items-center gap-2">
          <span className="text-lg text-[#7d7d7d]">{currencySymbol}</span>
          <input
            name="amount"
            inputMode="decimal"
            required
            placeholder={(availableMinor / 100).toFixed(2)}
            className="w-40 rounded-lg border border-[#333] bg-[#0d0d0d] px-3.5 py-3 text-base tabular-nums text-white"
          />
        </div>
        {state?.fieldErrors?.amount && (
          <span className="mt-1 block text-xs text-[#f0a0a0]">
            {state.fieldErrors.amount[0]}
          </span>
        )}
      </label>

      <label className="block text-sm">
        <span className="mb-1.5 block text-[#b4b4b4]">
          Anything we should know? (optional)
        </span>
        <textarea
          name="note"
          rows={2}
          maxLength={500}
          className="w-full rounded-lg border border-[#333] bg-[#0d0d0d] px-3.5 py-2.5 text-sm text-white"
        />
        <span className="mt-1 block text-xs text-[#6f6f6f]">
          Please do not put bank or card details here. We will contact you to
          arrange the payment.
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-[#2a5c42] px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send request"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-[#333] px-5 py-3 text-sm text-[#d4d4d4]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
