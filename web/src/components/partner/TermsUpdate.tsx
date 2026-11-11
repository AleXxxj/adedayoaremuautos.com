"use client";

import { useActionState } from "react";
import { acceptUpdatedTerms } from "@/lib/actions/referral";

/**
 * "Our terms changed" — shown only to a partner on an older version.
 *
 * What changed, in a few sentences, before the full wording: what they gain
 * and the new rules alike, so nobody has to read eleven clauses to find out
 * and nobody accepts a rule they were not shown. The full wording is one tap
 * away, folded, and accepting is one more.
 *
 * Its result is said here rather than in a toast: the partner pages have no
 * toaster, and an error nobody sees reads as a button that does nothing.
 */
export function TermsUpdate({
  clauses,
}: {
  clauses: { n: number; heading: string; body: string }[];
}) {
  const [state, action, pending] = useActionState(acceptUpdatedTerms, null);

  if (state?.ok) {
    return (
      <p role="status" className="rounded-2xl border border-[#2a5c42] bg-[#2a5c42]/20 p-4 text-sm text-[#d4d4d4]">
        {state.message}
      </p>
    );
  }

  return (
    <section className="rounded-2xl border border-[#4e9d76]/50 bg-[#4e9d76]/10 p-5">
      <h2 className="font-semibold text-white">We updated the partner terms</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-[#d4d4d4]">
        Once someone you referred has rented, you earn on <strong>every later rental</strong>{" "}
        they book with the same phone number, for as long as they keep renting.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-[#d4d4d4]">
        Two new rules: when you share, say you get a referral fee (the messages below
        already do), and don&rsquo;t promise anyone how much they could earn. Vehicle sales
        count only where we have told you in writing that they do.
      </p>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-[#4e9d76]">Read the full terms</summary>
        <ol className="mt-3 space-y-3 text-[#b4b4b4]">
          {clauses.map((c) => (
            <li key={c.n}>
              <strong className="text-[#d4d4d4]">
                {c.n}. {c.heading}.
              </strong>{" "}
              {c.body}
            </li>
          ))}
        </ol>
      </details>
      <form action={action} className="mt-4">
        <button
          type="submit"
          disabled={pending}
          className="min-h-[44px] rounded-lg bg-[#2a5c42] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Accept the updated terms"}
        </button>
        {state?.error && (
          <p role="alert" className="mt-3 text-sm text-[#f3a6a3]">
            {state.error}
          </p>
        )}
      </form>
    </section>
  );
}
