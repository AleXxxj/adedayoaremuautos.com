"use client";

import { useActionToast } from "@/components/Toast";

import { useActionState, useEffect, useRef } from "react";
import { joinReferralProgramme, type PartnerResult } from "@/lib/actions/referral";
import type { MarketConfig } from "@/lib/market";
import { useFormTimer } from "@/lib/useFormTimer";

/** The fields folded under "Add more about you". None is required. */
const OPTIONAL = ["whatsapp", "businessName", "city", "applicantSite"];

/**
 * Applying to become a referral partner.
 *
 * This used to hand over a live code on the spot, which was right while the
 * code only tagged an enquiry. Now that it leads to commission, a person
 * reviews the application first — so what the applicant gets is an
 * acknowledgement and a clear promise about when they will hear back, not a
 * link that would not work yet.
 *
 * The promise is one business day, and it is made in three places: here, in
 * the acknowledgement email, and in the alert to staff. A program that goes
 * quiet after an application is worse than no program.
 *
 * On a phone it shows the four fields the application needs, each with the
 * keyboard and autofill that suit it; the four optional ones are folded under
 * "Add more about you (optional)". Folded fields are still sent: a closed
 * <details> hides its fields without taking them out of the form. Field
 * names, and what the action checks, are unchanged.
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

  // How long the form has been on screen goes with it, as the bot check.
  const { hydrated, elapsedMs } = useFormTimer();

  const more = useRef<HTMLDetailsElement>(null);

  const submit = (formData: FormData) => {
    formData.set("elapsedMs", String(elapsedMs()));
    return action(formData);
  };

  const err = (f: string) => state?.fieldErrors?.[f]?.[0];

  /*
   * A folded field with a problem is unfolded, so its message can be seen.
   * By the browser (a website address it can't read) before sending, in the
   * same moment, so it can show the field; by the server, after.
   */
  const reveal = () => {
    if (more.current) more.current.open = true;
  };
  const optionalError = OPTIONAL.some((f) => state?.fieldErrors?.[f]?.length);
  useEffect(() => {
    if (optionalError && more.current) more.current.open = true;
  }, [optionalError]);

  /** Links a field to its hint and its error, for a screen reader. */
  const describedBy = (id: string, f: string, hint = false) =>
    [hint && `${id}-hint`, err(f) && `${id}-err`].filter(Boolean).join(" ") || undefined;

  const errorFor = (id: string, f: string) =>
    err(f) ? (
      <span id={`${id}-err`} className="rf-error">
        {err(f)}
      </span>
    ) : null;

  if (state?.ok && state.pending) {
    return (
      <div className="rf-form">
        <h2 id="rf-apply-title" className="rf-h2">
          Application <span>received</span>
        </h2>
        <p className="rf-sub">
          Thank you. We have your application and someone will read it
          properly.
        </p>
        <ul className="rf-next">
          <li>
            <i className="fas fa-envelope" aria-hidden="true" />
            <span>
              Check your inbox — we have sent a confirmation, and the decision
              follows <strong>within 1&nbsp;business day</strong>.
            </span>
          </li>
          <li>
            <i className="fas fa-file-signature" aria-hidden="true" />
            <span>
              If we go ahead, the next step is a short agreement to read and
              accept.
            </span>
          </li>
          <li>
            <i className="fas fa-shield-halved" aria-hidden="true" />
            <span>
              Nothing is owed by you at any point, and we never ask for bank
              details on this website.
            </span>
          </li>
        </ul>
      </div>
    );
  }

  if (state?.ok && state.code && state.link) {
    return (
      <div className="rf-form">
        <h2 id="rf-apply-title" className="rf-h2">
          You&rsquo;re <span>in</span>
        </h2>
        <p className="rf-sub">
          This is your referral link. Anyone who opens it and contacts us within 90
          days is recorded against your name.
        </p>

        <div className="rf-code">
          <span>Your code</span>
          <strong>{state.code}</strong>
        </div>

        <div className="rf-code">
          <span>Your link</span>
          {/* Selectable rather than a copy button alone: on a phone the share
              sheet is reached by long-pressing the text itself. */}
          <code>{state.link}</code>
        </div>

        <ul className="rf-next">
          <li>
            <i className="fas fa-share-nodes" aria-hidden="true" />
            <span>
              Share the link, or just tell people your code — we can enter it
              by hand.
            </span>
          </li>
          <li>
            <i className="fas fa-receipt" aria-hidden="true" />
            <span>
              We confirm every rental before paying out, so keep your own note
              of who you sent.
            </span>
          </li>
          <li>
            <i className="fas fa-phone" aria-hidden="true" />
            <span>
              Commission is arranged directly with you. We never ask for bank
              details on this website.
            </span>
          </li>
        </ul>
      </div>
    );
  }

  return (
    <div className="rf-form">
      <h2 id="rf-apply-title" className="rf-h2">
        Become a <span>partner</span>
      </h2>
      <p className="rf-sub">Takes 2 minutes. We reply within 1&nbsp;business day.</p>

      <form action={submit} className="rf-fields">
        <input type="hidden" name="marketCode" value={market.code} />

        <div
          aria-hidden
          style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}
        >
          <label>
            Leave this empty
            <input type="text" name="leave_empty" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        {state?.error && (
          <p className="rf-alert" role="alert">
            {state.error}
          </p>
        )}

        <div className="rf-field">
          <label htmlFor="rp-name" className="rf-label">
            Your name
          </label>
          <input
            id="rp-name"
            className="rf-input"
            type="text"
            name="fullName"
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="next"
            placeholder={market.code === "us" ? "John Doe" : "Adebayo Okoro"}
            required
            aria-invalid={err("fullName") ? true : undefined}
            aria-describedby={describedBy("rp-name", "fullName")}
          />
          {errorFor("rp-name", "fullName")}
        </div>

        <div className="rf-field">
          <label htmlFor="rp-phone" className="rf-label">
            Phone number
          </label>
          <input
            id="rp-phone"
            className="rf-input"
            type="tel"
            name="phone"
            inputMode="tel"
            autoComplete="tel"
            enterKeyHint="next"
            placeholder={market.code === "us" ? "(336) 555-0100" : "080 1234 5678"}
            required
            aria-invalid={err("phone") ? true : undefined}
            aria-describedby={describedBy("rp-phone", "phone", true)}
          />
          {errorFor("rp-phone", "phone")}
          <span id="rp-phone-hint" className="rf-hint">
            This identifies you. Sign up twice with the same number and you keep
            the same code.
          </span>
        </div>

        <div className="rf-field">
          <label htmlFor="rp-email" className="rf-label">
            Email
          </label>
          <input
            id="rp-email"
            className="rf-input"
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="next"
            placeholder="john@example.com"
            required
            aria-invalid={err("email") ? true : undefined}
            aria-describedby={describedBy("rp-email", "email", true)}
          />
          {errorFor("rp-email", "email")}
          <span id="rp-email-hint" className="rf-hint">
            Every step after this one — the decision, the agreement, your
            account — arrives by email, so we need one that reaches you.
          </span>
        </div>

        {/* The part a human actually reads when deciding. */}
        <div className="rf-field">
          <label htmlFor="rp-proposal" className="rf-label">
            How do you plan to refer customers?
          </label>
          <textarea
            id="rp-proposal"
            className="rf-input"
            name="proposal"
            rows={5}
            required
            placeholder="Tell us who you know, how you would reach them, and anything you already do that puts you in front of car buyers or renters."
            aria-invalid={err("proposal") ? true : undefined}
            aria-describedby={describedBy("rp-proposal", "proposal")}
          />
          {errorFor("rp-proposal", "proposal")}
        </div>

        <details ref={more} className="rf-more">
          <summary>
            <i className="fas fa-plus" aria-hidden="true" />
            Add more about you (optional)
          </summary>
          <div className="rf-more-fields">
            <div className="rf-field">
              <label htmlFor="rp-wa" className="rf-label">
                WhatsApp (if different)
              </label>
              {/* No autofill: it would copy the phone number above into the
                  one field that is only for a different one. */}
              <input
                id="rp-wa"
                className="rf-input"
                type="tel"
                name="whatsapp"
                inputMode="tel"
                autoComplete="off"
                onInvalid={reveal}
                aria-invalid={err("whatsapp") ? true : undefined}
                aria-describedby={describedBy("rp-wa", "whatsapp")}
              />
              {errorFor("rp-wa", "whatsapp")}
            </div>

            <div className="rf-field">
              <label htmlFor="rp-business" className="rf-label">
                Business name (if you have one)
              </label>
              <input
                id="rp-business"
                className="rf-input"
                type="text"
                name="businessName"
                autoComplete="organization"
                onInvalid={reveal}
                aria-invalid={err("businessName") ? true : undefined}
                aria-describedby={describedBy("rp-business", "businessName")}
              />
              {errorFor("rp-business", "businessName")}
            </div>

            <div className="rf-field">
              <label htmlFor="rp-city" className="rf-label">
                Town or city
              </label>
              <input
                id="rp-city"
                className="rf-input"
                type="text"
                name="city"
                autoComplete="address-level2"
                placeholder={market.code === "us" ? "Greensboro" : "Lagos"}
                onInvalid={reveal}
                aria-invalid={err("city") ? true : undefined}
                aria-describedby={describedBy("rp-city", "city")}
              />
              {errorFor("rp-city", "city")}
            </div>

            <div className="rf-field">
              <label htmlFor="rp-site" className="rf-label">
                Website or social page
              </label>
              <input
                id="rp-site"
                className="rf-input"
                type="url"
                name="applicantSite"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="https://"
                onInvalid={reveal}
                aria-invalid={err("applicantSite") ? true : undefined}
                aria-describedby={describedBy("rp-site", "applicantSite")}
              />
              {errorFor("rp-site", "applicantSite")}
            </div>
          </div>
        </details>

        <button
          type="submit"
          className="rf-btn rf-btn--primary rf-submit"
          disabled={pending || !hydrated}
        >
          {pending ? "Sending…" : "Send my application"}
          <i className="fas fa-paper-plane" aria-hidden="true" />
        </button>

        <p className="rf-privacy">
          We use your details only to assess your application, record
          referrals and pay you. No bank details are ever collected on this
          website.
        </p>
      </form>
    </div>
  );
}
