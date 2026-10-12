"use client";

import { useActionToast } from "@/components/Toast";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  updateBookingStatus,
  reviewBookingDocuments,
  adjustHold,
} from "@/lib/actions/rentals";
import { formatRange } from "@/lib/pgRange";
import { bookingTiming, timingLabel } from "@/lib/bookingTiming";
import { LicenceLink } from "./LicenceLink";

interface Booking {
  id: string;
  marketCode: string;
  status: string;
  period: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  withDriver: boolean;
  licence: string | null;
  notes: string | null;
  hasLicenceFile: boolean;
  /** ISO, while the vehicle is held for an unpaid customer. */
  reservedUntil: string | null;
  /** "6 hr", "2 days" — computed on the server, which is where the clock is. */
  heldFor: string | null;
  hasInsuranceFile: boolean;
  insuranceChoice: string | null;
  insurer: string | null;
  policyNo: string | null;
  injuryCoverCharge: string | null;
  documentsVerifiedAt: string | null;
  documentsVerifiedByEmail: string | null;
  documentsRejectedReason: string | null;
  total: string;
  deposit: string | null;
  createdAt: string;
}

/**
 * The ordinary next step, offered as a prominent button.
 *
 * Returned used to be a dead end and cancelled nearly so, which meant a single
 * mis-click was permanent: marking a week-long rental "returned" on its second
 * day left no way back to active, and the record then said a car was in the
 * yard while it was still on the road. Forward moves stay here; every other
 * state is reachable through Correct status below, which is deliberately one
 * extra click so it is never hit by accident.
 */
const NEXT: Record<string, string[]> = {
  quote: ["confirmed", "cancelled"],
  confirmed: ["active", "cancelled"],
  active: ["returned"],
  returned: [],
  cancelled: ["quote"],
};

const ALL_STATUSES = ["quote", "confirmed", "active", "returned", "cancelled"];

const TIMING_TONE: Record<number, string> = {
  0: "border-[var(--danger)]/50 text-[var(--danger)] bg-[var(--danger)]/10",
  1: "border-[var(--warning)]/50 text-[var(--warning)] bg-[var(--warning)]/10",
  2: "border-[var(--border-default)] text-[var(--text-secondary)]",
  3: "border-[var(--border-default)] text-[var(--text-muted)]",
};

const TONE: Record<string, string> = {
  quote: "text-[var(--warning)] border-[var(--warning)]/40",
  confirmed: "text-[var(--info)] border-[var(--info)]/40",
  active: "text-[var(--success)] border-[var(--success)]/40",
  returned: "text-[var(--text-muted)] border-[var(--border-default)]",
  cancelled: "text-[var(--text-muted)] border-[var(--border-default)]",
};

export function BookingRow({
  booking,
  vehicle,
  locale,
}: {
  booking: Booking;
  vehicle: { label: string; slug: string } | null;
  locale: string;
}) {
  const [state, action, pending] = useActionState(updateBookingStatus, null);
  useActionToast(state);
  const [correcting, setCorrecting] = useState(false);
  const options = NEXT[booking.status] ?? [];

  // Derived from the dates, never stored. The status says what staff
  // recorded; this says what the calendar thinks, and the gap between them
  // is the part worth seeing.
  const timing = timingLabel(bookingTiming(booking.period, booking.status));

  return (
    <li className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{booking.customerName}</span>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${TONE[booking.status]}`}>
              {booking.status}
            </span>
            <span className="text-xs uppercase text-[var(--text-muted)]">{booking.marketCode}</span>
            {timing && (
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${TIMING_TONE[timing.urgency]}`}>
                {timing.text}
              </span>
            )}
            {booking.withDriver && (
              <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                with driver
              </span>
            )}
          </div>

          <p className="mt-1.5 text-sm font-medium tabular-nums">
            {formatRange(booking.period, locale, "→")}
          </p>

          {/* The agreement is per booking, so it lives on the booking. */}
          <p className="mt-2">
            <Link
              href={`/admin/rentals/${booking.id}/agreement`}
              className="inline-flex items-center gap-1.5 text-sm text-[var(--link)] hover:underline"
            >
              <i className="fas fa-file-contract" aria-hidden="true" />
              Rental agreement
            </Link>
          </p>

          {vehicle && (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              <Link
                href={`/${booking.marketCode}/rentals/${vehicle.slug}`}
                target="_blank"
                className="text-[var(--link)] hover:underline"
              >
                {vehicle.label}
              </Link>
            </p>
          )}

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a href={`tel:${booking.customerPhone}`} className="text-[var(--link)] hover:underline">
              {booking.customerPhone}
            </a>
            {booking.customerEmail && (
              <a href={`mailto:${booking.customerEmail}`} className="text-[var(--link)] hover:underline">
                {booking.customerEmail}
              </a>
            )}
            {booking.licence && (
              <span className="text-[var(--text-muted)]">Licence {booking.licence}</span>
            )}
            {booking.hasLicenceFile && <LicenceLink bookingId={booking.id} />}
            {booking.hasInsuranceFile && (
              <LicenceLink bookingId={booking.id} kind="insurance" />
            )}
            {booking.insurer && (
              <span className="text-[var(--text-muted)]">
                {booking.insurer}
                {booking.policyNo ? ` · ${booking.policyNo}` : ""}
              </span>
            )}
          </div>

          {booking.notes && (
            <p className="mt-2 whitespace-pre-line text-sm text-[var(--text-secondary)]">
              {booking.notes}
            </p>
          )}
        </div>

        <div className="text-right text-sm">
          <div className="font-bold tabular-nums">{booking.total}</div>
          {booking.injuryCoverCharge && (
            <div className="text-xs text-[var(--warning)]">
              incl. {booking.injuryCoverCharge} injury cover
            </div>
          )}
          {booking.deposit && (
            <div className="text-xs text-[var(--text-muted)]">+{booking.deposit} deposit</div>
          )}
        </div>
      </div>

      <HoldPanel booking={booking} />
      <DocumentCheck booking={booking} />

      {state?.error && (
        <p className="mt-3 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {state.error}
        </p>
      )}

      {options.length > 0 && (
        <form action={action} className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
          <input type="hidden" name="id" value={booking.id} />
          <span className="text-xs text-[var(--text-muted)]">Mark as</span>
          {options.map((s) => (
            <button
              key={s}
              type="submit"
              name="status"
              value={s}
              disabled={pending}
              className="rounded-full border border-[var(--border-default)] px-3 py-1 text-xs capitalize hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              {s}
            </button>
          ))}
          {booking.status === "quote" && (
            <span className="text-xs text-[var(--text-muted)]">
              Confirming reserves the vehicle and blocks overlapping bookings.
            </span>
          )}
        </form>
      )}

      {/* Any state, reachable. Behind a toggle so it is a decision rather than
          a stray click, but present — the forward-only flow made a wrong
          button press permanent. */}
      <div className={options.length > 0 ? "mt-2" : "mt-4 border-t border-[var(--border-subtle)] pt-3"}>
        <button
          type="button"
          onClick={() => setCorrecting((c) => !c)}
          className="text-xs text-[var(--text-muted)] underline underline-offset-2"
        >
          {correcting ? "Close" : "Correct status"}
        </button>

        {correcting && (
          <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={booking.id} />
            <span className="text-xs text-[var(--text-muted)]">Set to</span>
            {ALL_STATUSES.filter((s) => s !== booking.status).map((s) => (
              <button
                key={s}
                type="submit"
                name="status"
                value={s}
                disabled={pending}
                className="rounded-full border border-[var(--border-default)] px-3 py-1 text-xs capitalize hover:bg-[var(--surface-2)] disabled:opacity-50"
              >
                {s}
              </button>
            ))}
            <span className="w-full text-xs text-[var(--text-muted)]">
              For fixing a mistake. Confirming or activating still checks for
              clashing dates.
            </span>
          </form>
        )}
      </div>
    </li>
  );
}

/**
 * Whether anybody has actually looked at the documents.
 *
 * This is the whole reason the documents are collected. Payment confirms the
 * dates — the webhook marks a paid booking confirmed so the vehicle is held —
 * but it establishes nothing about the person. Before this existed, a renter
 * could pay online with an expired licence and a lapsed policy and the screen
 * would show a tidy confirmed booking ready to collect.
 *
 * So the unchecked state is deliberately loud, and it says what it means: do
 * not hand over the keys. A quiet "pending" badge is one somebody stops seeing
 * by the second week.
 */
function DocumentCheck({
  booking,
}: {
  booking: Pick<
    Booking,
    | "id"
    | "insuranceChoice"
    | "documentsVerifiedAt"
    | "documentsVerifiedByEmail"
    | "documentsRejectedReason"
  >;
}) {
  const [state, action, pending] = useActionState(reviewBookingDocuments, null);
  useActionToast(state);
  const [refusing, setRefusing] = useState(false);

  const verified = Boolean(booking.documentsVerifiedAt);
  const refused = Boolean(booking.documentsRejectedReason);

  if (verified) {
    return (
      <p className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3 text-sm text-[var(--success)]">
        <i className="fas fa-circle-check" aria-hidden="true" />
        Documents checked
        {booking.documentsVerifiedByEmail && (
          <span className="text-xs text-[var(--text-muted)]">
            by {booking.documentsVerifiedByEmail}
          </span>
        )}
        <InsuranceBadge choice={booking.insuranceChoice} />
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
      <div
        className={`rounded-lg border px-3 py-2 text-sm ${
          refused
            ? "border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)]"
            : "border-[var(--warning)]/40 bg-[var(--warning)]/10 text-[var(--warning)]"
        }`}
      >
        <p className="font-semibold">
          {refused
            ? "Documents refused — do not release the vehicle"
            : "Documents not checked yet — do not release the vehicle"}
        </p>
        {refused ? (
          <p className="mt-0.5 text-xs">{booking.documentsRejectedReason}</p>
        ) : (
          <p className="mt-0.5 text-xs">
            Open the licence above and check the name matches and it is in
            date for the whole hire.
            {booking.insuranceChoice === "own" &&
              " Check their insurance certificate too."}
            {booking.insuranceChoice === "declined" &&
              " They have no insurance of their own and have accepted that their injury is not covered."}
          </p>
        )}
      </div>

      {state?.fieldErrors?.reason && (
        <p className="mt-2 text-sm text-[var(--danger)]">
          {state.fieldErrors.reason[0]}
        </p>
      )}

      {refusing ? (
        <form action={action} className="mt-3 space-y-2">
          <input type="hidden" name="id" value={booking.id} />
          <input type="hidden" name="decision" value="rejected" />
          <label className="block text-xs text-[var(--text-muted)]">
            What is wrong — the customer is told this
            <textarea
              name="reason"
              rows={2}
              required
              maxLength={500}
              placeholder="The licence expires before the return date."
              className="mt-1 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg border border-[var(--danger)]/50 px-3 py-1.5 text-sm text-[var(--danger)] disabled:opacity-50"
            >
              Refuse the documents
            </button>
            <button
              type="button"
              onClick={() => setRefusing(false)}
              className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={action}>
            <input type="hidden" name="id" value={booking.id} />
            <input type="hidden" name="decision" value="verified" />
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-50"
            >
              {pending ? "Saving…" : "Documents are in order"}
            </button>
          </form>
          {!refused && (
            <button
              type="button"
              onClick={() => setRefusing(true)}
              className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm"
            >
              Something is wrong
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Which of the three positions this renter is in.
 *
 * Shown at the counter, because "declined" is a real and expected state
 * rather than a missing answer: somebody is about to be handed keys having
 * accepted that their own injury is not covered, and whoever hands them over
 * should know that without opening the record.
 */
function InsuranceBadge({ choice }: { choice: string | null }) {
  if (!choice) return null;
  const map: Record<string, { text: string; tone: string }> = {
    own: { text: "own insurance", tone: "success" },
    company: { text: "injury cover bought", tone: "success" },
    declined: { text: "no cover — accepted", tone: "warning" },
  };
  const m = map[choice];
  if (!m) return null;
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs border-[var(--${m.tone})]/40 text-[var(--${m.tone})]`}
    >
      {m.text}
    </span>
  );
}

/**
 * The car is being held for somebody who has not paid.
 *
 * Shown because it is the thing that decides whether a car can be promised to
 * the person on the phone. Before reservations existed an unpaid quote held
 * nothing, so this screen never had to say anything about it; now a quote can
 * be the reason a week is unavailable, and that has to be visible rather than
 * discovered by a constraint error.
 */
function HoldPanel({
  booking,
}: {
  booking: Pick<Booking, "id" | "status" | "reservedUntil" | "heldFor">;
}) {
  const [state, action, pending] = useActionState(adjustHold, null);
  useActionToast(state);

  // `heldFor` is computed on the server rather than from Date.now() here.
  // Reading the clock during render is impure — the compiler rejects it, and
  // rightly: the value would differ between the server's HTML and the
  // browser's first paint.
  if (booking.status !== "quote" || !booking.reservedUntil || !booking.heldFor) {
    return null;
  }

  const until = new Date(booking.reservedUntil);
  const left = booking.heldFor;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--border-subtle)] pt-3">
      <span className="rounded-full border border-[var(--warning)]/40 px-2.5 py-0.5 text-xs text-[var(--warning)]">
        <i className="fas fa-lock" aria-hidden="true" /> Held, unpaid — {left}{" "}
        left
      </span>
      <span className="text-xs text-[var(--text-muted)]">
        until{" "}
        {until.toLocaleString(undefined, {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        })}
      </span>

      <form action={action} className="inline">
        <input type="hidden" name="id" value={booking.id} />
        <input type="hidden" name="action" value="extend" />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-[var(--border-default)] px-2.5 py-1 text-xs disabled:opacity-50"
        >
          Extend
        </button>
      </form>

      <form action={action} className="inline">
        <input type="hidden" name="id" value={booking.id} />
        <input type="hidden" name="action" value="release" />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-[var(--border-default)] px-2.5 py-1 text-xs disabled:opacity-50"
        >
          Release the dates
        </button>
      </form>
    </div>
  );
}
