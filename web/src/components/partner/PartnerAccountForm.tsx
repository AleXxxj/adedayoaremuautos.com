"use client";

import { useActionState } from "react";
import { createPartnerAccount } from "@/lib/actions/partnerAuth";

/**
 * Choose a password, and in.
 *
 * On success this never renders a result: the action redirects to the
 * dashboard, signed in. Asking somebody to type the password they chose two
 * seconds ago into a login form is a step that exists for the system's
 * convenience rather than theirs.
 */
export function PartnerAccountForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(createPartnerAccount, null);

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />

      {state?.error && (
        <p
          className="rounded-lg border border-[#7f3030] bg-[#2a1515] px-4 py-3 text-sm text-[#f0a0a0]"
          aria-live="polite"
        >
          {state.error}
        </p>
      )}

      <label className="block text-sm">
        <span className="mb-1.5 block text-[#b4b4b4]">Choose a password</span>
        <input
          type="password"
          name="password"
          required
          minLength={10}
          autoComplete="new-password"
          className="w-full rounded-lg border border-[#333] bg-[#0d0d0d] px-3.5 py-3 text-base text-white"
        />
        {state?.fieldErrors?.password ? (
          <span className="mt-1 block text-xs text-[#f0a0a0]">
            {state.fieldErrors.password[0]}
          </span>
        ) : (
          <span className="mt-1 block text-xs text-[#7d7d7d]">
            At least 10 characters.
          </span>
        )}
      </label>

      <label className="block text-sm">
        <span className="mb-1.5 block text-[#b4b4b4]">Type it again</span>
        <input
          type="password"
          name="confirm"
          required
          minLength={10}
          autoComplete="new-password"
          className="w-full rounded-lg border border-[#333] bg-[#0d0d0d] px-3.5 py-3 text-base text-white"
        />
        {state?.fieldErrors?.confirm && (
          <span className="mt-1 block text-xs text-[#f0a0a0]">
            {state.fieldErrors.confirm[0]}
          </span>
        )}
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-[#2a5c42] px-5 py-3.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {pending ? "Setting up…" : "Create my account"}
      </button>

      <p className="text-xs leading-relaxed text-[#6f6f6f]">
        We never ask for bank or card details on this website. A payout is
        requested from your dashboard and arranged with you directly.
      </p>
    </form>
  );
}
