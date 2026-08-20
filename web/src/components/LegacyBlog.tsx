"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  subscribeToNewsletter,
  submitComment,
  type BlogResult,
} from "@/lib/actions/blog";
import type { MarketCode } from "@/lib/market";

/* ── Newsletter ────────────────────────────────────────────────────────── */

/**
 * The original newsletter form, reproduced — with an action.
 *
 * The legacy `<form class="newsletter-form">` had no `action` and no handler,
 * so the browser discarded every address on submit. Nobody who ever typed
 * their email into that box is on a list.
 */
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function LegacyNewsletter({
  market,
  source,
}: {
  market: MarketCode;
  source: string;
}) {
  const [state, action, pending] = useActionState<BlogResult | null, FormData>(
    subscribeToNewsletter,
    null,
  );

  return (
    <div className="newsletter-section">
      <div className="newsletter-content">
        <h2>
          Subscribe to Our <span>Newsletter</span>
        </h2>

        {state?.ok ? (
          <p>
            {state.already
              ? "You are on the list — thank you."
              : "Thank you. We will send the next one to that address."}
          </p>
        ) : (
          <>
            <p>
              Get the latest automotive insights, tips, and exclusive offers
              delivered to your inbox.
            </p>

            <form className="newsletter-form" id="newsletter-form" action={action}>
              <input type="hidden" name="marketCode" value={market} />
              <input type="hidden" name="source" value={source} />
              <div
                aria-hidden
                style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}
              >
                <label>
                  Website
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>

              <input
                type="email"
                name="email"
                placeholder="Your email address"
                autoComplete="email"
                aria-label="Your email address"
                required
              />
              <button type="submit" disabled={pending}>
                {pending ? "Subscribing…" : "Subscribe"}
              </button>
            </form>

            {/* Optional, and the reason is stated where it is asked. A form
                that wants your birthday without saying why reads as data
                harvesting; one that says what it is for reads as a gift.
                Day and month only — the year is never requested. */}
            <details className="newsletter-extra">
              <summary>
                <i className="fas fa-gift" aria-hidden="true" /> Add your
                birthday for a gift <span>optional</span>
              </summary>
              <p className="newsletter-extra-why">
                We use it once a year — to wish you a happy birthday and send
                you an offer. We never ask for the year, and you can
                unsubscribe at any time.
              </p>
              <div className="newsletter-extra-fields">
                <label>
                  <span>First name</span>
                  <input
                    type="text"
                    name="firstName"
                    form="newsletter-form"
                    autoComplete="given-name"
                    placeholder="Optional"
                  />
                </label>
                <label>
                  <span>Day</span>
                  <input
                    type="number"
                    name="birthDay"
                    form="newsletter-form"
                    min={1}
                    max={31}
                    placeholder="DD"
                  />
                </label>
                <label>
                  <span>Month</span>
                  <select name="birthMonth" form="newsletter-form" defaultValue="">
                    <option value="">—</option>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {state?.fieldErrors?.birthDay && (
                <p className="newsletter-error" role="alert">
                  {state.fieldErrors.birthDay[0]}
                </p>
              )}
            </details>

            {(state?.error || state?.fieldErrors?.email) && (
              <p className="newsletter-error" role="alert">
                {state.error ?? state.fieldErrors?.email?.[0]}
              </p>
            )}

            <p className="newsletter-privacy">
              One email at a time, and an unsubscribe link in every one.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Comments ──────────────────────────────────────────────────────────── */

/**
 * The original comment form, reproduced — but held for moderation.
 *
 * The legacy page printed three invented comments from people who do not
 * exist above a form that posted nowhere. Comments here are real, and none of
 * them appears publicly until staff approve it.
 */
export function LegacyCommentForm({
  market,
  articleSlug,
}: {
  market: MarketCode;
  articleSlug: string;
}) {
  const [state, action, pending] = useActionState<BlogResult | null, FormData>(
    submitComment,
    null,
  );

  const mountedAt = useRef(0);
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  const submit = (formData: FormData) => {
    formData.set("renderedAt", String(mountedAt.current));
    return action(formData);
  };

  const err = (f: string) => state?.fieldErrors?.[f]?.[0];

  if (state?.ok) {
    return (
      <p className="comment-thanks">
        <i className="fas fa-check-circle" /> Thank you — your comment has been
        sent for review and will appear once approved.
      </p>
    );
  }

  return (
    <form className="comment-form" action={submit}>
      <input type="hidden" name="articleSlug" value={articleSlug} />
      <input type="hidden" name="marketCode" value={market} />
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

      <div className="comment-form-row">
        <div className="form-group">
          <label htmlFor="c-name">Your Name *</label>
          <input id="c-name" type="text" name="name" autoComplete="name" required />
          {err("name") && <span className="field-error">{err("name")}</span>}
        </div>
        <div className="form-group">
          <label htmlFor="c-email">Email (not published)</label>
          <input id="c-email" type="email" name="email" autoComplete="email" />
          {err("email") && <span className="field-error">{err("email")}</span>}
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="c-body">Comment *</label>
        <textarea id="c-body" name="body" rows={5} required />
        {err("body") && <span className="field-error">{err("body")}</span>}
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Posting…" : "Post Comment"} <i className="fas fa-paper-plane" />
      </button>

      <p className="comment-note">
        Comments are reviewed before they appear.
      </p>
    </form>
  );
}

/* ── Share ─────────────────────────────────────────────────────────────── */

/**
 * The share row, reproduced — with working links.
 *
 * Every share icon on the original pointed at `#`. These build real share URLs
 * from the page's own location on the client, so they work wherever the site
 * is deployed without a hardcoded domain.
 */
export function LegacyShare({ title, tags }: { title: string; tags: string[] }) {
  const share = (network: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(title);
    const targets: Record<string, string> = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      twitter: `https://twitter.com/intent/tweet?url=${url}&text=${text}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
      whatsapp: `https://wa.me/?text=${text}%20${url}`,
    };
    window.open(targets[network], "_blank", "noopener,noreferrer,width=600,height=500");
  };

  return (
    <div className="share-section">
      <div className="share-tags">
        {tags.map((t) => (
          <span className="share-tag" key={t}>
            #{t}
          </span>
        ))}
      </div>
      <div className="share-icons">
        {(
          [
            ["facebook", "fab fa-facebook-f", "Share on Facebook"],
            ["twitter", "fab fa-x-twitter", "Share on X"],
            ["linkedin", "fab fa-linkedin-in", "Share on LinkedIn"],
            ["whatsapp", "fab fa-whatsapp", "Share on WhatsApp"],
          ] as const
        ).map(([key, icon, label]) => (
          <a
            key={key}
            href="#"
            className="share-icon"
            onClick={share(key)}
            aria-label={label}
          >
            <i className={icon} />
          </a>
        ))}
      </div>
    </div>
  );
}
