"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { requestRental, type RentalResult } from "@/lib/actions/rentals";
import { quoteRental, rentalDays, RentalError, type RentalTariff } from "@/lib/rental";
import { formatMoney, money } from "@/lib/money";
import type { MarketConfig } from "@/lib/market";
import { RENTAL_CLAUSES, RENTAL_TERMS_VERSION, fillClause } from "@/content/rentalTerms";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * "daily" -> "day" / "days".
 *
 * This was `tier.replace("ly", "")` plus an "s", which is right for weekly and
 * monthly and wrong for the rate most people book on: it printed "3 × dais".
 * Spelled out rather than patched, because there are only three of them and a
 * fourth would break the trick again.
 */
const UNITS: Record<string, [one: string, many: string]> = {
  daily: ["day", "days"],
  weekly: ["week", "weeks"],
  monthly: ["month", "months"],
};

function unitLabel(tier: string, quantity: number): string {
  const unit = UNITS[tier];
  if (!unit) return tier;
  return quantity === 1 ? unit[0] : unit[1];
}

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
      <div className="booking-done">
        <i className="fas fa-circle-check" aria-hidden="true" />
        <p className="booking-done-title">Request received</p>
        <p className="booking-done-body">
          Your reference is{" "}
          <strong className="booking-ref">{state.reference}</strong>. We will
          confirm availability and the deposit shortly.
        </p>
      </div>
    );
  }

  const err = (f: string) => state?.fieldErrors?.[f]?.[0];

  return (
    <form action={action} className="booking-form">
      <input type="hidden" name="marketCode" value={market.code} />
      <input type="hidden" name="vehicleSlug" value={vehicleSlug} />
      <input type="hidden" name="renderedAt" value={renderedAt} />
      {withDriver && <input type="hidden" name="withDriver" value="true" />}

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
        <p className="booking-alert" role="alert">
          {state.error}
        </p>
      )}

      <div className="booking-dates">
        <label className="booking-field">
          <span>Pick-up</span>
          <input
            name="from"
            type="date"
            required
            min={today()}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            
          />
          {err("from") && <Err>{err("from")}</Err>}
        </label>
        <label className="booking-field">
          <span>Return</span>
          <input
            name="to"
            type="date"
            required
            min={from || today()}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            
          />
          {err("to") && <Err>{err("to")}</Err>}
        </label>
      </div>

      {tariff.withDriverAvailable && (
        <label className="booking-driver">
          <input
            type="checkbox"
            checked={withDriver}
            onChange={(e) => setWithDriver(e.target.checked)}
            
          />
          With a driver
          {tariff.driverDailyMinor != null && (
            <span className="booking-driver-rate">+{fmt(tariff.driverDailyMinor)}/day</span>
          )}
        </label>
      )}

      {/* Live quote */}
      {preview?.error && (
        <p className="booking-warn">
          {preview.error}
        </p>
      )}
      {preview?.quote && (
        <div className="booking-quote">
          <dl>
            {preview.quote.lines.map((l) => (
              <div key={l.tier}>
                <dt className="booking-quote-line">
                  {l.quantity} × {unitLabel(l.tier, l.quantity)} @ {fmt(l.unitMinor)}
                </dt>
                <dd>{fmt(l.subtotalMinor)}</dd>
              </div>
            ))}
            {preview.quote.driverMinor > 0 && (
              <div>
                <dt className="booking-quote-line">Driver × {preview.quote.days} days</dt>
                <dd>{fmt(preview.quote.driverMinor)}</dd>
              </div>
            )}
            <div className="booking-quote-total">
              <dt>
                Total for {preview.quote.days} day{preview.quote.days === 1 ? "" : "s"}
              </dt>
              <dd>{fmt(preview.quote.totalMinor)}</dd>
            </div>
            {preview.quote.depositMinor > 0 && (
              <div className="booking-quote-deposit">
                <dt>Refundable deposit</dt>
                <dd>{fmt(preview.quote.depositMinor)}</dd>
              </div>
            )}
          </dl>
          {preview.quote.savingNote && (
            <p className="booking-saving">{preview.quote.savingNote}</p>
          )}
        </div>
      )}

      <label className="booking-field">
        <span>Your name</span>
        <input name="name" required autoComplete="name"  />
        {err("name") && <Err>{err("name")}</Err>}
      </label>

      <label className="booking-field">
        <span>Phone</span>
        <input name="phone" type="tel" required autoComplete="tel"  />
        {err("phone") && <Err>{err("phone")}</Err>}
      </label>

      <label className="booking-field">
        <span>
          Email <em>optional</em>
        </span>
        <input name="email" type="email" autoComplete="email"  />
        {err("email") && <Err>{err("email")}</Err>}
      </label>

      <div className="booking-licence">
        <label className="booking-field">
          <span>
            Photo of your driving licence <em>optional</em>
          </span>
          <input
            type="file"
            name="licenceFile"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,image/*"
            capture="environment"
          />
          {err("licenceFile") && <Err>{err("licenceFile")}</Err>}
        </label>

        {/* Every sentence here describes something the code actually does.
            Reassurance a system does not deliver is worse than none. */}
        <p className="booking-licence-note">
          <i className="fas fa-lock" aria-hidden="true" />
          <span>
            Sending it now saves time at pickup. It is stored privately, never
            shown on this website, and can only be opened by our staff through a
            link that expires within minutes. We will not ask for your bank
            details, card number, SSN or BVN — not here, and not by email.
          </span>
        </p>

        <label className="booking-field">
          <span>
            Or just type the licence number <em>optional</em>
          </span>
          <input name="licenceNo" />
        </label>
      </div>

      <label className="booking-field">
        <span>
          Anything else? <em>optional</em>
        </span>
        <textarea name="note" rows={3}  />
      </label>

      {/* Read before the request, not handed over at the counter. Folded so
          the form still reads as a form, and open on demand — a checkbox
          pointing at terms nobody can see is not consent. */}
      <details className="booking-terms">
        <summary>
          <i className="fas fa-file-contract" aria-hidden="true" /> Rental terms
          <span>read before you request</span>
        </summary>
        <div className="booking-terms-body">
          {RENTAL_CLAUSES.map((c, i) => (
            <section key={c.heading}>
              <h4>
                {i + 1}. {c.heading}
              </h4>
              <p>
                {fillClause(c.body, {
                  law: market.code === "us" ? "North Carolina" : "Nigerian",
                })}
              </p>
            </section>
          ))}
        </div>
      </details>

      <input type="hidden" name="termsVersion" value={RENTAL_TERMS_VERSION} />

      <label className="booking-accept">
        <input type="checkbox" name="acceptTerms" required />
        <span>
          I have read and accept the rental terms above. I confirm I hold a
          valid driving licence and the insurance required for how I intend to
          use the vehicle.
        </span>
      </label>
      {err("acceptTerms") && <Err>{err("acceptTerms")}</Err>}

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary booking-submit"
      >
        {pending ? "Sending…" : "Request booking"} <i className="fas fa-calendar-check" />
      </button>

      <p className="booking-fineprint">
        Sending a request does not hold the vehicle. We confirm availability and
        take the deposit first.
      </p>
    </form>
  );
}

function Err({ children }: { children: React.ReactNode }) {
  return <span className="field-error">{children}</span>;
}
