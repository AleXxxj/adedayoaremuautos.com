"use client";

import { useId, useMemo, useState } from "react";
import { fromMajor, formatMoney, monthlyPayment, money, type CurrencyCode } from "@/lib/money";
import { MARKETS, type MarketCode } from "@/lib/market";

/**
 * What this car might cost a month: the car page's payment estimate.
 *
 * The same sum as the calculator it replaces (LegacyCalculator) and as the
 * financing page, the sales worksheet and the ledger: `monthlyPayment` on
 * the price less the down payment. So the figure a buyer sees here is the
 * figure they would be quoted on those terms.
 *
 * Made for a thumb. The price is this car's, so it is not a box to fill in;
 * the down payment is a slider, the term a row of chips, and the rate has
 * plus and minus buttons beside the box. It opens on the old calculator's
 * numbers: about 30% down (to the slider's nearest step), the middle term,
 * and 12% where the market quotes APR.
 *
 * Where the market requires it, the disclosure is drawn with the payment, in
 * the wording the old calculator used: a monthly figure is a triggering term
 * under Reg Z and cannot stand alone.
 */
export function FinanceEstimate({
  market: code,
  priceMajor,
}: {
  market: MarketCode;
  /** The car's price in whole currency units. */
  priceMajor: number;
}) {
  const market = MARKETS[code];
  const cur = market.currency as CurrencyCode;
  const terms = market.financing.termMonths;
  const id = useId();

  // Steps a thumb can land on: hundreds for a car in dollars, more for naira.
  const step = priceMajor >= 1_000_000 ? 50_000 : priceMajor >= 20_000 ? 500 : 100;
  const clampRate = (n: number) => Math.min(100, Math.max(0, Math.round(n * 10) / 10));

  const [down, setDown] = useState(Math.round((priceMajor * 0.3) / step) * step);
  const [rate, setRate] = useState(market.financing.quotesApr ? 12 : 0);
  const [term, setTerm] = useState(terms[Math.floor(terms.length / 2)]);

  const result = useMemo(() => {
    const financed = Math.max(0, priceMajor - (down || 0));
    const principal = fromMajor(financed, cur);
    // A rate typed below zero or left empty is no interest, not an error.
    const per = monthlyPayment(principal, Math.max(0, rate || 0), term);
    return { financed: principal, per, total: money(per.minor * term, cur) };
  }, [priceMajor, down, rate, term, cur]);

  const fmt = (m: { minor: number; currency: CurrencyCode }) => formatMoney(m, market.locale);
  const rateName = market.financing.quotesApr ? "APR" : "Interest rate";

  return (
    <div className="fe">
      <div className="fe-row">
        <label className="fe-label" htmlFor={`${id}-down`}>
          Down payment <strong>{fmt(fromMajor(down || 0, cur))}</strong>
        </label>
        <input
          id={`${id}-down`}
          className="fe-range"
          type="range"
          min={0}
          max={priceMajor}
          step={step}
          value={down}
          onChange={(e) => setDown(Number(e.target.value))}
          aria-valuetext={fmt(fromMajor(down || 0, cur))}
        />
      </div>

      <fieldset className="fe-row">
        <legend className="fe-label">
          Months <strong>{term}</strong>
        </legend>
        <div className="fe-terms">
          {terms.map((t) => (
            <label className="fe-term" key={t}>
              <input
                type="radio"
                name={`${id}-term`}
                value={t}
                checked={term === t}
                onChange={() => setTerm(t)}
              />
              <span>{t}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="fe-row">
        <label className="fe-label" htmlFor={`${id}-rate`}>
          {rateName} (%)
        </label>
        <div className="fe-rate">
          <button
            type="button"
            className="fe-step"
            aria-label={`Lower the ${rateName} by half a point`}
            onClick={() => setRate((r) => clampRate((r || 0) - 0.5))}
          >
            <i className="fas fa-minus" aria-hidden="true" />
          </button>
          <input
            id={`${id}-rate`}
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="0.1"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          />
          <button
            type="button"
            className="fe-step"
            aria-label={`Raise the ${rateName} by half a point`}
            onClick={() => setRate((r) => clampRate((r || 0) + 0.5))}
          >
            <i className="fas fa-plus" aria-hidden="true" />
          </button>
        </div>
      </div>

      <p className="fe-result" aria-live="polite" aria-atomic="true">
        <span className="fe-result-label">Estimated monthly payment</span>
        <strong>{fmt(result.per)}</strong>
        <span className="fe-result-sum">
          {fmt(result.financed)} financed over {term} months · {fmt(result.total)} total
        </span>
      </p>

      {market.compliance.monthlyPaymentRequiresDisclosure && (
        <p className="cd-fine">
          Estimated payment based on {fmt(result.financed)} financed at{" "}
          {Math.max(0, rate || 0).toFixed(2)}% APR
          for {term} months with {fmt(fromMajor(down || 0, cur))} down, on approved credit. This is
          an estimate, not an offer of credit or a commitment to lend. Tax, title, registration and
          dealer fees are excluded.
        </p>
      )}
    </div>
  );
}
