"use client";

import { useActionState, useState } from "react";
import {
  sendTestCampaign,
  startCampaign,
  type CampaignResult,
} from "@/lib/actions/campaigns";
import type { MarketCode } from "@/lib/market";

/**
 * Writing and sending a broadcast.
 *
 * Two separate actions share one set of fields: send-to-self, and send-to-all.
 * They are deliberately far apart on the screen and only the second asks you
 * to type a word, because the difference between them is a message to one
 * person and a message to every customer the business has.
 */
export function CampaignComposer({
  markets,
  audience,
}: {
  markets: MarketCode[];
  audience: Record<string, number>;
}) {
  const [market, setMarket] = useState<MarketCode>(markets[0]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [testState, testAction, testing] = useActionState<CampaignResult | null, FormData>(
    sendTestCampaign,
    null,
  );
  const [sendState, sendAction, sending] = useActionState<CampaignResult | null, FormData>(
    startCampaign,
    null,
  );

  const reach = audience[market] ?? 0;
  const ready = subject.trim().length >= 3 && body.trim().length >= 20;

  const field =
    "w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2.5 text-sm";

  // Shared by both forms; each posts its own copy.
  const hidden = (
    <>
      <input type="hidden" name="marketCode" value={market} />
      <input type="hidden" name="subject" value={subject} />
      <input type="hidden" name="body" value={body} />
    </>
  );

  if (sendState?.ok && sendState.progress?.finished) {
    return (
      <div className="rounded-xl border border-[var(--success)]/40 bg-[var(--success)]/10 p-6">
        <p className="font-semibold text-[var(--success)]">Sent</p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{sendState.message}</p>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          It is listed below with what it said and who it went to.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6">
      <h2 className="text-lg font-semibold">Write a broadcast</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Goes to everyone on the mailing list for the market you choose. Every
        copy carries a working unsubscribe link and the business address —
        both are required by law.
      </p>

      <div className="mt-5 space-y-4">
        {markets.length > 1 && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Market</span>
            <select
              value={market}
              onChange={(e) => setMarket(e.target.value as MarketCode)}
              className={field}
            >
              {markets.map((m) => (
                <option key={m} value={m}>
                  {m.toUpperCase()} — {audience[m] ?? 0} subscriber
                  {(audience[m] ?? 0) === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            placeholder="Three new arrivals this week"
            className={field}
          />
          <span className="mt-1 block text-xs text-[var(--text-muted)]">
            This is the line people decide on. Say what is inside, not
            &ldquo;Newsletter #4&rdquo;.
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Message</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            maxLength={20000}
            placeholder={
              "Hello,\n\nWe have just taken in three vehicles that will not last long…\n\nLeave a blank line between paragraphs. Paste a link and it will be clickable."
            }
            className={field}
          />
          <span className="mt-1 block text-xs text-[var(--text-muted)]">
            Plain writing. A blank line starts a new paragraph.
          </span>
        </label>
      </div>

      {/* Step one: to yourself. */}
      <form action={testAction} className="mt-6 border-t border-[var(--border-subtle)] pt-5">
        {hidden}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!ready || testing}
            className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {testing ? "Sending…" : "Send a test to myself"}
          </button>
          <span className="text-xs text-[var(--text-muted)]">
            Always do this first. You cannot recall a broadcast.
          </span>
        </div>

        {testState?.message && (
          <p className="mt-3 rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 px-3 py-2 text-sm text-[var(--success)]">
            {testState.message}
          </p>
        )}
        {testState?.error && (
          <p className="mt-3 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
            {testState.error}
          </p>
        )}
      </form>

      {/* Step two: to everyone. */}
      <form action={sendAction} className="mt-6 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/5 p-4">
        {hidden}
        <p className="text-sm font-medium">
          Send to all {reach} subscriber{reach === 1 ? "" : "s"} in{" "}
          {market.toUpperCase()}
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          There is no undo. Type SEND to confirm.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            name="confirm"
            placeholder="SEND"
            autoComplete="off"
            className="w-28 rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 text-sm uppercase"
          />
          <button
            type="submit"
            disabled={!ready || sending || reach === 0}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-50"
          >
            {sending ? "Sending…" : `Send to ${reach}`}
          </button>
        </div>

        {sendState?.fieldErrors?.confirm && (
          <p className="mt-3 text-sm text-[var(--danger)]">
            {sendState.fieldErrors.confirm[0]}
          </p>
        )}
        {sendState?.error && (
          <p className="mt-3 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
            {sendState.error}
          </p>
        )}
        {sendState?.ok && sendState.message && (
          <p className="mt-3 rounded-lg border border-[var(--info)]/40 bg-[var(--info)]/10 px-3 py-2 text-sm">
            {sendState.message}
          </p>
        )}
      </form>
    </div>
  );
}
