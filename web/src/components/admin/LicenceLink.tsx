"use client";

import { useActionState } from "react";
import { viewLicence, type LicenceViewResult } from "@/lib/actions/licenceView";

/**
 * Opens a renter's licence.
 *
 * A button rather than a link, because the address does not exist until it is
 * asked for: it is minted on the click, lasts three minutes, and is never
 * rendered into the page.
 */
export function LicenceLink({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState<LicenceViewResult | null, FormData>(
    viewLicence,
    null,
  );

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <form action={action} className="inline">
        <input type="hidden" name="id" value={bookingId} />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--link)] hover:underline disabled:opacity-60"
        >
          <i className="fas fa-id-card" aria-hidden="true" />
          {pending ? "Opening…" : "Licence on file"}
        </button>
      </form>

      {state?.ok && state.url && (
        <a
          href={state.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-[var(--success)]/40 px-2.5 py-0.5 text-xs text-[var(--success)]"
        >
          Open ↗ <span className="text-[var(--text-muted)]">expires in 3 min</span>
        </a>
      )}
      {state?.error && (
        <span className="text-xs text-[var(--danger)]">{state.error}</span>
      )}
    </span>
  );
}
