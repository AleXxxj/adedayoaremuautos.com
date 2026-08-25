"use client";

import { useActionState } from "react";
import {
  saveAgreementTerms,
  markAgreementSigned,
  type AgreementResult,
} from "@/lib/actions/agreement";

interface Booking {
  id: string;
  renterLegalName: string | null;
  customerName: string;
  authorizedUse: string | null;
  pickupLocation: string | null;
  suggestedLocation: string;
  mileageAllowancePerDay: number | null;
  excessMileRate: number | null;
  startOdometer: number | null;
  endOdometer: number | null;
  currency: string;
  mileageUnit: string;
  signedAt: string | null;
}

/**
 * The lines that used to be filled in with a pen.
 *
 * Kept above the document rather than inside it: this is the staff's working
 * area, and none of it prints. Everything typed here appears in the agreement
 * below immediately, so what is signed is what the record holds.
 */
export function AgreementTerms({ booking }: { booking: Booking }) {
  const [state, action, saving] = useActionState<AgreementResult | null, FormData>(
    saveAgreementTerms,
    null,
  );
  const [signState, signAction, signing] = useActionState<AgreementResult | null, FormData>(
    markAgreementSigned,
    null,
  );

  const field =
    "w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 text-sm";
  const err = (f: string) => state?.fieldErrors?.[f]?.[0];

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Rental agreement</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            The renter, vehicle, dates, rate, total and deposit come from the
            booking. Fill in the rest here — nothing on this panel prints.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {booking.signedAt ? (
            <span className="rounded-full border border-[var(--success)]/40 px-3 py-1 text-xs text-[var(--success)]">
              Signed
            </span>
          ) : (
            <form action={signAction}>
              <input type="hidden" name="id" value={booking.id} />
              <button
                type="submit"
                disabled={signing}
                className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm disabled:opacity-60"
              >
                {signing ? "Saving…" : "Mark as signed"}
              </button>
            </form>
          )}

          <PrintButton />
        </div>
      </div>

      <form action={action} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={booking.id} />

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium">
            Renter&rsquo;s full legal name
          </span>
          <input
            name="renterLegalName"
            defaultValue={booking.renterLegalName ?? ""}
            placeholder={booking.customerName}
            className={field}
          />
          <span className="mt-1 block text-xs text-[var(--text-muted)]">
            As printed on the licence. Booked as &ldquo;{booking.customerName}
            &rdquo; — leave blank to use that.
          </span>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium">Authorized use</span>
          <input
            name="authorizedUse"
            defaultValue={booking.authorizedUse ?? ""}
            placeholder="DoorDash / gig delivery and personal use"
            className={field}
          />
          <span className="mt-1 block text-xs text-[var(--text-muted)]">
            Clause 4 turns on this. Personal motor policies commonly exclude
            delivery and rideshare work, and the renter is confirming cover for
            whatever is written here.
          </span>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium">
            Pickup / return location
          </span>
          <input
            name="pickupLocation"
            defaultValue={booking.pickupLocation ?? ""}
            placeholder={booking.suggestedLocation}
            className={field}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            Mileage allowance per day ({booking.mileageUnit})
          </span>
          <input
            name="mileageAllowancePerDay"
            type="number"
            min={0}
            defaultValue={booking.mileageAllowancePerDay ?? ""}
            placeholder="100"
            className={field}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            Excess mileage rate ({booking.currency} per {booking.mileageUnit.replace(/s$/, "")})
          </span>
          <input
            name="excessMileRate"
            type="number"
            step="0.01"
            min={0}
            defaultValue={booking.excessMileRate ?? ""}
            placeholder="0.30"
            className={field}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            Odometer at pickup
          </span>
          <input
            name="startOdometer"
            type="number"
            min={0}
            defaultValue={booking.startOdometer ?? ""}
            className={field}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            Odometer at return
          </span>
          <input
            name="endOdometer"
            type="number"
            min={0}
            defaultValue={booking.endOdometer ?? ""}
            className={field}
          />
          {err("endOdometer") && (
            <span className="mt-1 block text-sm text-[var(--danger)]">
              {err("endOdometer")}
            </span>
          )}
        </label>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save and update the agreement"}
          </button>
          {state?.ok && (
            <span className="ml-3 text-sm text-[var(--success)]">Saved.</span>
          )}
          {state?.error && (
            <span className="ml-3 text-sm text-[var(--danger)]">{state.error}</span>
          )}
          {signState?.error && (
            <span className="ml-3 text-sm text-[var(--danger)]">{signState.error}</span>
          )}
        </div>
      </form>
    </div>
  );
}

/** Opens the browser's own print dialog, which is where "Save as PDF" lives. */
function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent-contrast)]"
    >
      Print / Save as PDF
    </button>
  );
}
