"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  submitFinanceApplication,
  type ApplicationResult,
} from "@/lib/actions/financeApplication";
import type { MarketConfig } from "@/lib/market";
import {
  formatMoney,
  fromMajor,
  money,
  monthlyPayment,
  type CurrencyCode,
} from "@/lib/money";

/* ── Calculator ─────────────────────────────────────────────────────────── */

/**
 * The original's finance calculator, reproduced with its class names.
 *
 * The maths is the same amortisation the ledger and the sales worksheet use,
 * so the figure quoted here is the figure the paperwork will show on those
 * terms. The original computed simple interest on the full price — it ignored
 * the down payment when working out interest, which overstated the total on
 * every single input.
 */
export function LegacyFinanceCalculator({
  market,
  defaultPriceMajor,
  note,
}: {
  market: MarketConfig;
  defaultPriceMajor: number;
  note: string;
}) {
  const cur = market.currency as CurrencyCode;
  const terms = market.financing.termMonths;

  const [price, setPrice] = useState(defaultPriceMajor);
  const [down, setDown] = useState(Math.round(defaultPriceMajor * 0.3));
  const [term, setTerm] = useState(terms[Math.floor(terms.length / 2)]);
  // Deliberately blank. The original shipped 8% as a default, which reads as
  // the dealership's rate; the business has not published one, so the visitor
  // supplies the figure they have been quoted and nothing is implied.
  const [rateText, setRateText] = useState("");
  const rate = rateText === "" ? null : Number(rateText);

  const result = useMemo(() => {
    if (rate == null || Number.isNaN(rate)) return null;
    const financed = Math.max(0, (price || 0) - (down || 0));
    const principal = fromMajor(financed, cur);
    const per = monthlyPayment(principal, rate, term);
    const total = money(per.minor * term, cur);
    return {
      principal,
      per,
      total,
      interest: money(Math.max(0, total.minor - principal.minor), cur),
    };
  }, [price, down, rate, term, cur]);

  const fmt = (m: { minor: number; currency: CurrencyCode }) =>
    formatMoney(m, market.locale);

  return (
    <div className="calculator-grid">
      <div className="calculator-inputs">
        <div className="calc-group">
          <label htmlFor="carPrice">
            Car Price <span className="currency-label">({cur})</span>
          </label>
          <input
            id="carPrice"
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
          />
        </div>

        <div className="calc-group">
          <label htmlFor="downPayment">
            Down Payment <span className="currency-label">({cur})</span>
          </label>
          <input
            id="downPayment"
            type="number"
            min={0}
            value={down}
            onChange={(e) => setDown(Number(e.target.value))}
          />
        </div>

        <div className="calc-group">
          <label htmlFor="loanTerm">Loan Term (months)</label>
          <select
            id="loanTerm"
            value={term}
            onChange={(e) => setTerm(Number(e.target.value))}
          >
            {terms.map((t) => (
              <option key={t} value={t}>
                {t} months
              </option>
            ))}
          </select>
        </div>

        <div className="calc-group">
          <label htmlFor="interestRate">
            {market.financing.quotesApr ? "APR (%)" : "Interest Rate (%)"}
          </label>
          <input
            id="interestRate"
            type="number"
            min={0}
            max={100}
            step="0.1"
            placeholder="Enter the rate you were quoted"
            value={rateText}
            onChange={(e) => setRateText(e.target.value)}
          />
        </div>
      </div>

      <div className="calculator-result">
        <h4>Estimated Monthly Payment</h4>

        {result === null ? (
          <>
            <div className="result-amount result-pending">—</div>
            <div className="result-details">
              Enter {market.financing.quotesApr ? "an APR" : "an interest rate"}{" "}
              to see a payment.
            </div>
          </>
        ) : (
          <>
            <div className="result-amount">{fmt(result.per)}</div>
            <div className="result-details">
              Amount financed: <span>{fmt(result.principal)}</span>
            </div>
            <div className="result-details">
              Total Interest: <span>{fmt(result.interest)}</span>
            </div>
            <div className="result-details">
              Total Payment: <span>{fmt(result.total)}</span>
            </div>
          </>
        )}

        {/* In the US a monthly figure is a triggering term under Reg Z: it
            cannot be published without the terms behind it in the same place.
            The original showed a payment with none of this. */}
        <p className="calc-disclosure">
          {result !== null && market.compliance.monthlyPaymentRequiresDisclosure && (
            <>
              Based on {fmt(result.principal)} financed at {rate!.toFixed(2)}% APR
              over {term} months with {fmt(fromMajor(down || 0, cur))} down, on
              approved credit. Tax, title, registration and dealer fees are not
              included.{" "}
            </>
          )}
          {note}
        </p>
      </div>
    </div>
  );
}

/* ── Application ────────────────────────────────────────────────────────── */

const EMPLOYMENT = [
  { value: "salaried", label: "Salaried (full-time)" },
  { value: "self_employed", label: "Self-employed" },
  { value: "business_owner", label: "Business owner" },
  { value: "contractor", label: "Contractor" },
  { value: "other", label: "Other" },
];

/**
 * Income ranges, in each market's own units.
 *
 * Bands rather than an exact figure: enough to size an instalment, far less
 * damaging if the database is ever exposed.
 */
function incomeBands(market: MarketConfig) {
  const fmt = (major: number) =>
    formatMoney(fromMajor(major, market.currency as CurrencyCode), market.locale, {
      compact: true,
    });

  const steps =
    market.code === "us"
      ? [2_000, 4_000, 7_000, 12_000]
      : [1_000_000, 2_000_000, 5_000_000, 10_000_000];

  return [
    { value: "under_1", label: `Under ${fmt(steps[0])} / month` },
    { value: "1_2", label: `${fmt(steps[0])} – ${fmt(steps[1])} / month` },
    { value: "2_5", label: `${fmt(steps[1])} – ${fmt(steps[2])} / month` },
    { value: "5_10", label: `${fmt(steps[2])} – ${fmt(steps[3])} / month` },
    { value: "over_10", label: `Over ${fmt(steps[3])} / month` },
  ];
}

export function LegacyFinanceApplication({
  market,
  vehicleSlug,
  vehicleLabel,
  phone,
}: {
  market: MarketConfig;
  vehicleSlug?: string;
  vehicleLabel?: string;
  phone?: string | null;
}) {
  const [state, action, pending] = useActionState<ApplicationResult | null, FormData>(
    submitFinanceApplication,
    null,
  );

  const mountedAt = useRef(0);
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  const submit = (formData: FormData) => {
    formData.set("renderedAt", String(mountedAt.current));
    formData.set("landingPath", window.location.pathname + window.location.search);
    return action(formData);
  };

  const err = (f: string) => state?.fieldErrors?.[f]?.[0];
  const bands = incomeBands(market);

  if (state?.ok) {
    return (
      <div className="application-form">
        <h3>Application received</h3>
        <p>
          Thank you. We will review it and come back to you — usually within one
          working day
          {phone ? (
            <>
              {" "}
              — or call us on <a href={`tel:${phone}`}>{phone}</a> if it is
              urgent
            </>
          ) : null}
          .
        </p>
      </div>
    );
  }

  return (
    <form className="application-form" action={submit}>
      <input type="hidden" name="marketCode" value={market.code} />
      {vehicleSlug && <input type="hidden" name="vehicleSlug" value={vehicleSlug} />}

      <div
        aria-hidden
        style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}
      >
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state?.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}

      {vehicleLabel && (
        <p className="form-note">
          Applying for <strong>{vehicleLabel}</strong>
        </p>
      )}

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="fa-name">Full Name *</label>
          <input
            id="fa-name"
            type="text"
            name="name"
            autoComplete="name"
            placeholder={market.code === "us" ? "John Doe" : "Adebayo Okoro"}
            required
          />
          {err("name") && <span className="field-error">{err("name")}</span>}
        </div>
        <div className="form-group">
          <label htmlFor="fa-phone">Phone Number *</label>
          <input
            id="fa-phone"
            type="tel"
            name="phone"
            autoComplete="tel"
            placeholder={market.code === "us" ? "(336) 555-0100" : "080 1234 5678"}
            required
          />
          {err("phone") && <span className="field-error">{err("phone")}</span>}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="fa-email">Email</label>
          <input
            id="fa-email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="john@example.com"
          />
          {err("email") && <span className="field-error">{err("email")}</span>}
        </div>
        <div className="form-group">
          <label htmlFor="fa-employment">Employment Status *</label>
          <select id="fa-employment" name="employment" defaultValue="" required>
            <option value="" disabled>
              Select
            </option>
            {EMPLOYMENT.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
          {err("employment") && <span className="field-error">{err("employment")}</span>}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="fa-income">Monthly Income *</label>
          <select id="fa-income" name="incomeBand" defaultValue="" required>
            <option value="" disabled>
              Select range
            </option>
            {bands.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          {err("incomeBand") && <span className="field-error">{err("incomeBand")}</span>}
        </div>
        <div className="form-group">
          <label htmlFor="fa-down">Down Payment ({market.currency}) *</label>
          <input
            id="fa-down"
            type="number"
            name="downPayment"
            min={0}
            step="1"
            placeholder={market.code === "us" ? "5000" : "1500000"}
            required
          />
          {err("downPayment") && <span className="field-error">{err("downPayment")}</span>}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="fa-term">Preferred Duration *</label>
          <select
            id="fa-term"
            name="termMonths"
            defaultValue={market.financing.termMonths[0]}
            required
          >
            {market.financing.termMonths.map((t) => (
              <option key={t} value={t}>
                {t} months
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="fa-car">Preferred Car (optional)</label>
          <input
            id="fa-car"
            type="text"
            name="preferredCar"
            placeholder="e.g. 2020 Toyota Camry"
          />
        </div>
      </div>

      {/* The original asked for "BVN / SSN" and an ID number in plain inputs
          posting to a third-party form service. Those fields are gone: see the
          note rendered beside this form. */}

      <div className="form-group consent-group">
        <label htmlFor="fa-consent" className="consent-label">
          <input id="fa-consent" type="checkbox" name="consent" value="yes" required />
          <span>
            I confirm the details above are accurate and I agree to be contacted
            about this application. Figures discussed are estimates until terms
            are confirmed in writing. *
          </span>
        </label>
        {err("consent") && <span className="field-error">{err("consent")}</span>}
      </div>

      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Submitting…" : "Submit Application"}{" "}
        <i className="fas fa-arrow-right" />
      </button>
    </form>
  );
}
