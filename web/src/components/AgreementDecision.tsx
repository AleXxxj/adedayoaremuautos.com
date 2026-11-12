"use client";

import { useActionState, useState } from "react";
import { acceptAgreement, declineAgreement } from "@/lib/actions/referral";
import {
  btnPrimary,
  btnSecondary,
  card,
  cardTitle,
  errorBox,
  fine,
} from "@/components/partner/ui";

/**
 * Accept or decline, and the result on the same screen.
 *
 * Two separate forms rather than one with a hidden intent field, so neither
 * decision can be reached by tampering with the other's payload — and so the
 * decline button cannot be the default submit of a form whose main button is
 * Accept. Pressing Enter in a tick-box should never decline a contract.
 *
 * Accepting requires the box to be ticked. That is not decoration: the record
 * written on acceptance is what the business would rely on if a commission
 * were ever disputed, and "they must have clicked something" is not the claim
 * anyone wants to be making.
 *
 * It sits straight after the last clause (components/partner/AgreementView),
 * so the box is ticked under the whole agreement, never beside a summary.
 * The whole sentence is the box's label, a target far larger than a thumb.
 */
export function AgreementDecision({
  token,
  name,
  code,
  link,
  accountLink,
  alreadyAccepted,
  version,
}: {
  token: string;
  name: string;
  code: string;
  link: string;
  accountLink: string;
  alreadyAccepted: boolean;
  /** The version of the terms on screen: what accepting agrees to. */
  version: string;
}) {
  const [accepted, acceptAction, accepting] = useActionState(acceptAgreement, null);
  const [declined, declineAction, declining] = useActionState(declineAgreement, null);
  const [ticked, setTicked] = useState(false);
  const [confirmingDecline, setConfirmingDecline] = useState(false);

  const done = accepted?.accepted || alreadyAccepted;
  const busy = accepting || declining;

  if (declined?.declined) {
    return (
      <div role="status" className={`${card} p-5 sm:p-6`}>
        <h2 className={cardTitle}>Understood — nothing further will happen</h2>
        <p className="mt-2 text-base leading-relaxed text-text-secondary">
          We have recorded that you did not accept, and your referral code has
          not been activated. If you change your mind, or if you declined by
          mistake, call us and we will reopen it.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div role="status" className="rounded-[20px] border border-brand-300/50 bg-brand-500/10 p-5 sm:p-6">
        <h2 className={cardTitle}>Accepted — your code is live</h2>
        <p className="mt-2 text-base leading-relaxed text-text-secondary">
          Thank you, {name.split(/\s+/)[0]}. From now on, anyone who books or
          buys through your link is recorded against your name.
        </p>

        <div className="mt-4 rounded-[14px] border border-border-default bg-surface-0 p-4 text-center">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-text-muted">
            Your code
          </div>
          <div className="mt-1 break-all font-mono text-2xl font-bold tracking-wide text-text-primary">
            {code}
          </div>
          <div className="mt-3 text-sm text-text-muted">Your link</div>
          <div className="mt-0.5 select-all break-all font-mono text-[15px] text-brand-300">
            {link}
          </div>
        </div>

        {/* Offered here as well as emailed, and on a reload too — the link is
            built from the token in the address, not from the action's reply.
            The welcome email is the durable copy, but somebody who has just
            accepted is on this page now and should not be sent to find an
            inbox in order to carry on. */}
        <a href={accountLink} className={`${btnPrimary} mt-5 w-full`}>
          Create my partner account
        </a>
        <p className={`mt-3 ${fine}`}>
          The same link is in your email, so you can come back to this later.
        </p>
      </div>
    );
  }

  return (
    <div className={`${card} p-5 sm:p-6`}>
      {(accepted?.error || declined?.error) && (
        <p className={`mb-4 ${errorBox}`} role="alert">
          {accepted?.error || declined?.error}
        </p>
      )}

      <form action={acceptAction}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="version" value={version} />

        <label className="-m-2 flex min-h-[44px] cursor-pointer items-start gap-3.5 rounded-[14px] p-2 text-base leading-relaxed text-text-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
          <input
            type="checkbox"
            checked={ticked}
            onChange={(e) => setTicked(e.target.checked)}
            className="mt-0.5 h-6 w-6 shrink-0 cursor-pointer accent-[var(--brand-500)] focus-visible:outline-none"
          />
          <span>
            I have read the agreement above and I accept it. I am applying as an
            independent person or business, not as an employee of Adedayo Aremu
            Autos.
          </span>
        </label>

        <button
          type="submit"
          disabled={!ticked || busy}
          className={`${btnPrimary} mt-5 w-full`}
        >
          {accepting ? "Recording…" : "I agree — activate my code"}
        </button>
      </form>

      <div className="mt-3 text-center">
        {confirmingDecline ? (
          <form action={declineAction} className="pt-2">
            <input type="hidden" name="token" value={token} />
            <p className="text-base text-text-secondary">
              Decline the agreement? Your code will not be activated.
            </p>
            <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2.5">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-[52px] items-center justify-center rounded-full border border-danger/60 px-6 text-base font-bold text-danger transition-colors duration-200 ease-out hover:border-danger disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
              >
                {declining ? "Recording…" : "Yes, decline"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDecline(false)}
                className={btnSecondary}
              >
                Go back
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDecline(true)}
            className="inline-flex min-h-[44px] items-center px-2 text-[15px] text-text-secondary underline underline-offset-4 hover:text-text-primary"
          >
            I do not agree to these terms
          </button>
        )}
      </div>

      <p className={`mt-4 ${fine}`}>
        Nothing is owed by you at any point, and there is no charge to be a
        partner. You can end this arrangement whenever you like.
      </p>
    </div>
  );
}
