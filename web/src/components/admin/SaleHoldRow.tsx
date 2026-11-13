"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useActionToast } from "@/components/Toast";
import { markHoldDeposit, releaseHold, type HoldActionResult } from "@/lib/actions/saleHolds";

export interface SaleHoldView {
  id: string;
  reference: string;
  status: string;
  deposit: string | null;
  car: string;
  carAdminHref: string | null;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string | null;
  amount: string;
  /** "Sun, Nov 15, 3:42 PM EST" */
  until: string | null;
  /** "31 hr left": computed on the server, where the clock is. */
  left: string | null;
  paidAt: string;
  /** The payment in Stripe's dashboard, where a refund is made. */
  stripeUrl: string | null;
  testPayment: boolean;
}

const TONE: Record<string, string> = {
  active: "text-[var(--success)] border-[var(--success)]/40",
  expired: "text-[var(--warning)] border-[var(--warning)]/40",
  released: "text-[var(--text-muted)] border-[var(--border-default)]",
  completed: "text-[var(--text-muted)] border-[var(--border-default)]",
  conflict: "text-[var(--danger)] border-[var(--danger)]/50",
};

const STATUS_WORDS: Record<string, string> = {
  active: "Holding",
  expired: "Hold ended",
  released: "Released",
  completed: "Went to sale",
  conflict: "Paid, not held",
};

/** What staff should do next, in one line. Null when nothing is owed. */
function nextStep(h: SaleHoldView): string | null {
  if (h.deposit !== "held") return null;
  if (h.status === "expired") return "Hold ended: refund or contact buyer";
  if (h.status === "conflict") return "Paid but the car was not held: refund in Stripe and call the buyer";
  if (h.status === "released") return "Released: refund the deposit in Stripe, then mark it refunded";
  if (h.status === "completed") return null;
  return null;
}

/**
 * One paid hold, with the three things staff can record about it.
 *
 * None of these buttons moves money. A refund is made in Stripe's dashboard
 * (the link on this row opens the payment there); "Mark deposit refunded"
 * writes down that it was.
 */
export function SaleHoldRow({ hold }: { hold: SaleHoldView }) {
  const [released, release, releasing] = useActionState<HoldActionResult | null, FormData>(
    releaseHold,
    null,
  );
  const [marked, mark, marking] = useActionState<HoldActionResult | null, FormData>(
    markHoldDeposit,
    null,
  );
  useActionToast(released);
  useActionToast(marked);

  const busy = releasing || marking;
  const todo = nextStep(hold);
  const btn =
    "min-h-11 rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-50";

  return (
    <li className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {hold.carAdminHref ? (
              <Link href={hold.carAdminHref} className="hover:text-[var(--link)]">
                {hold.car}
              </Link>
            ) : (
              hold.car
            )}
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {hold.buyerName} ·{" "}
            <a href={`tel:${hold.buyerPhone}`} className="underline underline-offset-2">
              {hold.buyerPhone}
            </a>
            {hold.buyerEmail && (
              <>
                {" · "}
                <a href={`mailto:${hold.buyerEmail}`} className="break-all underline underline-offset-2">
                  {hold.buyerEmail}
                </a>
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Ref {hold.reference} · {hold.amount} paid {hold.paidAt}
            {hold.testPayment && " · Stripe test payment"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${TONE[hold.status] ?? TONE.released}`}
          >
            {STATUS_WORDS[hold.status] ?? hold.status}
          </span>
          {hold.status === "active" && hold.left && (
            <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5 text-xs font-medium text-[var(--text-primary)]">
              {hold.left}
            </span>
          )}
          <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
            {hold.deposit === "refunded"
              ? "Deposit refunded"
              : hold.deposit === "applied"
                ? "Deposit applied to sale"
                : "Deposit with us"}
          </span>
        </div>
      </div>

      {hold.status === "active" && hold.until && (
        <p className="mt-3 text-sm text-[var(--text-secondary)]">Held until {hold.until}</p>
      )}
      {todo && (
        <p className="mt-3 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-3 py-2 text-sm font-medium text-[var(--warning)]">
          {todo}
        </p>
      )}

      {(released?.error || marked?.error) && (
        <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
          {released?.error ?? marked?.error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {hold.stripeUrl && (
          <a href={hold.stripeUrl} target="_blank" rel="noopener noreferrer" className={btn}>
            Open payment in Stripe
          </a>
        )}

        {hold.status === "active" && (
          <form action={release}>
            <input type="hidden" name="id" value={hold.id} />
            <button type="submit" className={btn} disabled={busy}>
              Release hold
            </button>
          </form>
        )}

        {hold.deposit === "held" ? (
          <>
            <form action={mark}>
              <input type="hidden" name="id" value={hold.id} />
              <input type="hidden" name="to" value="refunded" />
              <button type="submit" className={btn} disabled={busy}>
                Mark deposit refunded
              </button>
            </form>
            {hold.status !== "conflict" && (
              <form action={mark}>
                <input type="hidden" name="id" value={hold.id} />
                <input type="hidden" name="to" value="applied" />
                <button type="submit" className={btn} disabled={busy}>
                  Applied to sale
                </button>
              </form>
            )}
          </>
        ) : (
          <form action={mark}>
            <input type="hidden" name="id" value={hold.id} />
            <input type="hidden" name="to" value="held" />
            <button
              type="submit"
              className="min-h-11 px-2 text-sm text-[var(--text-muted)] underline underline-offset-2 disabled:opacity-50"
              disabled={busy}
            >
              Undo: deposit is still with us
            </button>
          </form>
        )}
      </div>
    </li>
  );
}
