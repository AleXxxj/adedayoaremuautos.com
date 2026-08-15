"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitLead, type LeadResult } from "@/lib/actions/leads";
import type { MarketConfig } from "@/lib/market";

/** The original's four options, mapped onto the lead types the pipeline uses. */
const INTERESTS: { value: string; label: string }[] = [
  { value: "contact", label: "Buying a Car" },
  { value: "rent_to_own", label: "Rent to Own" },
  { value: "rental", label: "Renting a Car" },
  { value: "finance", label: "Car Financing" },
  { value: "trade_in", label: "Value my Trade-In" },
  { value: "test_drive", label: "Booking a Test Drive" },
  // The referral panels on the homepage have always linked here with
  // ?type=referral, but there was no matching option — so the browser fell
  // back to the first entry and every would-be partner was filed as "Buying a
  // Car". The programme has therefore recorded no referral leads at all.
  { value: "referral", label: "Joining the referral programme" },
];

/**
 * The original's contact form, reproduced with its markup and class names.
 *
 * The original posted to `https://formspree.io/f/your-form-id` — a placeholder
 * that was never replaced, so every message sent through the live site went
 * nowhere. This writes a real lead and notifies staff.
 */
export function LegacyMessageForm({
  market,
  defaultType = "contact",
  vehicleSlug,
  vehicleLabel,
  phone,
}: {
  market: MarketConfig;
  defaultType?: string;
  vehicleSlug?: string;
  vehicleLabel?: string;
  phone?: string | null;
}) {
  const [state, action, pending] = useActionState<LeadResult | null, FormData>(
    submitLead,
    null,
  );
  // Recorded on mount and read at submit time, so the anti-spam timing
  // measures how long the visitor actually had the form open — not when the
  // page was rendered on the server or pulled from cache. Kept in refs and
  // attached during submit rather than rendered as hidden inputs, which would
  // mean a second render on mount for values nobody ever sees.
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

  if (state?.ok) {
    return (
      <div className="contact-form">
        <h2>
          Message <span>Received</span>
        </h2>
        <p>
          Thank you — someone will be in touch shortly. If it is urgent,
          calling is fastest
          {phone ? (
            <>
              {" "}
              — <a href={`tel:${phone}`}>{phone}</a>
            </>
          ) : null}
          .
        </p>
      </div>
    );
  }

  return (
    <div className="contact-form">
      <h2>
        Send us a <span>Message</span>
      </h2>
      <p>Fill out the form below and we&rsquo;ll get back to you within 24 hours.</p>

      <form action={submit}>
        <input type="hidden" name="marketCode" value={market.code} />
        {vehicleSlug && <input type="hidden" name="vehicleSlug" value={vehicleSlug} />}

        {/* Honeypot. Positioned off-screen rather than display:none, which a
            fair number of bots know to skip. */}
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
            Enquiring about <strong>{vehicleLabel}</strong>
          </p>
        )}

        <div className="form-group">
          <label htmlFor="cf-name">Your Name *</label>
          <input
            id="cf-name"
            type="text"
            name="name"
            placeholder={market.code === "us" ? "John Doe" : "Adebayo Okoro"}
            autoComplete="name"
            required
          />
          {err("name") && <span className="field-error">{err("name")}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="cf-phone">Phone Number *</label>
          <input
            id="cf-phone"
            type="tel"
            name="phone"
            placeholder={market.code === "us" ? "(336) 555-0100" : "080 1234 5678"}
            autoComplete="tel"
            required
          />
          {err("phone") && <span className="field-error">{err("phone")}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="cf-email">Email</label>
          <input
            id="cf-email"
            type="email"
            name="email"
            placeholder="john@example.com"
            autoComplete="email"
          />
          {err("email") && <span className="field-error">{err("email")}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="cf-interest">I&rsquo;m interested in</label>
          <select id="cf-interest" name="type" defaultValue={defaultType}>
            {INTERESTS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </div>

        {/* Not in the original, which collected a message and then had no way
            to reply to it. Asking how someone wants to be reached costs one
            field and decides whether the follow-up lands. */}
        <div className="form-group">
          <label htmlFor="cf-contact">Best way to reach you</label>
          <select id="cf-contact" name="preferredContact" defaultValue="phone">
            <option value="phone">Phone call</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="cf-message">Message *</label>
          <textarea
            id="cf-message"
            name="message"
            placeholder="How can we help you?"
            required
          />
        </div>

        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Sending…" : "Send Message"} <i className="fas fa-paper-plane" />
        </button>

        <p className="form-privacy">
          We use your details only to answer this enquiry.
        </p>
      </form>
    </div>
  );
}
