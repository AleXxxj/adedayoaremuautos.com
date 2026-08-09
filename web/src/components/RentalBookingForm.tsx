"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { requestRental, type RentalResult } from "@/lib/actions/rentals";
import { quoteRental, rentalDays, RentalError, type RentalTariff } from "@/lib/rental";
import { formatMoney, money } from "@/lib/money";
import type { MarketConfig } from "@/lib/market";

const today = () => new Date().toISOString().slice(0, 10);

export function RentalBookingForm({
  market,
  vehicleSlug,
  tariff,
}: {
  market: MarketConfig;
  vehicleSlug: string;
  tariff: RentalTariff;
}) {
  const [state, action, pending] = useActionState<RentalResult | null, FormData>(
    requestRental,
    null,
  );

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [withDriver, setWithDriver] = useState(false);
  const [renderedAt, setRenderedAt] = useState(0);

  useEffect(() => setRenderedAt(Date.now()), []);

  /**
   * Preview only — the server prices the booking again from the same tariff
   * before writing. A quote assembled in the browser is not a price.
   */
  const preview = useMemo(() => {
    if (!from || !to) return null;
    const days = rentalDays(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`));
    if (days <= 0) return null;
    try {
      return { quote: quoteRental(tariff, days, { withDriver }), error: null as string | null };
    } catch (e) {
      return { quote: null, error: e instanceof RentalError ? e.message : "Cannot price those dates." };
    }
  }, [from, to, withDriver, tariff]);

  const fmt = (minor: number) =>
    formatMoney(money(minor, market.currency), market.locale, { showDecimals: true });

  if (state?.ok && state.reference && state.reference !== "—") {
    return (
      <div className="rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 p-5 text-center">
        <p className="font-semibold text-[var(--success)]">Request received</p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Your reference is{" "}
          <span className="font-mono font-semibold">{state.reference}</span>. We
          will confirm availability and the deposit shortly.
        </p>
      </div>
    );
  }

  const err = (f: string) => state?.fieldErrors?.[f]?.[0];

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="marketCode" value={market.code} />
      <input type="hidden" name="vehicleSlug" value={vehicleSlug} />
      <input type="hidden" name="renderedAt" value={renderedAt} />
      {withDriver && <input type="hidden" name="withDriver" value="true" />}

      <div aria-hidden className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state?.error && (
        <p className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Pick-up</span>
          <input
            name="from"
            type="date"
            required
            min={today()}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={inp}
          />
          {err("from") && <Err>{err("from")}</Err>}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Return</span>
          <input
            name="to"
            type="date"
            required
            min={from || today()}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={inp}
          />
          {err("to") && <Err>{err("to")}</Err>}
        </label>
      </div>

      {tariff.withDriverAvailable && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={withDriver}
            onChange={(e) => setWithDriver(e.target.checked)}
            className="size-4"
          />
          With a driver
          {tariff.driverDailyMinor != null && (
            <span className="text-[var(--text-muted)]">
              (+{fmt(tariff.driverDailyMinor)}/day)
            </span>
          )}
        </label>
      )}

      {/* Live quote */}
      {preview?.error && (
        <p className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-3 py-2 text-sm text-[var(--warning)]">
          {preview.error}
        </p>
      )}
      {preview?.quote && (
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
          <dl className="space-y-1.5 text-sm">
            {preview.quote.lines.map((l) => (
              <div key={l.tier} className="flex justify-between gap-3">
                <dt className="capitalize text-[var(--text-secondary)]">
                  {l.quantity} × {l.tier.replace("ly", "")}
                  {l.quantity > 1 ? "s" : ""} @ {fmt(l.unitMinor)}
                </dt>
                <dd className="tabular-nums">{fmt(l.subtotalMinor)}</dd>
              </div>
            ))}
            {preview.quote.driverMinor > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-secondary)]">
                  Driver × {preview.quote.days} days
                </dt>
                <dd className="tabular-nums">{fmt(preview.quote.driverMinor)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t border-[var(--border-default)] pt-1.5">
              <dt className="font-semibold">
                Total for {preview.quote.days} day{preview.quote.days === 1 ? "" : "s"}
              </dt>
              <dd className="font-bold tabular-nums">{fmt(preview.quote.totalMinor)}</dd>
            </div>
            {preview.quote.depositMinor > 0 && (
              <div className="flex justify-between gap-3 text-[var(--text-muted)]">
                <dt>Refundable deposit</dt>
                <dd className="tabular-nums">{fmt(preview.quote.depositMinor)}</dd>
              </div>
            )}
          </dl>
          {preview.quote.savingNote && (
            <p className="mt-2 text-xs text-[var(--success)]">{preview.quote.savingNote}</p>
          )}
        </div>
      )}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Your name</span>
        <input name="name" required autoComplete="name" className={inp} />
        {err("name") && <Err>{err("name")}</Err>}
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Phone</span>
        <input name="phone" type="tel" required autoComplete="tel" className={inp} />
        {err("phone") && <Err>{err("phone")}</Err>}
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          Email <span className="text-[var(--text-muted)]">(optional)</span>
        </span>
        <input name="email" type="email" autoComplete="email" className={inp} />
        {err("email") && <Err>{err("email")}</Err>}
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          Driving licence number{" "}
          <span className="text-[var(--text-muted)]">(optional)</span>
        </span>
        <input name="licenceNo" className={inp} />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          Anything else? <span className="text-[var(--text-muted)]">(optional)</span>
        </span>
        <textarea name="note" rows={3} className={inp} />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[var(--cta-bg)] py-3 font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)] disabled:opacity-60"
      >
        {pending ? "Sending…" : "Request booking"}
      </button>

      <p className="text-xs text-[var(--text-muted)]">
        Sending a request does not hold the vehicle. We confirm availability and
        take the deposit first.
      </p>
    </form>
  );
}

const inp =
  "w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2.5 outline-none focus:border-[var(--focus)]";

function Err({ children }: { children: React.ReactNode }) {
  return <span className="mt-1 block text-sm text-[var(--danger)]">{children}</span>;
}
