"use client";

import { useActionState, useState } from "react";
import { saveTariff } from "@/lib/actions/tariff";

export interface TariffDefaults {
  inFleet: boolean;
  daily: number;
  weekly: number | "";
  monthly: number | "";
  deposit: number;
  minDays: number;
  maxDays: number | "";
  withDriver: boolean;
  driverDaily: number | "";
}

export function TariffForm({
  vehicleId,
  currency,
  defaults,
}: {
  vehicleId: string;
  currency: string;
  defaults: TariffDefaults;
}) {
  const [state, action, pending] = useActionState(saveTariff, null);
  const [inFleet, setInFleet] = useState(defaults.inFleet);
  const [withDriver, setWithDriver] = useState(defaults.withDriver);

  const err = (f: string) => state?.fieldErrors?.[f]?.[0];

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      {inFleet && <input type="hidden" name="inFleet" value="true" />}
      {withDriver && <input type="hidden" name="withDriver" value="true" />}

      {state?.error && (
        <p className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 px-4 py-3 text-sm text-[var(--success)]">
          Tariff saved.
        </p>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={inFleet}
          onChange={(e) => setInFleet(e.target.checked)}
          className="size-4"
        />
        Offer this vehicle for hire
      </label>

      {inFleet && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={`Daily (${currency})`} error={err("daily")}>
              <input name="daily" type="number" step="0.01" min="0" defaultValue={defaults.daily} className={inp} />
            </Field>
            <Field label={`Weekly (${currency})`}>
              <input name="weekly" type="number" step="0.01" min="0" defaultValue={defaults.weekly} className={inp} />
            </Field>
            <Field label={`Monthly (${currency})`}>
              <input name="monthly" type="number" step="0.01" min="0" defaultValue={defaults.monthly} className={inp} />
            </Field>
            <Field label={`Deposit (${currency})`}>
              <input name="deposit" type="number" step="0.01" min="0" defaultValue={defaults.deposit} className={inp} />
            </Field>
            <Field label="Minimum days">
              <input name="minDays" type="number" min="1" defaultValue={defaults.minDays} className={inp} />
            </Field>
            <Field label="Maximum days" error={err("maxDays")}>
              <input name="maxDays" type="number" min="1" defaultValue={defaults.maxDays} className={inp} />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={withDriver}
              onChange={(e) => setWithDriver(e.target.checked)}
              className="size-4"
            />
            A driver can be provided
          </label>

          {withDriver && (
            <Field label={`Driver, per day (${currency})`} error={err("driverDaily")}>
              <input
                name="driverDaily"
                type="number"
                step="0.01"
                min="0"
                defaultValue={defaults.driverDaily}
                className={`${inp} max-w-xs`}
              />
            </Field>
          )}

          <p className="text-xs text-[var(--text-muted)]">
            Leave weekly or monthly blank to omit that tier. Customers are always
            quoted the cheapest combination of the tiers you set, so a six-day
            hire is priced as a week when that costs less.
          </p>
        </>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--cta-bg)] px-5 py-2.5 text-sm font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)] disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save tariff"}
      </button>
    </form>
  );
}

const inp =
  "w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 outline-none focus:border-[var(--focus)]";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {error && <span className="mt-1 block text-sm text-[var(--danger)]">{error}</span>}
    </label>
  );
}
