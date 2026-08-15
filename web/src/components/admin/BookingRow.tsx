"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateBookingStatus } from "@/lib/actions/rentals";
import { formatRange } from "@/lib/pgRange";

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
  total: string;
  deposit: string | null;
  createdAt: string;
}

const NEXT: Record<string, string[]> = {
  quote: ["confirmed", "cancelled"],
  confirmed: ["active", "cancelled"],
  active: ["returned"],
  returned: [],
  cancelled: ["quote"],
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
  const options = NEXT[booking.status] ?? [];

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
            {booking.withDriver && (
              <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                with driver
              </span>
            )}
          </div>

          <p className="mt-1.5 text-sm font-medium tabular-nums">
            {formatRange(booking.period, locale, "→")}
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
          </div>

          {booking.notes && (
            <p className="mt-2 whitespace-pre-line text-sm text-[var(--text-secondary)]">
              {booking.notes}
            </p>
          )}
        </div>

        <div className="text-right text-sm">
          <div className="font-bold tabular-nums">{booking.total}</div>
          {booking.deposit && (
            <div className="text-xs text-[var(--text-muted)]">+{booking.deposit} deposit</div>
          )}
        </div>
      </div>

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
    </li>
  );
}
