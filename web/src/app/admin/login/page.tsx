"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { signIn } from "@/lib/actions/auth";

function LoginForm() {
  const search = useSearchParams();
  const [state, action, pending] = useActionState(signIn, null);
  const notStaff = search.get("error") === "not_staff";

  return (
    <form
      action={action}
      className="w-full max-w-sm space-y-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-8"
    >
      <div>
        <h1 className="text-xl font-bold tracking-tight">Staff sign in</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Adedayo Aremu Autos admin
        </p>
      </div>

      <input type="hidden" name="next" value={search.get("next") ?? "/admin/vehicles"} />

      {notStaff && (
        <p className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          That account exists but is not authorised for admin access.
        </p>
      )}

      {state?.error && (
        <p className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {state.error}
        </p>
      )}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 outline-none focus:border-[var(--focus)]"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 outline-none focus:border-[var(--focus)]"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[var(--cta-bg)] py-2.5 font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)] disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
