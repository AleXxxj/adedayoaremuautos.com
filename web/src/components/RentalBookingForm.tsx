"use client";

import { useActionToast } from "@/components/Toast";

import { useActionState, useEffect, useMemo, useState, useRef } from "react";
import { requestRental, type RentalResult } from "@/lib/actions/rentals";
import { quoteRental, rentalDays, RentalError, type RentalTariff } from "@/lib/rental";
import { formatMoney, money } from "@/lib/money";
import type { MarketConfig } from "@/lib/market";
import { RENTAL_CLAUSES, RENTAL_TERMS_VERSION, fillClause } from "@/content/rentalTerms";
import { RentalPayButton } from "@/components/RentalPayButton";

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
  useActionToast(state);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [withDriver, setWithDriver] = useState(false);
  /*
   * Defaults to their own insurance, never to the paid option.
   *
   * Pre-selecting the waiver would put a charge in the total that the customer
   * did not ask for and might not notice — which is exactly the pattern the
   * FTC's rule on deceptive fees is aimed at, and the opposite of what the
   * business asked for in wanting it clearly communicated.
   */
  const [insurance, setInsurance] = useState<"own" | "waiver">("own");
  const waiverOffered = (tariff.waiverDailyMinor ?? 0) > 0;

  /*
   * Everything the customer typed or attached, held in state.
   *
   * React resets an uncontrolled form once its action has run, which is
   * usually a kindness and is badly wrong here: a single validation failure
   * emptied the whole form, and this one now requires two photographs. Being
   * asked to find your licence and your insurance certificate again because
   * you mistyped a phone number is where somebody gives up and rings a
   * competitor.
   *
   * The files especially. A file input cannot be repopulated by the browser,
   * so the only way to survive a round trip is to hold the File itself and
   * attach it to the payload on the way out.
   */
  const [fields, setFields] = useState<Record<string, string>>({});
  const set = (name: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setFields((f) => ({ ...f, [name]: e.target.value }));
  const val = (name: string) => fields[name] ?? "";

  const [licenceFile, setLicenceFile] = useState<File | null>(null);
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  /*
   * Mount time, kept in a ref and stamped on at submit.
   *
   * It was state written inside an effect, which React now rejects: that
   * causes a second render for a value nothing displays. A ref carries it
   * without re-rendering, and the action attaches it on the way out.
   */
  const mountedAt = useRef(0);
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  const submit = (formData: FormData) => {
    formData.set("renderedAt", String(mountedAt.current));

    /*
     * The documents come from state, not from the inputs.
     *
     * After a failed submit the inputs are empty — React has reset them —
     * while these still hold what the customer chose, so this is what keeps a
     * second attempt from needing the photographs again. Checked here too, so
     * the message is immediate rather than a round trip; the server refuses
     * them independently either way.
     */
    if (!licenceFile) {
      setDocError("Please attach a photo of your driving licence.");
      return;
    }
    if (!insuranceFile) {
      setDocError(
        "Please attach proof of your insurance. This is required even if you take our damage waiver.",
      );
      return;
    }
    setDocError(null);
    formData.set("licenceFile", licenceFile);
    formData.set("insuranceFile", insuranceFile);
    return action(formData);
  };

  /**
   * Preview only — the server prices the booking again from the same tariff
   * before writing. A quote assembled in the browser is not a price.
   */
  const preview = useMemo(() => {
    if (!from || !to) return null;
    const days = rentalDays(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`));
    if (days <= 0) return null;
    try {
      return {
        quote: quoteRental(tariff, days, {
          withDriver,
          waiver: insurance === "waiver" && waiverOffered,
        }),
        error: null as string | null,
      };
    } catch (e) {
      return { quote: null, error: e instanceof RentalError ? e.message : "Cannot price those dates." };
    }
  }, [from, to, withDriver, insurance, waiverOffered, tariff]);

  const fmt = (minor: number) =>
    formatMoney(money(minor, market.currency), market.locale, { showDecimals: true });

  if (state?.ok && state.reference && state.reference !== "—") {
    const payable = state.canPay && state.bookingId && state.amount;
    return (
      <div className="booking-done">
        <i className="fas fa-circle-check" aria-hidden="true" />
        <p className="booking-done-title">Request received</p>
        <p className="booking-done-body">
          Your reference is{" "}
          <strong className="booking-ref">{state.reference}</strong>.{" "}
          {payable
            ? "Pay now and the dates are yours immediately — or leave it and we will call you to confirm."
            : "We will confirm availability and the deposit shortly."}
        </p>

        {/* Offered after the request is safely recorded, never instead of it:
            somebody who abandons the checkout has still made an enquiry. */}
        {payable && (
          <RentalPayButton bookingId={state.bookingId!} amount={state.amount!} />
        )}
      </div>
    );
  }

  const err = (f: string) => state?.fieldErrors?.[f]?.[0];

  return (
    <form action={submit} className="booking-form">
      <input type="hidden" name="marketCode" value={market.code} />
      <input type="hidden" name="vehicleSlug" value={vehicleSlug} />
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
            {/* In the itemised quote AND inside the total below it. A fee the
                customer only meets at the counter is the thing the business
                explicitly asked to avoid. */}
            {preview.quote.waiverMinor > 0 && (
              <div className="booking-quote-waiver">
                <dt className="booking-quote-line">
                  Damage waiver × {preview.quote.days} day
                  {preview.quote.days === 1 ? "" : "s"}
                </dt>
                <dd>{fmt(preview.quote.waiverMinor)}</dd>
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
        <input name="name" required autoComplete="name" value={val("name")} onChange={set("name")} />
        {err("name") && <Err>{err("name")}</Err>}
      </label>

      <label className="booking-field">
        <span>Phone</span>
        <input name="phone" type="tel" required autoComplete="tel" value={val("phone")} onChange={set("phone")} />
        {err("phone") && <Err>{err("phone")}</Err>}
      </label>

      <label className="booking-field">
        <span>
          Email <em>optional</em>
        </span>
        <input name="email" type="email" autoComplete="email" value={val("email")} onChange={set("email")} />
        {err("email") && <Err>{err("email")}</Err>}
      </label>

      {/* ── Insurance ─────────────────────────────────────────────────────
          The one decision on this form that changes the price, so it is
          stated as a choice between two priced options rather than an
          opt-in checkbox. The fee appears here, in the quote above, and in
          the total — three places, before anybody pays anything. */}
      <fieldset className="booking-insurance">
        <legend>How will the vehicle be insured?</legend>

        <label
          className={`booking-insurance-option${insurance === "own" ? " is-chosen" : ""}`}
        >
          <input
            type="radio"
            name="insuranceChoice"
            value="own"
            checked={insurance === "own"}
            onChange={() => setInsurance("own")}
          />
          <span className="booking-insurance-body">
            <strong>I will use my own insurance</strong>
            <span className="booking-insurance-price">No extra charge</span>
            <small>
              Attach your certificate below. Your policy must cover you to
              drive this vehicle for the use you intend.
            </small>
          </span>
        </label>

        {waiverOffered ? (
          <label
            className={`booking-insurance-option${insurance === "waiver" ? " is-chosen" : ""}`}
          >
            <input
              type="radio"
              name="insuranceChoice"
              value="waiver"
              checked={insurance === "waiver"}
              onChange={() => setInsurance("waiver")}
            />
            <span className="booking-insurance-body">
              <strong>Add our damage waiver</strong>
              {/* The figure, large and in the option itself — not in a
                  footnote, and not only in the total. */}
              <span className="booking-insurance-price booking-insurance-fee">
                + {fmt(tariff.waiverDailyMinor!)} per day
                {preview?.quote && insurance === "waiver" && (
                  <em> — {fmt(preview.quote.waiverMinor)} for this hire</em>
                )}
              </span>
              <small>
                We will not charge you for damage to this vehicle beyond your
                deposit. <strong>This is not insurance</strong> — it does not
                cover injury or damage to anyone else, so you still need your
                own cover for that.
              </small>
            </span>
          </label>
        ) : (
          <p className="booking-insurance-note">
            Our damage waiver is not available on this vehicle, so your own
            insurance is required.
          </p>
        )}

        {err("insuranceChoice") && <Err>{err("insuranceChoice")}</Err>}
      </fieldset>

      <div className="booking-licence">
        <label className="booking-field">
          <span>
            Photo of your driving licence <em>required</em>
          </span>
          <input
            type="file"
            name="licenceFile"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,image/*"
            capture="environment"
            onChange={(e) => {
              setLicenceFile(e.target.files?.[0] ?? null);
              setDocError(null);
            }}
          />
          {licenceFile && (
            <span className="booking-attached">
              <i className="fas fa-check" aria-hidden="true" /> {licenceFile.name}
            </span>
          )}
          {err("licenceFile") && <Err>{err("licenceFile")}</Err>}
        </label>

        {/* Required of everybody, including renters taking the waiver — which
            is the whole point of the distinction above. */}
        <label className="booking-field">
          <span>
            Proof of your insurance <em>required</em>
          </span>
          <input
            type="file"
            name="insuranceFile"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,image/*"
            capture="environment"
            onChange={(e) => {
              setInsuranceFile(e.target.files?.[0] ?? null);
              setDocError(null);
            }}
          />
          {insuranceFile && (
            <span className="booking-attached">
              <i className="fas fa-check" aria-hidden="true" /> {insuranceFile.name}
            </span>
          )}
          {err("insuranceFile") && <Err>{err("insuranceFile")}</Err>}
        </label>

        {docError && <Err>{docError}</Err>}

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
            Licence number <em>optional</em>
          </span>
          <input name="licenceNo" value={val("licenceNo")} onChange={set("licenceNo")} />
        </label>

        <div className="booking-field-row">
          <label className="booking-field">
            <span>
              Insurer <em>optional</em>
            </span>
            <input name="insuranceProvider" autoComplete="organization" value={val("insuranceProvider")} onChange={set("insuranceProvider")} />
          </label>
          <label className="booking-field">
            <span>
              Policy number <em>optional</em>
            </span>
            <input name="insurancePolicyNo" value={val("insurancePolicyNo")} onChange={set("insurancePolicyNo")} />
          </label>
        </div>
      </div>

      {/* Declared, not collected.
          Age eligibility needs a date of birth, and the licence already
          carries one — so this is checked against the document rather than
          stored as a second copy of it. */}
      <label className="booking-consent">
        <input type="checkbox" name="confirmEligible" required />
        <span>
          I am 21 or over, I hold a full licence that is valid for the whole
          hire period, and the documents I have attached are my own. I
          understand the vehicle is not released until they have been checked.
        </span>
      </label>
      {err("confirmEligible") && <Err>{err("confirmEligible")}</Err>}

      <label className="booking-field">
        <span>
          Anything else? <em>optional</em>
        </span>
        <textarea name="note" rows={3} value={val("note")} onChange={set("note")} />
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
