"use client";

import { useActionToast } from "@/components/Toast";

import { useActionState } from "react";
import { viewLicence, type LicenceViewResult } from "@/lib/actions/licenceView";

/**
 * Opens a renter's licence or insurance certificate.
 *
 * A button rather than a link, because the address does not exist until it is
 * asked for: it is minted on the click, lasts three minutes, and is never
 * rendered into the page.
 */
export function LicenceLink({
  bookingId,
  kind = "licence",
}: {
  bookingId: string;
  kind?: "licence" | "insurance";
}) {
  const [state, action, pending] = useActionState<LicenceViewResult | null, FormData>(
    viewLicence,
    null,
  );
  useActionToast(state);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <form action={action} className="inline">
        <input type="hidden" name="id" value={bookingId} />
        <input type="hidden" name="kind" value={kind} />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--link)] hover:underline disabled:opacity-60"
        >
          <i
            className={kind === "insurance" ? "fas fa-file-shield" : "fas fa-id-card"}
            aria-hidden="true"
          />
          {pending
            ? "Opening…"
            : kind === "insurance"
              ? "Insurance on file"
              : "Licence on file"}
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
