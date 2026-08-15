"use client";

import { useActionState } from "react";
import { setPassword } from "@/lib/actions/auth";

/**
 * The password fields are `new-password`, not `password`, so a password
 * manager offers to generate and store one rather than trying to autofill an
 * account that does not exist yet.
 */
export function SetPasswordForm() {
  const [state, action, pending] = useActionState(setPassword, null);

  return (
    <form
      action={action}
      className="space-y-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-8"
    >
      {state?.error && (
        <p
          role="alert"
          className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]"
        >
          {state.error}
        </p>
      )}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">New password</span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={10}
          required
          autoFocus
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 text-sm"
        />
        <span className="mt-1.5 block text-xs text-[var(--text-muted)]">
          At least 10 characters.
        </span>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Confirm password</span>
        <input
          type="password"
          name="confirm"
          autoComplete="new-password"
          minLength={10}
          required
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 text-sm"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-60"
      >
        {pending ? "Saving…" : "Set password and continue"}
      </button>
    </form>
  );
}
