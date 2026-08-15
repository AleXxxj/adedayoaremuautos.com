"use client";

import { useActionState } from "react";
import { joinReferralProgramme, type PartnerResult } from "@/lib/actions/referral";
import type { MarketConfig } from "@/lib/market";

/**
 * Becoming a referral partner.
 *
 * The code and link are shown immediately on success, because the moment
 * someone signs up is the moment they are most likely to share it. Making them
 * wait for an email — on a project with no outbound mail configured — would
 * have meant the link never arrived at all.
 */
export function ReferralSignup({ market }: { market: MarketConfig }) {
  const [state, action, pending] = useActionState<PartnerResult | null, FormData>(
    joinReferralProgramme,
    null,
  );

  const err = (f: string) => state?.fieldErrors?.[f]?.[0];

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
        Takes a minute. You get a link and a code straight away — no waiting for
        approval.
      </p>

      <form action={action}>
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
          <label htmlFor="rp-email">Email</label>
          <input
            id="rp-email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="john@example.com"
          />
          {err("email") && <span className="field-error">{err("email")}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="rp-wa">WhatsApp (if different)</label>
          <input id="rp-wa" type="tel" name="whatsapp" placeholder="Optional" />
        </div>

        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Setting you up…" : "Get my referral link"}{" "}
          <i className="fas fa-hand-holding-usd" />
        </button>

        <p className="form-privacy">
          We use your details only to record referrals and pay you. No bank
          details are ever collected on this website.
        </p>
      </form>
    </div>
  );
}
