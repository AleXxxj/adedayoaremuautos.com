"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Confirmations that appear where the reader is looking.
 *
 * Every form on this site put its result at the top of itself. That is the
 * conventional place and it is wrong for any form longer than a screen: the
 * submit button is at the bottom, so pressing it appeared to do nothing and
 * the answer sat somewhere above the fold. On the vehicle form — twenty-odd
 * fields — somebody could save successfully three times and believe it was
 * broken.
 *
 * The inline message stays where it is. It is the accessible, contextual copy,
 * and an error especially belongs beside the field it is about. This is a
 * second, floating copy of the same news, pinned to the viewport so it cannot
 * be off-screen no matter where the reader has scrolled to.
 */

export type ToastTone = "success" | "error";

export interface Toast {
  id: number;
  tone: ToastTone;
  text: string;
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const snapshot = () => toasts;
/** Nothing is ever shown during server rendering, so the server sees none. */
const EMPTY: Toast[] = [];
const serverSnapshot = () => EMPTY;

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/**
 * Shows a message. Safe to call from anywhere on the client.
 *
 * An identical message already on screen is not repeated — pressing save twice
 * should not stack two copies of "Saved" — but its timer restarts so it stays
 * for the full span from the most recent press.
 */
export function pushToast(tone: ToastTone, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;

  const existing = toasts.find((t) => t.text === trimmed && t.tone === tone);
  if (existing) {
    toasts = toasts.filter((t) => t.id !== existing.id).concat({ ...existing, id: nextId++ });
  } else {
    toasts = [...toasts, { id: nextId++, tone, text: trimmed }];
  }
  // More than a few at once is noise rather than information.
  if (toasts.length > 3) toasts = toasts.slice(-3);
  emit();
}

function ToastItem({ toast }: { toast: Toast }) {
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    // An error is given longer: it usually asks the reader to do something,
    // and a correction that vanishes before it is read is worse than none.
    const ms = toast.tone === "error" ? 9000 : 5000;
    timer.current = window.setTimeout(() => dismissToast(toast.id), ms);
    return () => window.clearTimeout(timer.current);
  }, [toast.id, toast.tone]);

  return (
    <div
      className={`toast toast--${toast.tone}`}
      // A success is a status; an error interrupts. Screen readers treat the
      // two differently and should.
      role={toast.tone === "error" ? "alert" : "status"}
      aria-live={toast.tone === "error" ? "assertive" : "polite"}
    >
      <i
        className={`fas ${toast.tone === "error" ? "fa-circle-exclamation" : "fa-circle-check"}`}
        aria-hidden="true"
      />
      <span>{toast.text}</span>
      <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
        <i className="fas fa-times" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Mounted once per layout. Renders nothing until something is said. */
export function Toaster() {
  const items = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  if (items.length === 0) return null;

  return (
    <div className="toast-stack">
      {items.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

/**
 * Whether a validation message was written for the person reading it.
 *
 * A schema field with no message of its own falls back to the library's
 * default, and those are written for whoever wrote the schema: "Invalid input:
 * expected string, received undefined". That was survivable while such
 * messages sat inline beside a field most people never look at. Surfacing them
 * prominently makes them a customer-facing defect — the same one that once
 * told a salesperson `Invalid option: expected one of "us"|"ng"` beside a
 * field she was not allowed to change.
 *
 * The right fix is a message on every field, and the user-facing ones have
 * one. This is the net underneath: a form should say something useful even
 * when a field nobody fills in fails, and it should never be jargon.
 */
function isForAReader(message: string): boolean {
  return !/^(Invalid input|Invalid option|Invalid enum|Expected )|expected .+received /i.test(
    message.trim(),
  );
}

/**
 * Mirrors a server action's result into a toast.
 *
 * One line per form. It fires only when the result object identity changes,
 * which is exactly once per submission — `useActionState` hands back a new
 * object each time, and the same object re-rendering must not re-announce.
 */
export function useActionToast(
  state:
    | {
        ok?: boolean;
        error?: string;
        message?: string;
        fieldErrors?: Record<string, string[] | undefined>;
      }
    | null
    | undefined,
  successText?: string,
) {
  const seen = useRef<unknown>(null);

  useEffect(() => {
    if (!state || state === seen.current) return;
    seen.current = state;

    if (state.error) {
      pushToast("error", state.error);
      return;
    }

    /*
     * A validation failure returns field errors and no general message, so
     * without this a form that refuses to submit would say nothing at all
     * where the reader is looking — the inline messages sit beside their
     * fields, which may be several screens up.
     *
     * The first real message is used rather than a generic "check the form":
     * one specific sentence tells the reader what to fix, and a count tells
     * them whether there is more.
     */
    const fieldMessages = Object.values(state.fieldErrors ?? {})
      .map((m) => m?.[0])
      .filter((m): m is string => Boolean(m))
      .filter(isForAReader);

    // Everything was jargon, so the reader still gets told the form did not
    // go through — silence after pressing submit is the worst of the options.
    const anyFieldError = Object.values(state.fieldErrors ?? {}).some((m) => m?.[0]);
    if (fieldMessages.length === 0 && anyFieldError) {
      pushToast("error", "Please check the form and try again.");
      return;
    }

    if (fieldMessages.length > 0) {
      const more = fieldMessages.length - 1;
      pushToast(
        "error",
        more > 0
          ? `${fieldMessages[0]} (and ${more} other problem${more === 1 ? "" : "s"})`
          : fieldMessages[0],
      );
      return;
    }

    if (state.ok) pushToast("success", state.message ?? successText ?? "Saved.");
  }, [state, successText]);
}
