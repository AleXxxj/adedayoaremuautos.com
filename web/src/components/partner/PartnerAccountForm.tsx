"use client";

import { useActionState } from "react";
import { createPartnerAccount } from "@/lib/actions/partnerAuth";
import { PasswordField } from "./PasswordField";
import { btnPrimary, errorBox, fine } from "./ui";

/**
 * Choose a password, and in.
 *
 * On success this never renders a result: the action redirects to the
 * dashboard, logged in. Asking somebody to type the password they chose two
 * seconds ago into a login form is a step that exists for the system's
 * convenience rather than theirs.
 */
export function PartnerAccountForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(createPartnerAccount, null);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      {state?.error && (
        <p className={errorBox} role="alert">
          {state.error}
        </p>
      )}

      <PasswordField
        label="Choose a password"
        name="password"
        autoComplete="new-password"
        minLength={10}
        hint="At least 10 characters."
        error={state?.fieldErrors?.password?.[0]}
      />

      <PasswordField
        label="Type it again"
        name="confirm"
        autoComplete="new-password"
        minLength={10}
        error={state?.fieldErrors?.confirm?.[0]}
      />

      <button type="submit" disabled={pending} className={`${btnPrimary} w-full`}>
        {pending ? "Setting up…" : "Create my account"}
      </button>

      <p className={fine}>
        We never ask for bank or card details on this website. A payout is
        requested from your dashboard and arranged with you directly.
      </p>
    </form>
  );
}
