"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitLead, type LeadResult } from "@/lib/actions/leads";
import type { MarketConfig } from "@/lib/market";

/**
 * A rent-to-own application, rather than the general contact form.
 *
 * The questions are the ones that decide whether an application can proceed:
 * whether they hold a licence, when they want the car, and how long they
 * expect to keep it. Asking them here means the first call is a confirmation
 * instead of an interview.
 *
 * It deliberately does not ask for income, employer, bank details, SSN or BVN.
 * Collecting those through a public form would put this site inside a
 * regulatory perimeter it has no reason to enter, and none of it is needed to
 * decide whether to call someone back.
 */
const START_LABELS: Record<string, string> = {
  asap: "as soon as possible",
  "this-month": "this month",
  "next-month": "next month",
  "just-looking": "still deciding",
};

const LICENCE_LABELS: Record<string, string> = {
  yes: "holds a valid licence",
  applying: "applying for a licence",
  no: "no licence yet",
};

export function RentToOwnApplication({
  market,
  tierSlug,
  tierName,
  vehicleSlug,
  vehicleLabel,
  phone,
}: {
  market: MarketConfig;
  tierSlug: string;
  tierName: string;
  vehicleSlug?: string;
  vehicleLabel: string | null;
  phone: string | null;
}) {
  const [state, action, pending] = useActionState<LeadResult | null, FormData>(
    submitLead,
    null,
  );

  // Measures how long the form was actually open, not when the page was
  // rendered on the server or served from cache.
  const mountedAt = useRef(0);
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  const submit = (formData: FormData) => {
    // The three application questions are folded into the message the
    // salesperson reads. They do not each need a column on a table shared by
    // every other kind of enquiry, and a lead nobody reads is worse than a
    // column nobody queries.
    const answers = [
      `Start: ${START_LABELS[String(formData.get("startWhen"))] ?? "—"}`,
      `Licence: ${LICENCE_LABELS[String(formData.get("licence"))] ?? "—"}`,
    ];
    const notes = String(formData.get("notes") ?? "").trim();
    formData.set("message", [notes, answers.join(" · ")].filter(Boolean).join("\n\n"));

    formData.set("renderedAt", String(mountedAt.current));
    formData.set("landingPath", window.location.pathname + window.location.search);
    return action(formData);
  };

  const err = (f: string) => state?.fieldErrors?.[f]?.[0];

  if (state?.ok) {
    return (
      <div className="contact-form rto-apply-form">
        <h2>
          Application <span>Received</span>
        </h2>
        <p>
          Thank you. We will confirm the vehicle is still available and call you
          to agree a start date — usually the same day.
          {phone ? (
            <>
              {" "}
              If you would rather speak to someone now, call{" "}
              <a href={`tel:${phone}`}>{phone}</a>.
            </>
          ) : null}
        </p>
      </div>
    );
  }

  return (
    <div className="contact-form rto-apply-form">
      <h2>
        Apply for <span>{tierName}</span>
      </h2>
      <p>
        {vehicleLabel
          ? `Your application for the ${vehicleLabel}.`
          : "Tell us how to reach you and we will match you to a vehicle."}
      </p>

      <form action={submit}>
        <input type="hidden" name="marketCode" value={market.code} />
        <input type="hidden" name="type" value="rent_to_own" />
        <input type="hidden" name="tierSlug" value={tierSlug} />
        {vehicleSlug && <input type="hidden" name="vehicleSlug" value={vehicleSlug} />}

        {/* Off-screen rather than display:none, which many bots know to skip. */}
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

        <div className="form-group">
          <label htmlFor="rto-name">Your Name *</label>
          <input
            id="rto-name"
            type="text"
            name="name"
            autoComplete="name"
            placeholder={market.code === "us" ? "John Doe" : "Adebayo Okoro"}
            required
          />
          {err("name") && <span className="field-error">{err("name")}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="rto-phone">Phone Number *</label>
          <input
            id="rto-phone"
            type="tel"
            name="phone"
            autoComplete="tel"
            placeholder={market.code === "us" ? "(336) 555-0100" : "080 1234 5678"}
            required
          />
          {err("phone") && <span className="field-error">{err("phone")}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="rto-email">Email</label>
          <input
            id="rto-email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="john@example.com"
          />
          {err("email") && <span className="field-error">{err("email")}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="rto-contact">Best way to reach you</label>
          <select id="rto-contact" name="preferredContact" defaultValue="phone">
            <option value="phone">Phone call</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
          </select>
        </div>

        {/* These three go into the message, so they reach the salesperson
            without needing their own columns on a table shared by every other
            kind of enquiry. */}
        <div className="form-group">
          <label htmlFor="rto-start">When would you like to start?</label>
          <select id="rto-start" name="startWhen" defaultValue="asap">
            <option value="asap">As soon as possible</option>
            <option value="this-month">This month</option>
            <option value="next-month">Next month</option>
            <option value="just-looking">Still deciding</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="rto-licence">Do you hold a valid driving licence?</label>
          <select id="rto-licence" name="licence" defaultValue="yes">
            <option value="yes">Yes</option>
            <option value="applying">Not yet — applying</option>
            <option value="no">No</option>
          </select>
          <span className="form-hint">
            Required before a vehicle can be handed over. It does not affect
            whether we accept your application.
          </span>
        </div>

        <div className="form-group">
          <label htmlFor="rto-message">Anything else we should know?</label>
          <textarea
            id="rto-message"
            name="notes"
            placeholder="How you will use the car, questions about the terms, another vehicle you were considering…"
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Sending…" : "Submit application"}{" "}
          <i className="fas fa-key" />
        </button>

        <p className="form-privacy">
          We use your details only to process this application. We never ask for
          bank details, SSN or BVN through this website.
        </p>
      </form>
    </div>
  );
}
