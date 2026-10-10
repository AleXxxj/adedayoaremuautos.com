"use client";

import { useActionState } from "react";
import { partnerSignIn } from "@/lib/actions/partnerAuth";

export function PartnerLoginForm() {
  const [state, action, pending] = useActionState(partnerSignIn, null);

  return (
    <form action={action} className="mt-6 space-y-4">
      {state?.error && (
        <p
          className="rounded-lg border border-[#7f3030] bg-[#2a1515] px-4 py-3 text-sm text-[#f0a0a0]"
          aria-live="polite"
        >
          {state.error}
        </p>
      )}

      <label className="block text-sm">
        <span className="mb-1.5 block text-[#b4b4b4]">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="w-full rounded-lg border border-[#333] bg-[#0d0d0d] px-3.5 py-3 text-base text-white"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1.5 block text-[#b4b4b4]">Password</span>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="w-full rounded-lg border border-[#333] bg-[#0d0d0d] px-3.5 py-3 text-base text-white"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-[#2a5c42] px-5 py-3.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
