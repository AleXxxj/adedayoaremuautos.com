"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import { requestPayout } from "@/lib/actions/payouts";
import {
  btnPrimary,
  btnPrimaryTight,
  btnSecondaryTight,
  display,
  errorBox,
  fine,
  successBox,
} from "./ui";

/**
 * Asking to be paid.
 *
 * Closed until pressed, so the dashboard's first impression is what somebody
 * has earned rather than a form. The success message renders right here under
 * the button, which is the whole lesson from the rest of this site: a
 * confirmation that needs scrolling to is a confirmation that did not happen.
 *
 * Open, it is three plain steps: how much (a big box, with the whole amount
 * one tap away), an optional note, and send.
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
  const amount = useRef<HTMLInputElement>(null);
  const all = (availableMinor / 100).toFixed(2);

  /*
   * Where focus goes when the button and the steps swap places, so nobody is
   * dropped at the top of the page: to the steps when they open (the steps,
   * not the amount box, so a phone's keyboard does not cover them), and back
   * to the button on Cancel.
   */
  const backToButton = useRef(false);
  const focusIfReturning = useCallback((el: HTMLButtonElement | null) => {
    if (el && backToButton.current) {
      backToButton.current = false;
      el.focus();
    }
  }, []);

  if (state?.ok) {
    return (
      <p className={`mt-5 ${successBox}`} aria-live="polite">
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
      <p className={`mt-5 ${successBox}`} aria-live="polite">
        You have asked for {outstanding}. We&rsquo;ll be in touch to arrange it —
        you will get an email when it has been sent.
      </p>
    );
  }

  if (availableMinor <= 0) {
    return (
      <p className="mt-5 text-[15px] leading-relaxed text-text-secondary">
        Once a rental you introduced has finished, what you have earned appears
        here and you can request it.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        ref={focusIfReturning}
        type="button"
        onClick={() => setOpen(true)}
        className={`${btnPrimary} mt-5 w-full sm:w-auto sm:px-8`}
      >
        <i className="fas fa-hand-holding-dollar" aria-hidden="true" />
        Request a payout
      </button>
    );
  }

  const amountError = state?.fieldErrors?.amount?.[0];

  return (
    <form
      ref={focusOnMount}
      action={action}
      tabIndex={-1}
      aria-label="Request a payout"
      className="mt-5 border-t border-border-subtle pt-5 focus:outline-none"
    >
      {state?.error && (
        <p className={`mb-4 ${errorBox}`} role="alert">
          {state.error}
        </p>
      )}

      <ol className="space-y-6">
        <li className="flex gap-3">
          <Step n={1} />
          <div className="min-w-0 flex-1">
            <label htmlFor="payout-amount" className="block text-base font-bold text-text-primary">
              How much?
            </label>
            <p id="payout-amount-note" className="mt-0.5 text-[15px] text-text-secondary">
              You have {available} available.
            </p>
            {/* The box is the field: it carries the focus ring for the
                input inside it. */}
            <div className="mt-3 flex items-center gap-2 rounded-[14px] border border-border-strong bg-surface-0 px-4 focus-within:border-brand-300 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
              <span className={`${display} text-2xl text-text-muted`} aria-hidden="true">
                {currencySymbol}
              </span>
              <input
                ref={amount}
                id="payout-amount"
                name="amount"
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="next"
                required
                placeholder={all}
                aria-invalid={amountError ? true : undefined}
                aria-describedby={`payout-amount-note${amountError ? " payout-amount-err" : ""}`}
                className={`${display} min-h-[64px] w-full min-w-0 bg-transparent text-[32px] tabular-nums text-text-primary placeholder:text-text-muted/70 focus:outline-none`}
              />
            </div>
            {amountError && (
              <p id="payout-amount-err" className="mt-2 text-sm text-danger">
                {amountError}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                if (!amount.current) return;
                amount.current.value = all;
                amount.current.focus();
              }}
              className="mt-2 inline-flex min-h-[44px] items-center rounded-full px-1 text-[15px] font-bold text-brand-300 underline underline-offset-4"
            >
              Request all {available}
            </button>
          </div>
        </li>

        <li className="flex gap-3">
          <Step n={2} />
          <div className="min-w-0 flex-1">
            <label htmlFor="payout-note" className="block text-base font-bold text-text-primary">
              Anything we should know? (optional)
            </label>
            <textarea
              id="payout-note"
              name="note"
              rows={2}
              maxLength={500}
              aria-describedby="payout-note-hint"
              className="mt-3 block w-full rounded-[14px] border border-border-strong bg-surface-0 px-4 py-3 text-base text-text-primary focus:border-brand-300"
            />
            <p id="payout-note-hint" className={`mt-2 ${fine}`}>
              Please do not put bank or card details here. We will contact you to
              arrange the payment.
            </p>
          </div>
        </li>

        <li className="flex gap-3">
          <Step n={3} />
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-text-primary">Send your request</p>
            <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(136px,1fr))] gap-2.5">
              <button type="submit" disabled={pending} className={btnPrimaryTight}>
                {pending ? "Sending…" : "Send request"}
              </button>
              <button
                type="button"
                onClick={() => {
                  backToButton.current = true;
                  setOpen(false);
                }}
                className={btnSecondaryTight}
              >
                Cancel
              </button>
            </div>
          </div>
        </li>
      </ol>
    </form>
  );
}

/** A stable ref callback: focuses the element once, when it appears. */
function focusOnMount(el: HTMLElement | null) {
  el?.focus();
}

function Step({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-300"
    >
      {n}
    </span>
  );
}
