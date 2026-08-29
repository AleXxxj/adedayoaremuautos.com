"use client";

import { CONTACT_EMAIL } from "@/lib/contact";

/**
 * One public page failed, but the site is still standing.
 *
 * Every public page reads from the database at request time, so a momentary
 * backend problem used to surface as a dead browser tab — which is what
 * happened for fifteen minutes during a staff demonstration, with no way for
 * anyone looking at it to tell a five-minute blip from a business that had
 * closed down.
 *
 * The header and footer are still rendered around this by the layout, so a
 * visitor keeps the navigation and can go somewhere else on the site instead
 * of leaving.
 */
export default function MarketError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 py-20 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--brand-accent,#5aa87d)]">
        Something went wrong
      </p>

      <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
        We could not load this page
      </h1>

      <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)]">
        This is a problem on our side and it is usually brief. Try again in a
        moment — the rest of the site is still working, so you can also carry on
        browsing from the menu above.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-[var(--cta-bg)] px-6 py-3 font-semibold text-[var(--cta-fg)]"
        >
          Try again
        </button>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="rounded-lg border border-[var(--border-default)] px-6 py-3 font-medium"
        >
          Email us
        </a>
      </div>

      {error.digest && (
        <p className="mt-8 text-xs text-[var(--text-muted)]">
          Reference {error.digest}
        </p>
      )}
    </div>
  );
}
