"use client";

import { useActionState, useState } from "react";
import { sendPushBroadcast, type PushFormResult } from "@/lib/actions/push";
import { PushKeyCheck } from "@/components/admin/PushKeyCheck";

/**
 * Sending a notification by hand — an offer, an announcement, a new article.
 *
 * New stock announces itself when a vehicle is published, so this is for
 * everything that has no natural trigger. It sends to browsers, which is a
 * different audience from the mailing list above it: most people here have
 * never given an email address, and plenty who get the emails will not appear
 * in this count.
 */
export function PushComposer({
  markets,
  audience,
}: {
  markets: string[];
  audience: Record<string, number>;
}) {
  const [state, action, pending] = useActionState<PushFormResult | null, FormData>(
    sendPushBroadcast,
    null,
  );
  const [market, setMarket] = useState(markets[0] ?? "us");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const reach = audience[market] ?? 0;
  const err = (f: string) => state?.fieldErrors?.[f]?.[0];

  return (
    <section className="mt-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
      <h2 className="text-lg font-semibold">Send a notification</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Goes to phones and computers that have allowed alerts — a different set
        of people from the mailing list. New vehicles announce themselves
        automatically; this is for offers and announcements.
      </p>

      {state?.error && (
        <p className="mt-4 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {state.error}
        </p>
      )}

      {state?.ok && state.summary && (
        <p className="mt-4 rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 px-4 py-3 text-sm text-[var(--success)]">
          Delivered to {state.summary.sent}{" "}
          {state.summary.sent === 1 ? "device" : "devices"}.
          {state.summary.pruned > 0 &&
            ` ${state.summary.pruned} had turned notifications off and were removed.`}
          {state.summary.failed > 0 && ` ${state.summary.failed} could not be reached.`}
        </p>
      )}

      <form action={action} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Market</span>
            <select
              name="marketCode"
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              className={input}
            >
              {markets.map((m) => (
                <option key={m} value={m}>
                  {m.toUpperCase()} — {audience[m] ?? 0} device
                  {(audience[m] ?? 0) === 1 ? "" : "s"}
                </option>
              ))}
            </select>
            {err("marketCode") && <Err>{err("marketCode")}</Err>}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">
              Link <span className="text-[var(--text-muted)]">optional</span>
            </span>
            <input
              name="url"
              placeholder={`/${market}/inventory`}
              className={input}
            />
            <span className="mt-1 block text-xs text-[var(--text-muted)]">
              A page on this site, starting with /. Defaults to the homepage.
            </span>
            {err("url") && <Err>{err("url")}</Err>}
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 flex items-baseline justify-between text-sm font-medium">
            Title
            <span className={`text-xs ${title.length > 60 ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>
              {title.length}/60
            </span>
          </span>
          <input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="December offer"
            className={input}
          />
          {err("title") && <Err>{err("title")}</Err>}
        </label>

        <label className="block">
          <span className="mb-1.5 flex items-baseline justify-between text-sm font-medium">
            Message
            <span className={`text-xs ${body.length > 160 ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>
              {body.length}/160
            </span>
          </span>
          <textarea
            name="body"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="₦500,000 off every Foreign Used saloon until the 31st."
            className={input}
          />
          {err("body") && <Err>{err("body")}</Err>}
        </label>

        {/* What it will actually look like. A notification is a title, two
            lines and an icon — showing that here stops long copy being
            written for a space that cannot hold it. */}
        {(title || body) && (
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] p-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Preview
            </p>
            <div className="flex gap-3">
              <div className="size-9 flex-none rounded-lg bg-[var(--surface-3)]" aria-hidden />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {title || "Adedayo Aremu Autos"}
                </p>
                <p className="line-clamp-2 text-sm text-[var(--text-secondary)]">
                  {body || "Your message appears here."}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border-subtle)] pt-4">
          <button
            type="submit"
            disabled={pending || reach === 0}
            className="rounded-lg bg-[var(--cta-bg)] px-6 py-2.5 font-semibold text-[var(--cta-fg)] disabled:opacity-60"
          >
            {pending ? "Sending…" : `Send to ${reach} device${reach === 1 ? "" : "s"}`}
          </button>
          {reach === 0 && (
            <span className="text-sm text-[var(--text-muted)]">
              Nobody in {market.toUpperCase()} has allowed notifications yet.
            </span>
          )}
          <span className="w-full text-xs text-[var(--text-muted)]">
            This goes out immediately and cannot be recalled.
          </span>
        </div>
      </form>

      <PushKeyCheck />
    </section>
  );
}

const input =
  "w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 outline-none focus:border-[var(--focus)]";

function Err({ children }: { children: React.ReactNode }) {
  return <span className="mt-1 block text-sm text-[var(--danger)]">{children}</span>;
}
