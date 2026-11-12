"use client";

import { useActionState } from "react";
import { partnerSignIn } from "@/lib/actions/partnerAuth";
import { PasswordField } from "./PasswordField";
import { btnPrimary, errorBox, input, label } from "./ui";

/**
 * Email and password, with the keyboards and autofill that suit each: the
 * email keyboard, and the "username" hint that tells a password manager which
 * box its saved login goes in.
 */
export function PartnerLoginForm() {
  const [state, action, pending] = useActionState(partnerSignIn, null);

  return (
    <form action={action} className="space-y-5">
      {state?.error && (
        <p className={errorBox} role="alert">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="pl-email" className={label}>
          Email
        </label>
        <input
          id="pl-email"
          type="email"
          name="email"
          required
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          className={input}
        />
      </div>

      <PasswordField label="Password" name="password" autoComplete="current-password" />

      <button type="submit" disabled={pending} className={`${btnPrimary} w-full`}>
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
