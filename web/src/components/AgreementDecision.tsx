"use client";

import { useActionState, useState } from "react";
import { acceptAgreement, declineAgreement } from "@/lib/actions/referral";

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
 */
export function AgreementDecision({
  token,
  name,
  code,
  link,
  accountLink,
  alreadyAccepted,
}: {
  token: string;
  name: string;
  code: string;
  link: string;
  accountLink: string;
  alreadyAccepted: boolean;
}) {
  const [accepted, acceptAction, accepting] = useActionState(acceptAgreement, null);
  const [declined, declineAction, declining] = useActionState(declineAgreement, null);
  const [ticked, setTicked] = useState(false);
  const [confirmingDecline, setConfirmingDecline] = useState(false);

  const done = accepted?.accepted || alreadyAccepted;
  const busy = accepting || declining;

  if (declined?.declined) {
    return (
      <div className="rounded-xl border border-[#2f2f2f] bg-[#141414] p-6">
        <h2 className="text-base font-semibold text-white">
          Understood — nothing further will happen
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#9b9b9b]">
          We have recorded that you did not accept, and your referral code has
          not been activated. If you change your mind, or if you declined by
          mistake, call us and we will reopen it.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-xl border border-[#2a5c42] bg-[#112018] p-6">
        <h2 className="text-base font-semibold text-white">
          Accepted — your code is live
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#b4b4b4]">
          Thank you, {name.split(/\s+/)[0]}. From now on, anyone who books or
          buys through your link is recorded against your name.
        </p>

        <div className="mt-4 rounded-lg border border-[#262626] bg-[#0d0d0d] p-4 text-center">
          <div className="text-[11px] uppercase tracking-[0.14em] text-[#7d7d7d]">
            Your code
          </div>
          <div className="mt-1 text-2xl font-bold tracking-wide text-white">
            {code}
          </div>
          <div className="mt-3 text-xs text-[#7d7d7d]">Your link</div>
          <div className="mt-0.5 break-all text-sm text-[#4e9d76]">{link}</div>
        </div>

        {/* Offered here as well as emailed, and on a reload too — the link is
            built from the token in the address, not from the action's reply.
            The welcome email is the durable copy, but somebody who has just
            accepted is on this page now and should not be sent to find an
            inbox in order to carry on. */}
        <a
          href={accountLink}
          className="mt-5 block rounded-xl bg-[#2a5c42] px-5 py-3.5 text-center text-sm font-bold text-white"
        >
          Create my partner account
        </a>
        <p className="mt-3 text-xs leading-relaxed text-[#7d7d7d]">
          The same link is in your email, so you can come back to this later.
        </p>
      </div>
    );
  }

  return (
    <>
      {(accepted?.error || declined?.error) && (
        <p
          className="mb-4 rounded-lg border border-[#7f3030] bg-[#2a1515] px-4 py-3 text-sm text-[#f0a0a0]"
          aria-live="polite"
        >
          {accepted?.error || declined?.error}
        </p>
      )}

      <form action={acceptAction}>
        <input type="hidden" name="token" value={token} />

        <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-[#d4d4d4]">
          <input
            type="checkbox"
            checked={ticked}
            onChange={(e) => setTicked(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#2a5c42]"
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
          className="mt-5 w-full rounded-xl bg-[#2a5c42] px-5 py-3.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          {accepting ? "Recording…" : "I agree — activate my code"}
        </button>
      </form>

      <div className="mt-4 text-center">
        {confirmingDecline ? (
          <form action={declineAction}>
            <input type="hidden" name="token" value={token} />
            <p className="text-sm text-[#9b9b9b]">
              Decline the agreement? Your code will not be activated.
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg border border-[#7f3030] px-4 py-2 text-sm text-[#f0a0a0] disabled:opacity-50"
              >
                {declining ? "Recording…" : "Yes, decline"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDecline(false)}
                className="rounded-lg border border-[#3a3a3a] px-4 py-2 text-sm text-[#d4d4d4]"
              >
                Go back
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDecline(true)}
            className="text-sm text-[#8a8a8a] underline"
          >
            I do not agree to these terms
          </button>
        )}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-[#6f6f6f]">
        Nothing is owed by you at any point, and there is no charge to be a
        partner. You can end this arrangement whenever you like.
      </p>
    </>
  );
}
