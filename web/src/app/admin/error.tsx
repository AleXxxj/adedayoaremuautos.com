"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * The admin had no error boundary at all, so a single thrown error anywhere in
 * a page produced a blank screen with nothing to act on — "can't load page"
 * and no way to tell whether the fault was the database, the deploy or the
 * network.
 *
 * React deliberately withholds the message in production, to avoid leaking
 * server internals to a browser. What it does provide is a `digest`: a hash
 * that appears next to the full stack trace in the deployment's runtime logs.
 * Showing it here is what turns "it broke" into a line someone can search for.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Also in the browser console, so it survives navigating away from here.
    console.error("[admin] render failed", error.digest, error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-xl border border-[var(--danger)]/40 bg-[var(--surface-1)] p-8">
        <h1 className="text-lg font-bold tracking-tight">This screen failed to load</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          The rest of the admin is unaffected — the data is safe and nothing was
          changed. Trying again is worth a moment; some failures are a dropped
          database connection.
        </p>

        {error.digest && (
          <p className="mt-4 rounded-lg bg-[var(--surface-2)] px-3 py-2 font-mono text-xs break-all">
            Reference: {error.digest}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)]"
          >
            Try again
          </button>
          <Link
            href="/admin"
            className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm font-medium"
          >
            Back to the admin
          </Link>
        </div>

        <p className="mt-5 text-xs text-[var(--text-muted)]">
          If it keeps happening, send the reference above — it identifies the
          exact failure in the server logs.
        </p>
      </div>
    </div>
  );
}
