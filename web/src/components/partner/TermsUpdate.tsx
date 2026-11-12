"use client";

import { useActionState } from "react";
import { acceptUpdatedTerms } from "@/lib/actions/referral";
import { btnPrimary, cardTitle, successBox } from "./ui";

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
      <p role="status" className={successBox}>
        {state.message}
      </p>
    );
  }

  return (
    <section className="rounded-[20px] border border-brand-300/50 bg-brand-500/10 p-5 sm:p-6">
      <h2 className={cardTitle}>We updated the partner terms</h2>
      <p className="mt-2 text-base leading-relaxed text-text-secondary">
        Once someone you referred has rented, you earn on{" "}
        <strong className="text-text-primary">every later rental</strong> they book with
        the same phone number, for as long as they keep renting.
      </p>
      <p className="mt-2 text-base leading-relaxed text-text-secondary">
        Two new rules: when you share, say you get a referral fee (the messages below
        already do), and don&rsquo;t promise anyone how much they could earn. Vehicle sales
        count only where we have told you in writing that they do.
      </p>
      <details className="group mt-3">
        <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-2 font-bold text-brand-300 [&::-webkit-details-marker]:hidden">
          <i
            className="fas fa-chevron-down text-sm transition-transform duration-200 ease-out group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
          Read the full terms
        </summary>
        <ol className="mt-2 space-y-4">
          {clauses.map((c) => (
            <li key={c.n}>
              <h3 className="text-base font-bold text-text-primary">
                {c.n}. {c.heading}
              </h3>
              <p className="mt-1 text-[15px] leading-relaxed text-text-secondary">{c.body}</p>
            </li>
          ))}
        </ol>
      </details>
      <form action={action} className="mt-4">
        <button type="submit" disabled={pending} className={`${btnPrimary} w-full sm:w-auto`}>
          {pending ? "Saving…" : "Accept the updated terms"}
        </button>
        {state?.error && (
          <p role="alert" className="mt-3 text-[15px] text-danger">
            {state.error}
          </p>
        )}
      </form>
    </section>
  );
}
