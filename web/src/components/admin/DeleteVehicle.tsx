"use client";

import { useActionState, useState } from "react";
import { deleteVehicle, type ActionResult } from "@/lib/actions/vehicles";

/**
 * Permanent removal, behind a confirmation.
 *
 * Two steps rather than one, because this is the only irreversible button in
 * the admin and a mis-tap on a phone should not cost a listing and its
 * photographs. The confirmation names the vehicle so it is obvious which one
 * is about to go.
 *
 * If the vehicle is attached to a deal or a booking the server refuses and
 * says why — the record has to keep pointing at something real.
 */
export function DeleteVehicle({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    deleteVehicle,
    null,
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--danger)]">
        Delete this vehicle
      </h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Removes the listing and its photographs for good. To take a vehicle off
        the website without losing it, set its status to{" "}
        <strong>Unlisted</strong> instead.
      </p>

      {state?.error && (
        <p className="mt-3 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {state.error}
        </p>
      )}

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-4 rounded-lg border border-[var(--danger)]/50 px-4 py-2 text-sm font-semibold text-[var(--danger)] hover:bg-[var(--danger)]/10"
        >
          Delete vehicle
        </button>
      ) : (
        <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={id} />
          <span className="text-sm">
            Delete <strong>{name}</strong> permanently?
          </span>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Deleting…" : "Yes, delete"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm"
          >
            Cancel
          </button>
        </form>
      )}
    </section>
  );
}
