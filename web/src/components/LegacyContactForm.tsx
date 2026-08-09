"use client";

import { useActionState, useEffect, useState } from "react";
import { submitLead } from "@/lib/actions/leads";
import type { MarketCode } from "@/lib/market";

/**
 * The original "Send us a Message" form, in the original markup — but wired to
 * the real lead pipeline instead of an unconfigured Formspree endpoint.
 *
 * Submissions are validated server-side, written to the database before any
 * notification is attempted, and appear in the admin inbox immediately.
 */
export function LegacyContactForm({ market }: { market: MarketCode }) {
  const [state, action, pending] = useActionState(submitLead, null);
  const [renderedAt, setRenderedAt] = useState(0);

  useEffect(() => setRenderedAt(Date.now()), []);

  if (state?.ok) {
    return (
      <div className="contact-form">
        <h3>Thank you</h3>
        <p style={{ color: "var(--silver-classic)", marginTop: 12, lineHeight: 1.7 }}>
          We have your enquiry and someone will be in touch shortly. If it is
          urgent, calling is fastest.
        </p>
      </div>
    );
  }

  return (
    <form className="contact-form" action={action}>
      <h3>Send us a Message</h3>

      <input type="hidden" name="marketCode" value={market} />
      <input type="hidden" name="type" value="contact" />
      <input type="hidden" name="renderedAt" value={renderedAt} />

      {/* Honeypot — hidden from people, irresistible to bots. */}
      <div aria-hidden style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state?.error && (
        <p style={{ color: "#FF6B5E", marginBottom: 14, fontSize: 14 }}>{state.error}</p>
      )}

      <div className="form-group">
        <input name="name" placeholder="Your Name" required autoComplete="name" />
        {state?.fieldErrors?.name && (
          <span style={{ color: "#FF6B5E", fontSize: 13 }}>{state.fieldErrors.name[0]}</span>
        )}
      </div>

      <div className="form-group">
        <input name="email" type="email" placeholder="Email Address" autoComplete="email" />
        {state?.fieldErrors?.email && (
          <span style={{ color: "#FF6B5E", fontSize: 13 }}>{state.fieldErrors.email[0]}</span>
        )}
      </div>

      <div className="form-group">
        <input name="phone" type="tel" placeholder="Phone Number" required autoComplete="tel" />
        {state?.fieldErrors?.phone && (
          <span style={{ color: "#FF6B5E", fontSize: 13 }}>{state.fieldErrors.phone[0]}</span>
        )}
      </div>

      <div className="form-group">
        <textarea name="message" rows={5} placeholder="How can we help you?" />
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending} style={{ width: "100%" }}>
        {pending ? "SENDING…" : "SEND MESSAGE"} <i className="fas fa-paper-plane" />
      </button>
    </form>
  );
}
