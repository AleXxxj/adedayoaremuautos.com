"use client";

import { useActionState, useState } from "react";
import { useActionToast } from "@/components/Toast";
import { sendAnnouncement, type AnnounceResult } from "@/lib/actions/announce";
import {
  INTRO_MAX,
  defaultIntro,
  draftFor,
  type Announceable,
} from "@/lib/campaign/announceDraft";
import { renderAnnouncementHtml } from "@/lib/campaign/announceMail";
import type { MarketCode } from "@/lib/market";

/**
 * Telling subscribers about a new guide (US) or article (Nigeria).
 *
 * Tap the guide, tap Send, confirm. The message is the guide's own title, its
 * one line and its address; the only thing to type is optional, the short
 * line above the title. Both previews are drawn by the same code that sends,
 * so what is shown is what goes out.
 *
 * Nothing here sends by itself. Send only opens the confirm step; the form
 * posts from the confirm button and nowhere else.
 */
export interface AnnounceItem extends Announceable {
  /** "Nov 13, 2026", made on the server so both renders agree. */
  publishedLabel: string | null;
  /** When it was first announced, or null if it has not been. */
  announcedLabel: string | null;
}

const MARKET_NAME: Record<MarketCode, string> = { us: "United States", ng: "Nigeria" };
const keyOf = (i: Announceable) => `${i.market}:${i.kind}:${i.slug}`;
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function AnnouncePanel({
  markets,
  items,
  emailAudience,
  pushAudience,
  ready,
  siteBase,
  address,
}: {
  markets: MarketCode[];
  items: AnnounceItem[];
  emailAudience: Record<string, number>;
  pushAudience: Record<string, number>;
  /** False until the database update (migration 0036) is applied. */
  ready: boolean;
  siteBase: string;
  address: string;
}) {
  const [state, action, pending] = useActionState<AnnounceResult | null, FormData>(
    sendAnnouncement,
    null,
  );
  useActionToast(state);

  const [market, setMarket] = useState<MarketCode>(markets[0] ?? "us");
  const [picked, setPicked] = useState<{ key: string; again: boolean } | null>(null);
  const [intro, setIntro] = useState("");
  const [byEmail, setByEmail] = useState(true);
  const [byPush, setByPush] = useState(true);
  const [confirming, setConfirming] = useState(false);

  // A result arrived: close the confirm step, and after a send close the
  // draft too. Adjusted during render, which is how React asks for this.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    setConfirming(false);
    if (state?.ok) {
      setPicked(null);
      setIntro("");
    }
  }

  const here = items.filter((i) => i.market === market);
  const fresh = here.filter((i) => !i.announcedLabel);
  const done = here.filter((i) => i.announcedLabel);
  const word = market === "us" ? "guide" : "article";

  const people = emailAudience[market] ?? 0;
  const devices = pushAudience[market] ?? 0;

  function pick(item: AnnounceItem, again: boolean) {
    const key = keyOf(item);
    const same = picked?.key === key;
    setPicked(same ? null : { key, again });
    setIntro("");
    setByEmail(true);
    setByPush(true);
    setConfirming(false);
  }

  function draftPane(item: AnnounceItem) {
    const again = picked?.again ?? false;
    const draft = draftFor(item, siteBase, intro);
    const html = renderAnnouncementHtml({
      draft,
      // A preview link that goes nowhere: nobody can be unsubscribed from here.
      unsubscribeUrl: "#",
      address,
      siteBase,
    });

    const email = byEmail && people > 0;
    const push = byPush && devices > 0;
    const reach = [
      email ? count(people, "person", "people") : null,
      push ? count(devices, "device", "devices") : null,
    ].filter(Boolean);
    const canSend = ready && reach.length > 0;

    return (
      <div className="border-t border-[var(--border-subtle)] px-3 pb-5 pt-4 sm:px-4">
        <label className="block">
          <span className="mb-1.5 flex items-baseline justify-between gap-3 text-sm font-medium">
            <span>
              First line <span className="font-normal text-[var(--text-muted)]">optional</span>
            </span>
            <span className="text-xs font-normal text-[var(--text-muted)]">
              {intro.length}/{INTRO_MAX}
            </span>
          </span>
          <input
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            maxLength={INTRO_MAX}
            placeholder={defaultIntro(item.kind)}
            className="min-h-11 w-full min-w-0 rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] px-3 py-2 text-base outline-none focus:border-[var(--focus)]"
          />
        </label>

        <p className="mb-2 mt-5 text-xs uppercase tracking-wide text-[var(--text-muted)]">
          Send by
        </p>
        <div className="flex flex-wrap gap-2">
          <Choice
            on={email}
            disabled={people === 0}
            onClick={() => setByEmail((v) => !v)}
            icon="fa-envelope"
            label="Email"
            note={count(people, "person", "people")}
          />
          <Choice
            on={push}
            disabled={devices === 0}
            onClick={() => setByPush((v) => !v)}
            icon="fa-bell"
            label="Notification"
            note={count(devices, "device", "devices")}
          />
        </div>

        {email && (
          <div className="mt-5">
            <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Email
            </p>
            <p className="mb-2 break-words text-sm">
              <span className="text-[var(--text-muted)]">Subject: </span>
              {draft.subject}
            </p>
            <iframe
              title="Email preview"
              srcDoc={html}
              sandbox=""
              className="block h-[560px] sm:h-[480px] w-full rounded-lg border border-[var(--border-default)] bg-[#f2f2f2]"
            />
          </div>
        )}

        {push && (
          <div className="mt-5">
            <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Notification
            </p>
            <div className="flex gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-0)] p-3">
              <div className="size-9 flex-none rounded-lg bg-[var(--surface-3)]" aria-hidden />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{draft.push.title}</p>
                <p className="line-clamp-2 text-sm text-[var(--text-secondary)]">
                  {draft.push.body}
                </p>
              </div>
            </div>
          </div>
        )}

        <form action={action} className="mt-5 border-t border-[var(--border-subtle)] pt-4">
          <input type="hidden" name="marketCode" value={item.market} />
          <input type="hidden" name="kind" value={item.kind} />
          <input type="hidden" name="slug" value={item.slug} />
          <input type="hidden" name="intro" value={intro} />
          <input type="hidden" name="email" value={email ? "1" : ""} />
          <input type="hidden" name="push" value={push ? "1" : ""} />
          <input type="hidden" name="again" value={again ? "1" : ""} />
          <input type="hidden" name="confirm" value="yes" />

          {!confirming ? (
            <>
              <button
                type="button"
                disabled={!canSend}
                onClick={() => setConfirming(true)}
                className="min-h-[52px] w-full rounded-full bg-[var(--cta-bg)] px-6 py-2 text-base font-bold leading-tight text-[var(--cta-fg)] disabled:opacity-50 sm:w-auto"
              >
                {reach.length > 0 ? `Send to ${reach.join(" and ")}` : "Send"}
              </button>
              {ready && reach.length === 0 && (
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  {people === 0 && devices === 0
                    ? `Nobody in ${MARKET_NAME[market]} has subscribed yet.`
                    : "Choose email, notification, or both."}
                </p>
              )}
            </>
          ) : (
            <div
              role="alertdialog"
              aria-label="Confirm sending"
              className="rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/5 p-4"
            >
              <p className="font-semibold">Send to {reach.join(" and ")} now?</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {again
                  ? `They already got this on ${item.announcedLabel}. This sends it again. It cannot be undone.`
                  : "It goes out right away. It cannot be undone."}
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={pending}
                  className="min-h-[52px] whitespace-nowrap rounded-full bg-[var(--cta-bg)] px-6 text-base font-bold text-[var(--cta-fg)] disabled:opacity-60"
                >
                  {pending ? "Sending…" : again ? "Yes, send again" : "Yes, send"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirming(false)}
                  className="min-h-[52px] whitespace-nowrap rounded-full border border-[var(--border-strong)] px-6 text-base font-bold"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    );
  }

  function row(item: AnnounceItem, again: boolean) {
    const key = keyOf(item);
    const open = picked?.key === key;
    return (
      <li
        key={key}
        className={`overflow-hidden rounded-xl border bg-[var(--surface-0)] ${
          open ? "border-[var(--border-strong)]" : "border-[var(--border-subtle)]"
        }`}
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={() => pick(item, again)}
          className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block break-words text-sm font-semibold">{item.title}</span>
            <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
              {again
                ? `Announced ${item.announcedLabel}`
                : item.publishedLabel
                  ? `Published ${item.publishedLabel}`
                  : "Not announced"}
            </span>
          </span>
          <span className="flex-none text-sm text-[var(--text-secondary)]">
            <span className="max-sm:sr-only">
              {open ? "Close" : again ? "Send again" : "Announce"}
            </span>
            <i className={`fas ${open ? "fa-chevron-up" : "fa-chevron-down"} ml-2 text-xs`} aria-hidden />
          </span>
        </button>
        {open && draftPane(item)}
      </li>
    );
  }

  return (
    <section className="mt-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Announce {word === "guide" ? "a guide" : "an article"}</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Tell subscribers about something new. Tap one, check it, press Send.
      </p>

      {markets.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Market">
          {markets.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={m === market}
              onClick={() => {
                setMarket(m);
                setPicked(null);
                setConfirming(false);
              }}
              className={`h-11 rounded-full border px-4 text-sm font-semibold ${
                m === market
                  ? "border-[var(--text-primary)] text-[var(--text-primary)]"
                  : "border-[var(--border-default)] text-[var(--text-secondary)]"
              }`}
            >
              {MARKET_NAME[m]}
            </button>
          ))}
        </div>
      )}

      {!ready && (
        <p className="mt-4 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-3 text-sm text-[var(--warning)]">
          Not switched on yet. The database needs one update first. Ask the
          developer. You can still look at the drafts.
        </p>
      )}

      {state?.ok && state.message && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 px-4 py-3 text-sm text-[var(--success)]"
        >
          {state.message}
        </p>
      )}
      {state && !state.ok && state.error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]"
        >
          {state.error}
        </p>
      )}

      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Not announced yet · {fresh.length}
      </h3>
      {fresh.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          {here.length === 0
            ? `No ${word}s in ${MARKET_NAME[market]} yet.`
            : `Every ${word} has been announced.`}
        </p>
      ) : (
        <ul className="space-y-2">{fresh.map((i) => row(i, false))}</ul>
      )}

      {done.length > 0 && (
        <details className="mt-5">
          <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Already announced · {done.length}
          </summary>
          <ul className="mt-2 space-y-2">{done.map((i) => row(i, true))}</ul>
        </details>
      )}
    </section>
  );
}

function Choice({
  on,
  disabled,
  onClick,
  icon,
  label,
  note,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  note: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-11 items-center gap-2 rounded-full border px-4 text-sm disabled:opacity-50 ${
        on
          ? "border-[var(--text-primary)] text-[var(--text-primary)]"
          : "border-[var(--border-default)] text-[var(--text-muted)]"
      }`}
    >
      <i className={`fas ${on ? "fa-check" : icon} text-xs`} aria-hidden />
      <span className="font-semibold">{label}</span>
      <span className="text-[var(--text-muted)]">{note}</span>
    </button>
  );
}
