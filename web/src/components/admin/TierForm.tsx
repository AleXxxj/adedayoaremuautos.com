"use client";

import { useActionState, useState } from "react";
import { saveTier, type TierResult } from "@/lib/actions/tiers";
import { MARKETS, type MarketCode } from "@/lib/market";
import { formatMoney, fromMajor, type CurrencyCode } from "@/lib/money";
import { pathToOwnership } from "@/lib/rentToOwn";

export interface TierDefaults {
  id?: string;
  marketCode: MarketCode;
  name?: string;
  tagline?: string | null;
  position?: number;
  daily?: number | "";
  weekly?: number | "";
  monthly?: number | "";
  ownershipThreshold?: number | "";
  deposit?: number | "";
  isActive?: boolean;
}

/**
 * Create or edit a rent-to-own category.
 *
 * The consequence panel is the point of this screen. Setting a daily rate, a
 * weekly rate and a threshold decides how long a customer hires before the
 * vehicle becomes theirs, and that relationship is not obvious — $40 a day
 * against $5,000 looks like 125 days until you notice the weekly rate is
 * cheaper and the honest answer is 140. Showing it as the numbers are typed
 * means nobody publishes a promise they did not intend to make.
 */
export function TierForm({
  defaults,
  onDone,
}: {
  defaults: TierDefaults;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState<TierResult | null, FormData>(
    saveTier,
    null,
  );

  const [daily, setDaily] = useState(String(defaults.daily ?? ""));
  const [weekly, setWeekly] = useState(String(defaults.weekly ?? ""));
  const [monthly, setMonthly] = useState(String(defaults.monthly ?? ""));
  const [threshold, setThreshold] = useState(String(defaults.ownershipThreshold ?? ""));

  const market = MARKETS[defaults.marketCode];
  const currency = market.currency as CurrencyCode;
  const err = (f: string) => state?.fieldErrors?.[f]?.[0];

  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  // Mirrors the server and the database, so the warning appears while typing
  // rather than after a failed save.
  const d = num(daily);
  const w = num(weekly);
  const m = num(monthly);
  const t = num(threshold);

  const weekTooDear = d != null && w != null && w > d * 7;
  const monthTooDear = w != null && m != null && m > w * 4;

  const preview =
    d != null && d > 0 && t != null && t > 0 && !weekTooDear && !monthTooDear
      ? pathToOwnership({
          slug: "preview",
          name: "preview",
          tagline: null,
          dailyMinor: fromMajor(d, currency).minor,
          weeklyMinor: w == null ? null : fromMajor(w, currency).minor,
          monthlyMinor: m == null ? null : fromMajor(m, currency).minor,
          ownershipThresholdMinor: fromMajor(t, currency).minor,
          depositMinor: 0,
          currency,
        })
      : null;

  if (state?.ok) {
    return (
      <p className="rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 px-4 py-3 text-sm text-[var(--success)]">
        Saved.{" "}
        <button type="button" className="underline" onClick={onDone}>
          Close
        </button>
      </p>
    );
  }

  return (
    <form action={action} className="space-y-5">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      <input type="hidden" name="marketCode" value={defaults.marketCode} />

      {state?.error && (
        <p className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {state.error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category name" error={err("name")}>
          <input
            name="name"
            defaultValue={defaults.name ?? ""}
            placeholder="Comfort"
            required
            className={input}
          />
        </Field>

        <Field label="Display order" error={err("position")}>
          <input
            name="position"
            type="number"
            min={0}
            max={99}
            defaultValue={defaults.position ?? 0}
            className={input}
          />
        </Field>
      </div>

      <Field label="Tagline (optional)">
        <input
          name="tagline"
          defaultValue={defaults.tagline ?? ""}
          placeholder="More space and a quieter ride"
          className={input}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={`Daily rate (${currency})`} error={err("daily")}>
          <input
            name="daily"
            type="number"
            step="0.01"
            min="0.01"
            value={daily}
            onChange={(e) => setDaily(e.target.value)}
            required
            className={input}
          />
        </Field>

        <Field
          label={`Weekly rate (${currency})`}
          error={err("weekly") ?? (weekTooDear ? `More than 7 days at ${daily}` : undefined)}
        >
          <input
            name="weekly"
            type="number"
            step="0.01"
            min="0"
            value={weekly}
            onChange={(e) => setWeekly(e.target.value)}
            className={input}
          />
          <Hint>Leave blank if this category is daily only.</Hint>
        </Field>

        <Field
          label={`Monthly rate (${currency})`}
          error={err("monthly") ?? (monthTooDear ? "More than 4 weeks" : undefined)}
        >
          <input
            name="monthly"
            type="number"
            step="0.01"
            min="0"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            className={input}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Total rent to own (${currency})`} error={err("ownershipThreshold")}>
          <input
            name="ownershipThreshold"
            type="number"
            step="0.01"
            min="0"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className={input}
          />
          <Hint>
            Leave blank for hire only — the category will not offer ownership.
          </Hint>
        </Field>

        <Field label={`Deposit (${currency})`} error={err("deposit")}>
          <input
            name="deposit"
            type="number"
            step="0.01"
            min="0"
            defaultValue={defaults.deposit ?? 0}
            className={input}
          />
          <Hint>Refundable. Never counts towards ownership.</Hint>
        </Field>
      </div>

      {/* What the numbers above actually promise a customer. */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4 text-sm">
        <p className="mb-2 font-semibold">What this publishes</p>
        {preview ? (
          <p className="text-[var(--text-secondary)]">
            A customer hiring continuously owns the vehicle after{" "}
            <strong className="text-[var(--text-primary)]">{preview.days} days</strong>{" "}
            (about {Math.round(preview.days / 7)} weeks), having paid{" "}
            <strong className="text-[var(--text-primary)]">
              {formatMoney(preview.totalPaid, market.locale)}
            </strong>
            {preview.overshoot.minor > 0 && (
              <>
                {" "}
                — {formatMoney(preview.overshoot, market.locale)} more than the
                threshold, because the last booking crosses the line
              </>
            )}
            .
          </p>
        ) : (
          <p className="text-[var(--text-muted)]">
            Enter a daily rate and a total to own to see how long it takes.
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          value="true"
          defaultChecked={defaults.isActive ?? true}
          className="size-4"
        />
        Show this category on the public site
      </label>

      <div className="flex gap-3 border-t border-[var(--border-subtle)] pt-5">
        <button
          type="submit"
          disabled={pending || weekTooDear || monthTooDear}
          className="rounded-lg bg-[var(--cta-bg)] px-6 py-2.5 font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)] disabled:opacity-60"
        >
          {pending ? "Saving…" : defaults.id ? "Save changes" : "Add category"}
        </button>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg border border-[var(--border-default)] px-5 py-2.5 text-sm"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

const input =
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

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="mt-1 block text-xs text-[var(--text-muted)]">{children}</span>;
}
