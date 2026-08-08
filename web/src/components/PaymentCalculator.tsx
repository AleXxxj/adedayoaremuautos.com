"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  fromMajor,
  formatMoney,
  monthlyPayment,
  totalInterest,
  money,
  subtract,
} from "@/lib/money";
import type { MarketConfig } from "@/lib/market";

/**
 * Interactive financing calculator.
 *
 * Runs the same amortisation function the rest of the platform uses, so the
 * figure a customer sees here is the figure a salesperson sees. Nothing is
 * approximated for display.
 *
 * The disclosure is not optional in markets that require one — the same rule
 * that governs PaymentDisplay applies here, because this shows a monthly
 * payment and that is a triggering term under Reg Z.
 */
export function PaymentCalculator({
  market,
  defaultPrice,
  tone = "dark",
}: {
  market: MarketConfig;
  defaultPrice?: number;
  tone?: "dark" | "light";
}) {
  const isNg = market.currency === "NGN";
  const initialPrice = defaultPrice ?? (isNg ? 15_000_000 : 25_000);

  const [price, setPrice] = useState(initialPrice);
  const [downPct, setDownPct] = useState(isNg ? 30 : 10);
  const [term, setTerm] = useState(market.financing.termMonths[isNg ? 2 : 3]);
  const [apr, setApr] = useState(market.financing.quotesApr ? 7.9 : 0);

  const result = useMemo(() => {
    const total = fromMajor(price, market.currency);
    const down = money(Math.round((total.minor * downPct) / 100), market.currency);
    const financed = subtract(total, down);
    const perMonth = monthlyPayment(financed, apr, term);
    const interest = totalInterest(financed, apr, term);
    return { total, down, financed, perMonth, interest };
  }, [price, downPct, term, apr, market.currency]);

  const fmt = (m: Parameters<typeof formatMoney>[0]) =>
    formatMoney(m, market.locale);

  const priceMax = isNg ? 60_000_000 : 100_000;
  const priceStep = isNg ? 250_000 : 500;

  const border = tone === "light" ? "border-black/10" : "border-[var(--border-subtle)]";

  return (
    <div className={`rounded-2xl border ${border} bg-[var(--surface-1)] p-6 sm:p-8`}>
      <div className="mb-6">
        <h3 className="text-lg font-semibold">What would it cost a month?</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {isNg
            ? "Move the sliders. Our in-house plans run interest-free over the term."
            : "Move the sliders to see how price, deposit and term change the payment."}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_auto]">
        <div className="space-y-6">
          <Slider
            label="Vehicle price"
            value={fmt(result.total)}
            min={isNg ? 1_000_000 : 3_000}
            max={priceMax}
            step={priceStep}
            current={price}
            onChange={setPrice}
          />

          <Slider
            label="Deposit"
            value={`${downPct}% · ${fmt(result.down)}`}
            min={0}
            max={70}
            step={5}
            current={downPct}
            onChange={setDownPct}
          />

          <div>
            <span className="mb-2 block text-sm font-medium">Term</span>
            <div className="flex flex-wrap gap-2">
              {market.financing.termMonths.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTerm(t)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    term === t
                      ? "border-transparent bg-[var(--cta-bg)] font-semibold text-[var(--cta-fg)]"
                      : `${border} text-[var(--text-secondary)] hover:bg-[var(--surface-2)]`
                  }`}
                >
                  {t} mo
                </button>
              ))}
            </div>
          </div>

          {market.financing.quotesApr && (
            <Slider
              label="APR"
              value={`${apr.toFixed(1)}%`}
              min={0}
              max={24}
              step={0.1}
              current={apr}
              onChange={setApr}
            />
          )}
        </div>

        <div className="lg:w-64">
          <div className={`rounded-xl border ${border} bg-[var(--surface-2)] p-5`}>
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Estimated monthly
            </span>
            <div className="mt-1 text-3xl font-bold tracking-tight text-[var(--brand-400)]">
              {fmt(result.perMonth)}
            </div>

            <dl className="mt-5 space-y-2 text-sm">
              <Row label="Amount financed" value={fmt(result.financed)} />
              <Row label="Deposit" value={fmt(result.down)} />
              {apr > 0 && <Row label="Total interest" value={fmt(result.interest)} />}
              <Row
                label="Total to pay"
                value={fmt(money(result.down.minor + result.perMonth.minor * term, market.currency))}
                strong
              />
            </dl>

            <Link
              href={`/${market.code}/contact?type=finance`}
              className="mt-5 block rounded-lg bg-[var(--cta-bg)] py-2.5 text-center text-sm font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)]"
            >
              Get pre-qualified
            </Link>
          </div>
        </div>
      </div>

      {market.compliance.monthlyPaymentRequiresDisclosure && (
        <p className="mt-6 border-t border-[var(--border-subtle)] pt-4 text-[11px] leading-snug text-[var(--text-muted)]">
          Estimate only, based on {fmt(result.financed)} financed at{" "}
          {apr.toFixed(2)}% APR over {term} months with {fmt(result.down)} down.
          Not an offer of credit or a commitment to lend. Actual terms depend on
          creditworthiness. Tax, title, registration and dealer fees are
          excluded.
        </p>
      )}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  current,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  current: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm font-semibold tabular-nums">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[var(--brand-500)]"
      />
    </label>
  );
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
    <div
      className={`flex justify-between gap-2 ${
        strong ? "border-t border-[var(--border-subtle)] pt-2 font-semibold" : ""
      }`}
    >
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
