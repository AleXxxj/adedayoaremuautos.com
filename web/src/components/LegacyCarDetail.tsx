"use client";

import { useMemo, useState } from "react";
import { fromMajor, formatMoney, monthlyPayment, money, type CurrencyCode } from "@/lib/money";
import type { MarketConfig } from "@/lib/market";

/**
 * The original gallery, reproduced with its class names.
 *
 * The legacy version auto-played slides on a timer. That is dropped: a
 * carousel that moves on its own while someone is studying a photograph of a
 * £15k purchase is an irritation, and it fails WCAG 2.2.2 unless it can be
 * paused. Prev/next and thumbnails do the same job under the buyer's control.
 */
export function LegacyGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  const [i, setI] = useState(0);
  if (images.length === 0) {
    return (
      <div className="car-gallery">
        <div className="media-container">
          <div className="media-slide active">
            <div className="car-image-placeholder">Photography coming soon</div>
          </div>
        </div>
      </div>
    );
  }

  const go = (n: number) => setI((n + images.length) % images.length);

  return (
    <div className="car-gallery">
      {/* Each photo needs a .media-slide wrapper: .media-container is a fixed
          400px box and the slides are absolutely positioned to fill it. A bare
          <img> sits at its natural size and leaves the rest of the box black. */}
      <div className="media-container" id="mediaContainer">
        {images.map((src, n) => (
          <div className={`media-slide${n === i ? " active" : ""}`} key={src}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={n === i ? `${alt} — photo ${n + 1} of ${images.length}` : ""}
              loading={n === 0 ? "eager" : "lazy"}
            />
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <>
          <button type="button" className="nav-btn nav-prev" onClick={() => go(i - 1)} aria-label="Previous photo">
            <i className="fas fa-chevron-left" />
          </button>
          <button type="button" className="nav-btn nav-next" onClick={() => go(i + 1)} aria-label="Next photo">
            <i className="fas fa-chevron-right" />
          </button>

          <div className="thumbnail-grid" id="thumbnailGrid">
            {images.map((src, n) => (
              <button
                key={src}
                type="button"
                className={`thumbnail${n === i ? " active" : ""}`}
                onClick={() => setI(n)}
                aria-label={`Show photo ${n + 1}`}
                aria-current={n === i}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The original finance calculator, reproduced.
 *
 * Runs the same amortisation the sales worksheet and the ledger use, so the
 * figure a buyer sees here is the figure they will be quoted on those terms.
 * Where the market requires it, the disclosure is rendered with the payment —
 * a monthly figure is a triggering term under Reg Z and cannot stand alone.
 */
export function LegacyCalculator({
  market,
  priceMajor,
}: {
  market: MarketConfig;
  priceMajor: number;
}) {
  const cur = market.currency as CurrencyCode;
  const terms = market.financing.termMonths;

  const [price, setPrice] = useState(priceMajor);
  const [down, setDown] = useState(Math.round(priceMajor * 0.3));
  const [rate, setRate] = useState(market.financing.quotesApr ? 12 : 0);
  const [term, setTerm] = useState(terms[Math.floor(terms.length / 2)]);

  const result = useMemo(() => {
    const financed = Math.max(0, (price || 0) - (down || 0));
    const principal = fromMajor(financed, cur);
    const per = monthlyPayment(principal, rate || 0, term);
    return {
      financed: principal,
      per,
      total: money(per.minor * term, cur),
    };
  }, [price, down, rate, term, cur]);

  const fmt = (m: { minor: number; currency: CurrencyCode }) =>
    formatMoney(m, market.locale);

  return (
    <div className="finance-calculator">
      <h3>
        <i className="fas fa-calculator" /> Finance Calculator
      </h3>

      <div className="calc-input">
        <label htmlFor="carPrice">Vehicle Price ({cur})</label>
        <input
          id="carPrice"
          type="number"
          min={0}
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
        />
      </div>

      <div className="calc-input">
        <label htmlFor="downPayment">Down Payment ({cur})</label>
        <input
          id="downPayment"
          type="number"
          min={0}
          value={down}
          onChange={(e) => setDown(Number(e.target.value))}
        />
      </div>

      <div className="calc-input">
        <label htmlFor="interestRate">
          {market.financing.quotesApr ? "APR (%)" : "Interest Rate (%)"}
        </label>
        <input
          id="interestRate"
          type="number"
          min={0}
          max={100}
          step="0.1"
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
        />
      </div>

      <div className="calc-input">
        <label htmlFor="loanTerm">Loan Term</label>
        <select id="loanTerm" value={term} onChange={(e) => setTerm(Number(e.target.value))}>
          {terms.map((t) => (
            <option key={t} value={t}>{t} months</option>
          ))}
        </select>
      </div>

      <div className="calc-result">
        <span className="label">Estimated Monthly Payment</span>
        <span className="value">{fmt(result.per)}</span>
        <span className="label" style={{ marginTop: 8, display: "block" }}>
          {fmt(result.financed)} financed over {term} months · {fmt(result.total)} total
        </span>
      </div>

      {market.compliance.monthlyPaymentRequiresDisclosure && (
        <p style={{ fontSize: 11, lineHeight: 1.5, color: "var(--silver-cool)", marginTop: 12 }}>
          Estimated payment based on {fmt(result.financed)} financed at{" "}
          {rate.toFixed(2)}% APR for {term} months with {fmt(fromMajor(down || 0, cur))}{" "}
          down, on approved credit. This is an estimate, not an offer of credit
          or a commitment to lend. Tax, title, registration and dealer fees are
          excluded.
        </p>
      )}
    </div>
  );
}
