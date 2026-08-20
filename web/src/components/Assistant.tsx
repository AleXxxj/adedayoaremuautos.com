"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { MarketCode } from "@/lib/market";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const GREETING =
  "Hi — I can help with anything on the site: cars we have in stock, rental rates, or how rent to own works. What are you after?";

/**
 * The website assistant.
 *
 * Deliberately not opened automatically. A panel that springs open over the
 * page on arrival is the single most disliked pattern on a dealership site,
 * and someone who wants to ask a question will find a button that is always
 * in the same corner.
 *
 * The conversation id lives in sessionStorage rather than localStorage: it
 * should survive clicking through to a vehicle page and back, and it should
 * not still be sitting there next week attached to a conversation nobody
 * remembers having.
 */
export function Assistant({ market }: { market: MarketCode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convId = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    convId.current = sessionStorage.getItem("aaa_assistant") ?? null;
  }, []);

  // Follow the conversation as it grows, including while a reply streams in.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [msgs, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape closes, matching every other dismissible panel on the site.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

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
        throw new Error(body?.error ?? "The assistant is unavailable right now.");
      }

      // Newline-delimited JSON. Chunks split anywhere, so the tail of an
      // incomplete line is carried into the next read rather than parsed.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
            setMsgs((m) => {
              const next = [...m];
              next[next.length - 1] = {
                role: "assistant",
                content: next[next.length - 1].content + chunk,
              };
              return next;
            });
          } else if (event.type === "error") {
            setError(event.error ?? "Something went wrong.");
          }
        }
      }
    } catch (e) {
      // Drop the empty assistant bubble — leaving a blank one behind looks
      // like the assistant simply ignored them.
      setMsgs((m) => (m[m.length - 1]?.content === "" ? m.slice(0, -1) : m));
      setError(e instanceof Error ? e.message : "The assistant is unavailable right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`assistant-launcher${open ? " is-open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="assistant-panel"
        aria-label={open ? "Close the assistant" : "Ask a question"}
      >
        <i className={open ? "fas fa-times" : "fas fa-comment-dots"} aria-hidden="true" />
        {!open && <span>Ask us</span>}
      </button>

      <div
        id="assistant-panel"
        className={`assistant-panel${open ? " is-open" : ""}`}
        role="dialog"
        aria-label="Website assistant"
        aria-modal="false"
      >
        <div className="assistant-head">
          <div>
            <strong>Adedayo Aremu Autos</strong>
            {/* Stated plainly and permanently. Someone should never have to
                work out whether they are talking to a person. */}
            <span>Automated assistant — a person can call you back</span>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <div className="assistant-log" ref={scroller}>
          <div className="assistant-msg assistant-msg--bot">{GREETING}</div>

          {msgs.map((m, i) => (
            <div
              key={i}
              className={`assistant-msg assistant-msg--${m.role === "user" ? "you" : "bot"}`}
            >
              {m.content || <span className="assistant-typing" aria-label="Typing" />}
            </div>
          ))}

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
            placeholder="Ask about a car, a rental, or rent to own…"
            rows={1}
            maxLength={2000}
            aria-label="Your message"
          />
          <button type="submit" disabled={busy || !input.trim()} aria-label="Send">
            <i className="fas fa-paper-plane" aria-hidden="true" />
          </button>
        </form>

        <p className="assistant-foot">
          Prices and stock come from our live listings. We never ask for bank
          details, SSN or BVN here.
        </p>
      </div>
    </>
  );
}
