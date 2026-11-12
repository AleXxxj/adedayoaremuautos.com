"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MARKETS, type MarketCode } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import {
  PERSONA,
  QUICK_BUDGET_MINOR,
  assistantPage,
  greeting,
  quickReplies,
} from "@/lib/ai/persona";
import { OPEN_ASSISTANT_EVENT, type OpenAssistantDetail } from "@/lib/openAssistant";
import { linkify } from "./assistantText";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

/** Set once the nudge has shown, or the chat has been opened, this session. */
const NUDGE_KEY = "aaa_ayo_nudge";
const NUDGE_AFTER_MS = 8000;
const NUDGE_FOR_MS = 10000;

function nudgedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(NUDGE_KEY) !== null;
  } catch {
    // Storage blocked: treat it as already shown rather than risk repeating.
    return true;
  }
}

function rememberNudged(): void {
  try {
    window.sessionStorage.setItem(NUDGE_KEY, "1");
  } catch {
    /* Nothing to do. */
  }
}

/**
 * The assistant's mark: its initial in a dark badge with a green ring. Not a
 * face (the founder found the smile childish) and not a photo, because the
 * assistant is not a person and should never look like one.
 */
export function AyoAvatar({ size, online = false }: { size: number; online?: boolean }) {
  return (
    <span className="ayo-avatar" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 40 40" width={size} height={size} focusable="false">
        <text
          x="20"
          y="27.5"
          textAnchor="middle"
          fontSize="21"
          fontWeight="700"
          fontFamily="var(--font-space-grotesk), system-ui, sans-serif"
          fill="currentColor"
        >
          {PERSONA.name.charAt(0)}
        </text>
      </svg>
      {online && <span className="ayo-avatar-dot" />}
    </span>
  );
}

/**
 * Ayo, the website assistant.
 *
 * Never opened automatically. A panel that springs open over the page on
 * arrival is the most disliked pattern on a dealership site. The most it does
 * uninvited is one small "Hi, I'm Ayo" beside its button, once per visit, on
 * the home page only, and it takes that back after ten seconds.
 *
 * It says what it is in its own header, for as long as the panel is open:
 * a virtual assistant. Its name and greetings come from lib/ai/persona.ts.
 *
 * The conversation id lives in sessionStorage rather than localStorage: it
 * should survive clicking through to a vehicle page and back, and it should
 * not still be sitting there next week attached to a conversation nobody
 * remembers having.
 *
 * Other parts of the page open it with openAssistant() (lib/openAssistant.ts).
 */
export function Assistant({
  market,
  phone,
  phoneLabel,
}: {
  market: MarketCode;
  /** The showroom's number for the call button, as dialed; null hides it. */
  phone: string | null;
  phoneLabel: string | null;
}) {
  const pathname = usePathname();
  const page = assistantPage(pathname);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState(false);
  // The visitor's hour, read when the panel first opens: never on the server,
  // whose clock is in another time zone and would greet the wrong way.
  const [hour, setHour] = useState<number | null>(null);

  const convId = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  // Where focus goes when the panel opens: the message box when there is
  // something in it to send, or on a desktop; otherwise the panel's title, so
  // a phone's keyboard does not rise over the greeting and its suggestions.
  const focusInput = useRef(false);

  useEffect(() => {
    convId.current = sessionStorage.getItem("aaa_assistant") ?? null;
  }, []);

  // Follow the conversation as it grows, including while a reply streams in.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [msgs, busy, hour]);

  const openPanel = useCallback((prefill?: string) => {
    setOpen(true);
    setNudge(false);
    rememberNudged();
    setHour((h) => h ?? new Date().getHours());
    if (prefill) setInput(prefill);
    focusInput.current =
      Boolean(prefill) || window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }, []);

  // Set when the panel closes with focus inside it, so focus goes back to the
  // launcher once it is shown again (on a phone it is hidden while open).
  const returnFocus = useRef(false);

  const closePanel = useCallback(() => {
    returnFocus.current = Boolean(document.activeElement?.closest("#assistant-panel"));
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) {
      if (returnFocus.current) launcherRef.current?.focus();
      returnFocus.current = false;
      return;
    }
    if (focusInput.current) inputRef.current?.focus();
    else titleRef.current?.focus();
  }, [open]);

  // Escape closes, matching every other dismissible panel on the site.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closePanel]);

  // openAssistant() from anywhere on the page.
  useEffect(() => {
    const onOpen = (e: Event) => {
      openPanel((e as CustomEvent<OpenAssistantDetail>).detail?.text);
    };
    window.addEventListener(OPEN_ASSISTANT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, onOpen);
  }, [openPanel]);

  // The nudge: home page only, once per session, never over another card.
  useEffect(() => {
    if (page !== "home" || nudgedThisSession()) return;
    let hide: number | undefined;
    const show = window.setTimeout(() => {
      // Opened in the meantime, or another card is on screen.
      if (nudgedThisSession()) return;
      if (document.querySelector(".notify-prompt, .country-notification")) return;
      rememberNudged();
      setNudge(true);
      hide = window.setTimeout(() => setNudge(false), NUDGE_FOR_MS);
    }, NUDGE_AFTER_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [page]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setError(null);
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: trimmed }, { role: "assistant", content: "" }]);
    setBusy(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          conversationId: convId.current,
          market,
          path: pathname,
        }),
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `${PERSONA.name} is unavailable right now.`);
      }

      // Newline-delimited JSON. Chunks split anywhere, so the tail of an
      // incomplete line is carried into the next read rather than parsed.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const setLast = (content: (prev: string) => string) =>
        setMsgs((m) => {
          const next = [...m];
          next[next.length - 1] = {
            role: "assistant",
            content: content(next[next.length - 1].content),
          };
          return next;
        });

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: { type: string; text?: string; conversationId?: string; error?: string };
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }

          if (event.type === "id" && event.conversationId) {
            convId.current = event.conversationId;
            sessionStorage.setItem("aaa_assistant", event.conversationId);
          } else if (event.type === "text" && event.text) {
            const chunk = event.text;
            setLast((prev) => prev + chunk);
          } else if (event.type === "replace" && event.text) {
            // The reply was declined partway: what showed is taken back.
            const whole = event.text;
            setLast(() => whole);
          } else if (event.type === "error") {
            setError(event.error ?? "Something went wrong.");
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `${PERSONA.name} is unavailable right now.`);
    } finally {
      // Drop an empty reply bubble: a blank one looks like being ignored.
      setMsgs((m) => (m[m.length - 1]?.content === "" ? m.slice(0, -1) : m));
      setBusy(false);
    }
  }

  const cfg = MARKETS[market];
  const budgetMinor = QUICK_BUDGET_MINOR[market];
  const budget = budgetMinor == null ? null : formatMoney(money(budgetMinor, cfg.currency), cfg.locale);
  const [hello, opener] = hour == null ? ["", ""] : greeting(hour, page);
  const name = PERSONA.name;

  return (
    <>
      {nudge && !open && (
        <div className="ayo-nudge">
          <button type="button" className="ayo-nudge-open" onClick={() => openPanel()}>
            Hi, I&rsquo;m {name}. Need help finding a car?
          </button>
          <button
            type="button"
            className="ayo-nudge-close"
            onClick={() => setNudge(false)}
            aria-label="Dismiss"
          >
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>
      )}

      <button
        ref={launcherRef}
        type="button"
        className={`assistant-launcher${open ? " is-open" : ""}`}
        onClick={() => (open ? closePanel() : openPanel())}
        aria-expanded={open}
        aria-controls="assistant-panel"
        // Starts with the visible label ("Ask Ayo"), so a voice command that
        // reads the button aloud finds it.
        aria-label={open ? "Close the chat" : `Ask ${name}: chat with our virtual assistant`}
      >
        {open ? (
          <span className="ayo-launcher-close">
            <i className="fas fa-times" aria-hidden="true" />
          </span>
        ) : (
          <>
            <span className="ayo-launcher-label" aria-hidden="true">
              Ask {name}
            </span>
            <AyoAvatar size={56} online />
          </>
        )}
      </button>

      <div
        id="assistant-panel"
        className={`assistant-panel${open ? " is-open" : ""}`}
        role="dialog"
        aria-labelledby="ayo-title ayo-subtitle"
        aria-modal="false"
      >
        <div className="assistant-head">
          <AyoAvatar size={40} online />
          <div className="ayo-head-text">
            <strong id="ayo-title" ref={titleRef} tabIndex={-1}>
              {name}
            </strong>
            {/* Stated plainly and for as long as the panel is open. Nobody
                should have to work out whether they are talking to a person. */}
            <span id="ayo-subtitle">Virtual assistant · Replies in seconds</span>
          </div>
          {phone && (
            <a
              href={`tel:${phone}`}
              className="ayo-head-btn"
              aria-label={phoneLabel ? `Call us at ${phoneLabel}` : "Call us"}
            >
              <i className="fas fa-phone" aria-hidden="true" />
            </a>
          )}
          <button type="button" className="ayo-head-btn" onClick={closePanel} aria-label="Close the chat">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <div className="assistant-log" ref={scroller}>
          {hour != null && (
            <>
              <div className="ayo-row">
                <AyoAvatar size={28} />
                <div className="assistant-msg assistant-msg--bot">{hello}</div>
              </div>
              <div className="ayo-row">
                <AyoAvatar size={28} />
                <div className="assistant-msg assistant-msg--bot">{opener}</div>
              </div>
            </>
          )}

          {hour != null && msgs.length === 0 && (
            <div className="ayo-quick" role="group" aria-label="Suggested questions">
              {quickReplies(page, budget).map((q) => (
                <button key={q} type="button" className="ayo-quick-chip" onClick={() => void send(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}

          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="assistant-msg assistant-msg--you">
                {m.content}
              </div>
            ) : (
              <div key={i} className="ayo-row">
                <AyoAvatar size={28} />
                <div className="assistant-msg assistant-msg--bot">
                  {m.content ? (
                    // Only Ayo's own words are linkified. Doing it to the
                    // visitor's message would turn whatever they typed into a
                    // clickable link inside our own interface.
                    linkify(m.content)
                  ) : (
                    <span role="status">
                      <span className="assistant-typing" aria-hidden="true" />
                      <span className="ayo-sr">{name} is typing</span>
                    </span>
                  )}
                </div>
              </div>
            ),
          )}

          {error && (
            <p className="assistant-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <form
          className="assistant-input"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter makes a new line — what a chat window
              // is expected to do.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder={`Message ${name}`}
            rows={1}
            maxLength={2000}
            aria-label={`Your message to ${name}`}
          />
          <button type="submit" disabled={busy || !input.trim()} aria-label="Send">
            <i className="fas fa-paper-plane" aria-hidden="true" />
          </button>
        </form>

        <p className="assistant-foot">
          Prices and stock come from our live listings. We never ask for bank
          details or your {market === "us" ? "SSN" : "BVN"} here.
        </p>
      </div>
    </>
  );
}
