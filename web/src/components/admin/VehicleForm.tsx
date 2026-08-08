"use client";

import { useActionState, useState } from "react";
import { MARKETS, type MarketCode } from "@/lib/market";
import type { ActionResult } from "@/lib/actions/vehicles";

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

export interface VehicleDefaults {
  id?: string;
  marketCode?: MarketCode;
  make?: string;
  model?: string;
  trim?: string | null;
  year?: number;
  vin?: string | null;
  chassisNo?: string | null;
  stockNumber?: string | null;
  condition?: string;
  mileage?: number | null;
  transmission?: string | null;
  fuelType?: string | null;
  drivetrain?: string | null;
  engine?: string | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  bodyStyle?: string | null;
  priceMajor?: number | null;
  headline?: string | null;
  description?: string | null;
  historyReportUrl?: string | null;
  status?: string;
  isFeatured?: boolean;
}

export function VehicleForm({
  action,
  defaults = {},
  markets,
  submitLabel,
}: {
  action: Action;
  defaults?: VehicleDefaults;
  markets: MarketCode[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [market, setMarket] = useState<MarketCode>(
    defaults.marketCode ?? markets[0],
  );

  const cfg = MARKETS[market];
  const err = (f: string) => state?.fieldErrors?.[f]?.[0];

  return (
    <form action={formAction} className="space-y-8">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}

      {state?.error && (
        <p className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 px-4 py-3 text-sm text-[var(--success)]">
          Saved.
        </p>
      )}

      <Section title="Market & identity">
        <Field label="Market" error={err("marketCode")}>
          <select
            name="marketCode"
            value={market}
            onChange={(e) => setMarket(e.target.value as MarketCode)}
            disabled={Boolean(defaults.id)}
            className={input}
          >
            {markets.map((m) => (
              <option key={m} value={m}>
                {MARKETS[m].name} ({MARKETS[m].currency})
              </option>
            ))}
          </select>
          {defaults.id && (
            <Hint>
              A vehicle cannot change market — prices and units are market-bound.
            </Hint>
          )}
        </Field>

        {/* The identifier field follows the market, because a VIN and a chassis
            number are genuinely different things, not a relabelled input. */}
        {cfg.usesVin ? (
          <Field label="VIN (17 characters)" error={err("vin")}>
            <input
              name="vin"
              defaultValue={defaults.vin ?? ""}
              maxLength={17}
              placeholder="1HGBH41JXMN109186"
              className={`${input} font-mono uppercase`}
            />
            <Hint>Letters I, O and Q are never used in a VIN.</Hint>
          </Field>
        ) : (
          <Field label="Chassis number" error={err("chassisNo")}>
            <input
              name="chassisNo"
              defaultValue={defaults.chassisNo ?? ""}
              className={`${input} font-mono uppercase`}
            />
          </Field>
        )}

        <Field label="Stock number (optional)">
          <input
            name="stockNumber"
            defaultValue={defaults.stockNumber ?? ""}
            className={input}
          />
        </Field>
      </Section>

      <Section title="Vehicle">
        <Field label="Year" error={err("year")}>
          <input
            name="year"
            type="number"
            defaultValue={defaults.year ?? ""}
            required
            className={input}
          />
        </Field>
        <Field label="Make" error={err("make")}>
          <input name="make" defaultValue={defaults.make ?? ""} required className={input} />
        </Field>
        <Field label="Model" error={err("model")}>
          <input name="model" defaultValue={defaults.model ?? ""} required className={input} />
        </Field>
        <Field label="Trim (optional)">
          <input name="trim" defaultValue={defaults.trim ?? ""} className={input} />
        </Field>

        <Field label="Condition" error={err("condition")}>
          <select name="condition" defaultValue={defaults.condition ?? ""} className={input}>
            <option value="">Select…</option>
            {cfg.conditions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`Mileage (${cfg.distanceUnit})`} error={err("mileage")}>
          <input
            name="mileage"
            type="number"
            defaultValue={defaults.mileage ?? ""}
            className={input}
          />
        </Field>

        <Field label="Transmission">
          <input name="transmission" defaultValue={defaults.transmission ?? ""} className={input} />
        </Field>
        <Field label="Fuel">
          <input name="fuelType" defaultValue={defaults.fuelType ?? ""} className={input} />
        </Field>
        <Field label="Drivetrain">
          <input name="drivetrain" defaultValue={defaults.drivetrain ?? ""} className={input} />
        </Field>
        <Field label="Engine">
          <input name="engine" defaultValue={defaults.engine ?? ""} className={input} />
        </Field>
        <Field label="Exterior colour">
          <input name="exteriorColor" defaultValue={defaults.exteriorColor ?? ""} className={input} />
        </Field>
        <Field label="Interior colour">
          <input name="interiorColor" defaultValue={defaults.interiorColor ?? ""} className={input} />
        </Field>
        <Field label="Body style">
          <input name="bodyStyle" defaultValue={defaults.bodyStyle ?? ""} className={input} />
        </Field>
      </Section>

      <Section title="Pricing & listing">
        <Field label={`Price (${cfg.currency})`} error={err("price")}>
          <input
            name="price"
            type="number"
            step="0.01"
            defaultValue={defaults.priceMajor ?? ""}
            placeholder={cfg.currency === "USD" ? "28500" : "15000000"}
            className={input}
          />
          <Hint>
            Enter the full amount in {cfg.currency}, not minor units.
          </Hint>
        </Field>

        <Field label="Status" error={err("status")}>
          <select name="status" defaultValue={defaults.status ?? "draft"} className={input}>
            <option value="draft">Draft — not public</option>
            <option value="available">Available — live on the site</option>
            <option value="pending">Sale pending — still visible</option>
            <option value="sold">Sold — removed from the site</option>
            <option value="unlisted">Unlisted — hidden, kept on record</option>
          </select>
        </Field>

        {cfg.expectsHistoryReport && (
          <Field label="History report URL" error={err("historyReportUrl")}>
            <input
              name="historyReportUrl"
              type="url"
              defaultValue={defaults.historyReportUrl ?? ""}
              placeholder="https://www.carfax.com/VehicleHistory/…"
              className={input}
            />
            <Hint>US buyers expect a Carfax or AutoCheck link.</Hint>
          </Field>
        )}

        <Field label="Headline (optional)" full>
          <input name="headline" defaultValue={defaults.headline ?? ""} className={input} />
        </Field>

        <Field label="Description" full>
          <textarea
            name="description"
            rows={5}
            defaultValue={defaults.description ?? ""}
            className={input}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isFeatured"
            value="true"
            defaultChecked={defaults.isFeatured}
            className="size-4"
          />
          Feature this vehicle on the homepage
        </label>
      </Section>

      <div className="flex gap-3 border-t border-[var(--border-subtle)] pt-6">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--cta-bg)] px-6 py-2.5 font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)] disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

const input =
  "w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 outline-none focus:border-[var(--focus)]";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {title}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  error,
  full,
  children,
}: {
  label: string;
  error?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2 lg:col-span-3" : ""}`}>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {error && <span className="mt-1 block text-sm text-[var(--danger)]">{error}</span>}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="mt-1 block text-xs text-[var(--text-muted)]">{children}</span>;
}
