"use client";

import { useActionToast } from "@/components/Toast";

import { useActionState, useEffect, useRef } from "react";
import { joinReferralProgramme, type PartnerResult } from "@/lib/actions/referral";
import type { MarketConfig } from "@/lib/market";

/**
 * Applying to become a referral partner.
 *
 * This used to hand over a live code on the spot, which was right while the
 * code only tagged an enquiry. Now that it leads to commission, a person
 * reviews the application first — so what the applicant gets is an
 * acknowledgement and a clear promise about when they will hear back, not a
 * link that would not work yet.
 *
 * The promise is one working day, and it is made in three places: here, in
 * the acknowledgement email, and in the alert to staff. A programme that goes
 * quiet after an application is worse than no programme.
 */
export function ReferralSignup({ market }: { market: MarketConfig }) {
  const [state, action, pending] = useActionState<PartnerResult | null, FormData>(
    joinReferralProgramme,
    null,
  );
  // Named rather than left to the default "Saved." — this is a member of the
  // public who has just applied for something, not a staff member who pressed
  // Save, and the announcement is what a screen reader reads out.
  useActionToast(state, "Application sent — check your email.");

  // Mount time in a ref, stamped on at submit — the same shape the other
  // public forms use, so a script that posts instantly is recognised.
  const mountedAt = useRef(0);
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  const submit = (formData: FormData) => {
    formData.set("renderedAt", String(mountedAt.current));
    return action(formData);
  };

  const err = (f: string) => state?.fieldErrors?.[f]?.[0];

  if (state?.ok && state.pending) {
    return (
      <div className="contact-form referral-form">
        <h2>
          Application <span>received</span>
        </h2>
        <p>
          Thank you. We have your application and someone will read it
          properly.
        </p>
        <ul className="referral-next">
          <li>
            <i className="fas fa-envelope" /> Check your inbox — we have sent a
            confirmation, and the decision follows{" "}
            <strong>within one working day</strong>.
          </li>
          <li>
            <i className="fas fa-file-signature" /> If we go ahead, the next
            step is a short agreement to read and accept.
          </li>
          <li>
            <i className="fas fa-shield-halved" /> Nothing is owed by you at any
            point, and we never ask for bank details on this website.
          </li>
        </ul>
      </div>
    );
  }

  if (state?.ok && state.code && state.link) {
    return (
      <div className="contact-form referral-form">
        <h2>
          You&rsquo;re <span>In</span>
        </h2>
        <p>
          This is your referral link. Anyone who opens it and enquires within 90
          days is recorded against your name.
        </p>

        <div className="referral-code-box">
          <span className="referral-code-label">Your code</span>
          <strong className="referral-code">{state.code}</strong>
        </div>

        <div className="referral-link-box">
          <span className="referral-code-label">Your link</span>
          {/* Selectable rather than a copy button alone: on a phone the share
              sheet is reached by long-pressing the text itself. */}
          <code className="referral-link">{state.link}</code>
        </div>

        <ul className="referral-next">
          <li>
            <i className="fas fa-share-nodes" /> Share the link, or just tell
            people your code — we can enter it by hand.
          </li>
          <li>
            <i className="fas fa-receipt" /> We confirm every sale before paying
            out, so keep your own note of who you sent.
          </li>
          <li>
            <i className="fas fa-phone" /> Commission is arranged directly with
            you. We never ask for bank details on this website.
          </li>
        </ul>
      </div>
    );
  }

  return (
    <div className="contact-form referral-form">
      <h2>
        Become a <span>Partner</span>
      </h2>
      <p>
        Takes a couple of minutes. We read every application and reply within
        one working day.
      </p>

      <form action={submit}>
        <input type="hidden" name="marketCode" value={market.code} />

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
          <label htmlFor="rp-name">Your Name *</label>
          <input
            id="rp-name"
            type="text"
            name="fullName"
            autoComplete="name"
            placeholder={market.code === "us" ? "John Doe" : "Adebayo Okoro"}
            required
          />
          {err("fullName") && <span className="field-error">{err("fullName")}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="rp-phone">Phone Number *</label>
          <input
            id="rp-phone"
            type="tel"
            name="phone"
            autoComplete="tel"
            placeholder={market.code === "us" ? "(336) 555-0100" : "080 1234 5678"}
            required
          />
          {err("phone") && <span className="field-error">{err("phone")}</span>}
          <span className="form-hint">
            This identifies you. Sign up twice with the same number and you keep
            the same code.
          </span>
        </div>

        <div className="form-group">
          <label htmlFor="rp-email">Email *</label>
          <input
            id="rp-email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="john@example.com"
            required
          />
          <span className="form-hint">
            Every step after this one — the decision, the agreement, your
            account — arrives by email, so we need one that reaches you.
          </span>
          {err("email") && <span className="field-error">{err("email")}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="rp-wa">WhatsApp (if different)</label>
          <input id="rp-wa" type="tel" name="whatsapp" placeholder="Optional" />
        </div>

        <div className="form-group">
          <label htmlFor="rp-business">Business name (if you have one)</label>
          <input id="rp-business" type="text" name="businessName" placeholder="Optional" />
        </div>

        <div className="form-group">
          <label htmlFor="rp-city">Town or city</label>
          <input
            id="rp-city"
            type="text"
            name="city"
            placeholder={market.code === "us" ? "Greensboro" : "Lagos"}
          />
        </div>

        <div className="form-group">
          <label htmlFor="rp-site">Website or social page</label>
          <input id="rp-site" type="url" name="applicantSite" placeholder="Optional" />
        </div>

        {/* The part a human actually reads when deciding. */}
        <div className="form-group">
          <label htmlFor="rp-proposal">How do you plan to refer customers? *</label>
          <textarea
            id="rp-proposal"
            name="proposal"
            rows={5}
            required
            placeholder="Tell us who you know, how you would reach them, and anything you already do that puts you in front of car buyers or renters."
          />
          {err("proposal") && <span className="field-error">{err("proposal")}</span>}
        </div>

        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Sending…" : "Send my application"}{" "}
          <i className="fas fa-hand-holding-usd" />
        </button>

        <p className="form-privacy">
          We use your details only to assess your application, record
          referrals and pay you. No bank details are ever collected on this
          website.
        </p>
      </form>
    </div>
  );
}
