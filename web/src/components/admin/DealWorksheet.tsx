"use client";

import { useActionState, useMemo, useState } from "react";
import { saveDealWorksheet, type DealResult } from "@/lib/actions/deals";
import { computeDeal, type Fee } from "@/lib/deal";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import type { MarketConfig } from "@/lib/market";

interface Props {
  dealId: string;
  market: MarketConfig;
  readOnly: boolean;
  initial: {
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    vehiclePrice: number;
    tradeInDescription: string;
    tradeInAllowance: number;
    tradeInPayoff: number;
    downPayment: number;
    taxRatePercent: number;
    isFinanced: boolean;
    aprPercent: number;
    termMonths: number;
    fees: { label: string; amount: number; taxable: boolean }[];
  };
}

export function DealWorksheet({ dealId, market, readOnly, initial }: Props) {
  const [state, action, pending] = useActionState<DealResult | null, FormData>(
    saveDealWorksheet,
    null,
  );

  const [v, setV] = useState(initial);
  const [fees, setFees] = useState(initial.fees);

  const cur = market.currency as CurrencyCode;
  const num = (x: number) => (Number.isFinite(x) ? x : 0);

  /**
   * Live preview only. The server recomputes all of this from the submitted
   * values before writing — the browser never decides what a customer owes.
   */
  const preview = useMemo(() => {
    const toMinor = (n: number) => Math.round(num(n) * 100);
    return computeDeal({
      currency: cur,
      vehiclePriceMinor: toMinor(v.vehiclePrice),
      tradeInAllowanceMinor: toMinor(v.tradeInAllowance),
      tradeInPayoffMinor: toMinor(v.tradeInPayoff),
      downPaymentMinor: toMinor(v.downPayment),
      fees: fees.map<Fee>((f) => ({
        label: f.label,
        amountMinor: toMinor(f.amount),
        taxable: f.taxable,
      })),
      taxRateBps: Math.round(num(v.taxRatePercent) * 100),
      isFinanced: v.isFinanced,
      aprBps: Math.round(num(v.aprPercent) * 100),
      termMonths: Math.round(num(v.termMonths)),
      tradeReducesTaxableBase: market.compliance.monthlyPaymentRequiresDisclosure,
    });
  }, [v, fees, cur, market]);

  const fmt = (m: { minor: number; currency: CurrencyCode }) =>
    formatMoney(m, market.locale, { showDecimals: true });

  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) =>
    setV((prev) => ({ ...prev, [k]: value }));

  return (
    <form action={action} className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <input type="hidden" name="id" value={dealId} />
      <input type="hidden" name="feesJson" value={JSON.stringify(fees)} />
      {v.isFinanced && <input type="hidden" name="isFinanced" value="true" />}

      <div className="space-y-8">
        {state?.error && (
          <p className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p className="rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 px-4 py-3 text-sm text-[var(--success)]">
            Worksheet saved.
          </p>
        )}

        <Group title="Customer">
          <Field label="Name">
            <input name="customerName" defaultValue={initial.customerName} disabled={readOnly} className={inp} />
          </Field>
          <Field label="Phone">
            <input name="customerPhone" defaultValue={initial.customerPhone} disabled={readOnly} className={inp} />
          </Field>
          <Field label="Email">
            <input name="customerEmail" type="email" defaultValue={initial.customerEmail} disabled={readOnly} className={inp} />
          </Field>
        </Group>

        <Group title={`Vehicle & trade (${cur})`}>
          <Field label="Agreed selling price">
            <Num name="vehiclePrice" value={v.vehiclePrice} onChange={(n) => set("vehiclePrice", n)} disabled={readOnly} />
          </Field>
          <Field label="Trade-in description" wide>
            <input name="tradeInDescription" defaultValue={initial.tradeInDescription} disabled={readOnly} className={inp} placeholder="2014 Honda Accord, 120k mi" />
          </Field>
          <Field label="Trade allowance">
            <Num name="tradeInAllowance" value={v.tradeInAllowance} onChange={(n) => set("tradeInAllowance", n)} disabled={readOnly} />
          </Field>
          <Field label="Trade payoff (owed to their lender)">
            <Num name="tradeInPayoff" value={v.tradeInPayoff} onChange={(n) => set("tradeInPayoff", n)} disabled={readOnly} />
          </Field>
          <Field label="Down payment">
            <Num name="downPayment" value={v.downPayment} onChange={(n) => set("downPayment", n)} disabled={readOnly} />
          </Field>
          <Field label="Tax rate %">
            <Num name="taxRatePercent" value={v.taxRatePercent} step="0.001" onChange={(n) => set("taxRatePercent", n)} disabled={readOnly} />
            {market.code === "us" && (
              <Hint>NC highway use tax is 3%. Trade-in reduces the taxable amount.</Hint>
            )}
          </Field>
        </Group>

        <fieldset>
          <legend className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Fees
          </legend>
          <div className="space-y-2">
            {fees.map((f, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input
                  value={f.label}
                  disabled={readOnly}
                  onChange={(e) =>
                    setFees(fees.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                  }
                  className={`${inp} flex-1 min-w-[160px]`}
                  placeholder="Fee name"
                />
                <input
                  type="number"
                  step="0.01"
                  value={f.amount}
                  disabled={readOnly}
                  onChange={(e) =>
                    setFees(fees.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))
                  }
                  className={`${inp} w-32`}
                />
                <label className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={f.taxable}
                    disabled={readOnly}
                    onChange={(e) =>
                      setFees(fees.map((x, j) => (j === i ? { ...x, taxable: e.target.checked } : x)))
                    }
                    className="size-4"
                  />
                  taxable
                </label>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setFees(fees.filter((_, j) => j !== i))}
                    className="text-sm text-[var(--danger)] hover:underline"
                  >
                    remove
                  </button>
                )}
              </div>
            ))}
            {!readOnly && (
              <button
                type="button"
                onClick={() => setFees([...fees, { label: "", amount: 0, taxable: false }])}
                className="text-sm text-[var(--link)] hover:underline"
              >
                + add fee
              </button>
            )}
          </div>
        </fieldset>

        <Group title="Financing">
          <label className="flex items-center gap-2 text-sm sm:col-span-3">
            <input
              type="checkbox"
              checked={v.isFinanced}
              disabled={readOnly}
              onChange={(e) => set("isFinanced", e.target.checked)}
              className="size-4"
            />
            This deal is financed
          </label>
          {v.isFinanced && (
            <>
              <Field label={market.financing.quotesApr ? "APR %" : "Interest %"}>
                <Num name="aprPercent" value={v.aprPercent} step="0.01" onChange={(n) => set("aprPercent", n)} disabled={readOnly} />
              </Field>
              <Field label="Term (months)">
                <select
                  name="termMonths"
                  value={v.termMonths}
                  disabled={readOnly}
                  onChange={(e) => set("termMonths", Number(e.target.value))}
                  className={inp}
                >
                  {market.financing.termMonths.map((t) => (
                    <option key={t} value={t}>{t} months</option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </Group>

        {!readOnly && (
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--cta-bg)] px-6 py-2.5 font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)] disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save worksheet"}
          </button>
        )}
      </div>

      {/* ── Live out-the-door ────────────────────────────────────────────── */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Out the door
          </h3>

          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Vehicle" value={fmt(preview.vehiclePrice)} />
            <Row label="Fees" value={fmt(preview.feesTotal)} />
            <Row
              label={`Tax on ${fmt(preview.taxableBase)}`}
              value={fmt(preview.tax)}
            />
            <div className="border-t border-[var(--border-default)] pt-2">
              <Row label="Total" value={fmt(preview.outTheDoor)} strong />
            </div>

            <div className="pt-2">
              <Row label="Trade allowance" value={`− ${fmt(preview.tradeInAllowance)}`} />
              {preview.tradeInPayoff.minor > 0 && (
                <Row label="Trade payoff" value={`+ ${fmt(preview.tradeInPayoff)}`} />
              )}
              <Row label="Down payment" value={`− ${fmt(preview.downPayment)}`} />
            </div>

            <div className="border-t border-[var(--border-default)] pt-2">
              <Row label="Amount financed" value={fmt(preview.amountFinanced)} strong />
            </div>

            {preview.monthlyPayment && (
              <div className="border-t border-[var(--border-default)] pt-2">
                <Row
                  label={`${v.termMonths} monthly payments`}
                  value={fmt(preview.monthlyPayment)}
                  strong
                />
                {preview.financeCharge && (
                  <Row label="Finance charge" value={fmt(preview.financeCharge)} />
                )}
              </div>
            )}
          </dl>

          {preview.hasNegativeEquity && (
            <p className="mt-4 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-3 py-2 text-xs text-[var(--warning)]">
              Negative equity of {fmt({ minor: -preview.netTradeEquity.minor, currency: cur })} —
              the customer owes more than the trade is worth. It has been rolled
              into the amount financed.
            </p>
          )}

          <p className="mt-4 text-[11px] leading-snug text-[var(--text-muted)]">
            Live preview. The saved figures are recalculated on the server from
            these inputs.
          </p>
        </div>
      </aside>
    </form>
  );
}

const inp =
  "rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 outline-none focus:border-[var(--focus)] disabled:opacity-60";

function Num({
  name,
  value,
  onChange,
  step = "0.01",
  disabled,
}: {
  name: string;
  value: number;
  onChange: (n: number) => void;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <input
      name={name}
      type="number"
      step={step}
      min="0"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`${inp} w-full`}
    />
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
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
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${wide ? "sm:col-span-2 lg:col-span-3" : ""}`}>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="mt-1 block text-xs text-[var(--text-muted)]">{children}</span>;
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={strong ? "font-semibold" : "text-[var(--text-secondary)]"}>{label}</dt>
      <dd className={strong ? "font-bold tabular-nums" : "tabular-nums"}>{value}</dd>
    </div>
  );
}
