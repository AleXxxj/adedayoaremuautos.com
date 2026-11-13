"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionToast } from "@/components/Toast";
import { requestExtension, type ExtensionResult } from "@/lib/actions/extensions";
import "@/styles/extensions.css";

/**
 * "Need it longer?" on the renter's own booking page.
 *
 * Tap a length, see the added cost, tap "Ask to keep it". Nothing here works
 * out a price or decides whether the car is free: every figure and every
 * date on offer arrives from the server already computed, and the server
 * prices the request again when it is sent. The browser sends a number of
 * days.
 */

export interface ExtendChoice {
  days: number;
  /** "2026-11-27", for the date input. */
  newEnd: string;
  /** "Fri, Nov 27" */
  newEndLabel: string;
  /** "$350", or null when the extra days cost nothing more. */
  added: string | null;
  newTotal: string;
  /** "$50" when the longer rental reached a better rate. */
  saving: string | null;
}

export interface ExtendStatus {
  status: "pending" | "approved" | "declined";
  newEndLabel: string;
  added: string | null;
}

export function ExtendCard({
  token,
  marketCode,
  choices,
  latest,
  canAsk,
  blockText,
  bookedFromLabel,
}: {
  token: string;
  marketCode: string;
  /** Every length that can be asked for, shortest first. */
  choices: ExtendChoice[];
  latest: ExtendStatus | null;
  canAsk: boolean;
  /** Why nothing can be asked for, when that is the case. */
  blockText: string | null;
  /** "Fri, Nov 27" when another booking starts then. */
  bookedFromLabel: string | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ExtensionResult | null, FormData>(
    requestExtension,
    null,
  );
  useActionToast(state);

  const byDays = (n: number) => choices.find((c) => c.days === n) ?? null;
  const first = byDays(7) ?? choices[0] ?? null;
  const [days, setDays] = useState<number | null>(first?.days ?? null);
  const [picking, setPicking] = useState(false);
  const picked = days == null ? null : byDays(days);

  // The page is the record: once the request is saved, show what the server has.
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const sent = state?.ok === true;
  const showForm = canAsk && !sent && choices.length > 0;

  return (
    <section className="ext-card" aria-labelledby="ext-title">
      <p className="ext-eyebrow">Need it longer?</p>
      <h2 id="ext-title" className="ext-title">
        Keep it another week
      </h2>

      {latest && !sent && <StatusLine s={latest} />}
      {sent && (
        <p className="ext-status ext-status-pending" role="status">
          <i className="fas fa-clock" aria-hidden="true" />
          <span>
            <strong>Sent.</strong> Waiting for our team. This page shows the answer.
          </span>
        </p>
      )}

      {!showForm && !sent && blockText && <p className="ext-note">{blockText}</p>}

      {showForm && (
        <form action={action} className="ext-form">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="marketCode" value={marketCode} />
          <input type="hidden" name="addedDays" value={picked?.days ?? ""} />

          <div className="ext-chips" role="group" aria-label="How much longer">
            {[7, 14].map((n) => {
              const c = byDays(n);
              const on = !picking && days === n;
              return (
                <button
                  key={n}
                  type="button"
                  className={`ext-chip${on ? " is-on" : ""}`}
                  aria-pressed={on}
                  disabled={!c}
                  onClick={() => {
                    setPicking(false);
                    setDays(n);
                  }}
                >
                  {n === 7 ? "1 more week" : "2 more weeks"}
                  {!c && <span className="ext-chip-sub">Not free</span>}
                </button>
              );
            })}
            <button
              type="button"
              className={`ext-chip${picking ? " is-on" : ""}`}
              aria-pressed={picking}
              onClick={() => setPicking(true)}
            >
              <i className="fas fa-calendar-day" aria-hidden="true" /> Pick a date
            </button>
          </div>

          {picking && (
            <label className="ext-date">
              <span>New return date</span>
              <input
                type="date"
                min={choices[0].newEnd}
                max={choices[choices.length - 1].newEnd}
                value={picked?.newEnd ?? ""}
                onChange={(e) => {
                  const c = choices.find((x) => x.newEnd === e.target.value);
                  setDays(c ? c.days : null);
                }}
              />
            </label>
          )}

          {picked ? (
            <dl className="ext-sum">
              <div>
                <dt>New return</dt>
                <dd>{picked.newEndLabel}</dd>
              </div>
              <div>
                <dt>Added cost</dt>
                <dd className="ext-money">{picked.added ? `+${picked.added}` : "No extra cost"}</dd>
              </div>
              <div>
                <dt>New total</dt>
                <dd>{picked.newTotal}</dd>
              </div>
            </dl>
          ) : (
            <p className="ext-note" role="status">
              Pick a date from {choices[0].newEndLabel} to{" "}
              {choices[choices.length - 1].newEndLabel}.
            </p>
          )}

          {picked?.saving && (
            <p className="ext-fact">
              <i className="fas fa-tag" aria-hidden="true" />
              Longer rental, better rate: {picked.saving} less than these days alone.
            </p>
          )}
          {picked && (
            <p className="ext-fact">
              <i className="fas fa-circle-check" aria-hidden="true" />
              The car is free for these dates.
            </p>
          )}
          {bookedFromLabel && (
            <p className="ext-fact">
              <i className="fas fa-calendar-xmark" aria-hidden="true" />
              Booked by someone else from {bookedFromLabel}.
            </p>
          )}

          {state?.error && (
            <p className="ext-error" role="alert">
              {state.error}
            </p>
          )}

          <button type="submit" className="ext-submit" disabled={pending || !picked}>
            {pending ? "Sending…" : "Ask to keep it"}
          </button>
          <p className="ext-note">
            No charge now. We confirm first. You pay the added cost with us, not online.
          </p>
        </form>
      )}
    </section>
  );
}

function StatusLine({ s }: { s: ExtendStatus }) {
  if (s.status === "pending") {
    return (
      <p className="ext-status ext-status-pending" role="status">
        <i className="fas fa-clock" aria-hidden="true" />
        <span>
          <strong>You asked to keep it until {s.newEndLabel}</strong>
          {s.added ? ` (+${s.added})` : ""}. Waiting for our team. This page shows the answer.
        </span>
      </p>
    );
  }
  if (s.status === "approved") {
    return (
      <p className="ext-status ext-status-ok" role="status">
        <i className="fas fa-circle-check" aria-hidden="true" />
        <span>
          <strong>Approved. Yours until {s.newEndLabel}.</strong>
          {s.added ? ` Added cost ${s.added}, paid with us, not online.` : ""}
        </span>
      </p>
    );
  }
  return (
    <p className="ext-status ext-status-no" role="status">
      <i className="fas fa-circle-xmark" aria-hidden="true" />
      <span>
        <strong>We could not add days until {s.newEndLabel}.</strong> Call us and we will
        look at other dates.
      </span>
    </p>
  );
}
