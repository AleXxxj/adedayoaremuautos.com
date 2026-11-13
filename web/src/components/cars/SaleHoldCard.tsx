"use client";

import { useActionState, useEffect, useState } from "react";
import { startSaleHold, saleHoldStaffPreview, type HoldActionResult } from "@/lib/actions/saleHolds";
import { useFormTimer } from "@/lib/useFormTimer";
import type { MarketCode } from "@/lib/market";
import "@/styles/sale-hold.css";

/**
 * "Hold this car": one more card in "Paying for it" on a car for sale.
 *
 * Closed until tapped, like the cards beside it. Open, it is the four terms,
 * three boxes (the third optional), one checkbox and one button that leaves
 * for Stripe's payment page. No card field exists here or anywhere on this
 * site.
 *
 * Every number and sentence arrives as a prop from
 * src/lib/saleHolds/settings.ts, where the founder confirms them.
 *
 * When Stripe is in test mode the button is disabled and the card says so,
 * because a test checkout declines every real card. A signed-in member of
 * staff is the exception, so the founder can try it with Stripe's test
 * cards: the card asks the server once, when it is opened.
 */
export function SaleHoldCard({
  market,
  slug,
  amount,
  hours,
  terms,
  testMode,
}: {
  market: MarketCode;
  slug: string;
  /** The deposit, formatted: "$200". */
  amount: string;
  hours: number;
  terms: string[];
  testMode: boolean;
}) {
  const [state, action, pending] = useActionState<HoldActionResult | null, FormData>(
    startSaleHold,
    null,
  );
  const { hydrated, elapsedMs } = useFormTimer();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [opened, setOpened] = useState(false);
  const [staff, setStaff] = useState(false);

  useEffect(() => {
    // Stripe's page is not ours, so this is a full navigation.
    if (state?.ok && state.url) window.location.href = state.url;
  }, [state]);

  useEffect(() => {
    if (!testMode || !opened) return;
    let live = true;
    saleHoldStaffPreview()
      .then((yes) => {
        if (live) setStaff(yes);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [testMode, opened]);

  const locked = testMode && !staff;
  const leaving = pending || Boolean(state?.ok);
  const err = (field: string) => state?.fieldErrors?.[field]?.[0];

  return (
    <details className="cd-pay sh" onToggle={(e) => e.currentTarget.open && setOpened(true)}>
      <summary>
        <span className="cd-pay-icon">
          <i className="fas fa-hourglass-half" aria-hidden="true" />
        </span>
        <span className="cd-pay-words">
          <strong>Hold this car for {hours} hours</strong>
          <span>{amount} refundable deposit</span>
        </span>
        <i className="fas fa-chevron-down cd-pay-turn" aria-hidden="true" />
      </summary>

      <div className="cd-pay-body">
        <ul className="sh-terms">
          {terms.map((line) => (
            <li key={line}>
              <i className="fas fa-check" aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        {testMode && (
          <p className="sh-test" role="note">
            <i className="fas fa-flask" aria-hidden="true" />
            <span>
              {staff
                ? "Staff preview. Card payments are in test mode: use a Stripe test card. No real money moves."
                : "Card payments are in test mode. Nothing can be charged yet. Call us to hold this car."}
            </span>
          </p>
        )}

        <form
          className="sh-form"
          action={(data) => {
            data.set("elapsedMs", String(elapsedMs()));
            action(data);
          }}
        >
          <input type="hidden" name="marketCode" value={market} />
          <input type="hidden" name="slug" value={slug} />
          {/* Hidden from people, filled in by bots. */}
          <div aria-hidden style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}>
            <input type="text" name="leave_empty" tabIndex={-1} autoComplete="off" />
          </div>

          <div className="cd-field">
            <label htmlFor="sh-name">Your name</label>
            <input
              id="sh-name"
              name="name"
              required
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={err("name") ? true : undefined}
              aria-describedby={err("name") ? "sh-name-err" : undefined}
            />
            {err("name") && (
              <p className="cd-error" id="sh-name-err" role="alert">
                {err("name")}
              </p>
            )}
          </div>

          <div className="cd-field">
            <label htmlFor="sh-phone">Phone</label>
            <input
              id="sh-phone"
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              inputMode="tel"
              enterKeyHint="next"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={err("phone") ? true : undefined}
              aria-describedby={err("phone") ? "sh-phone-err" : undefined}
            />
            {err("phone") && (
              <p className="cd-error" id="sh-phone-err" role="alert">
                {err("phone")}
              </p>
            )}
          </div>

          <div className="cd-field">
            <label htmlFor="sh-email">
              Email <span>(optional)</span>
            </label>
            <input
              id="sh-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              enterKeyHint="done"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={err("email") ? true : undefined}
              aria-describedby={err("email") ? "sh-email-err" : undefined}
            />
            {err("email") && (
              <p className="cd-error" id="sh-email-err" role="alert">
                {err("email")}
              </p>
            )}
          </div>

          <label className="sh-agree">
            <input
              type="checkbox"
              name="terms"
              required
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              aria-describedby={err("terms") ? "sh-terms-err" : undefined}
            />
            <span>I agree to the hold terms above.</span>
          </label>
          {err("terms") && (
            <p className="cd-error" id="sh-terms-err" role="alert">
              {err("terms")}
            </p>
          )}

          {state?.error && (
            <p className="cd-error" role="alert">
              {state.error}
            </p>
          )}

          <button type="submit" className="cd-btn" disabled={locked || leaving || !hydrated}>
            <i className="fas fa-lock" aria-hidden="true" />
            {leaving ? "Opening secure checkout…" : `Pay ${amount} to hold it`}
          </button>
        </form>

        <p className="cd-fine">
          You pay on Stripe&rsquo;s secure page. Card details never reach this website. The sale
          itself is finished in person.
        </p>
      </div>
    </details>
  );
}
