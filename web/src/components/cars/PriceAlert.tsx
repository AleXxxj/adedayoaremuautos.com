"use client";

import { useActionState, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import {
  priceAlertStatus,
  stopPriceAlert,
  watchPriceByEmail,
  watchPriceByPush,
  type AlertResult,
} from "@/lib/actions/priceAlerts";
import { cleanKey, detectPushState, vapidKey, type PushState } from "@/lib/push/client";
import { useHydrated } from "@/lib/useHydrated";
import "@/styles/price-alert.css";

/**
 * "Tell me if the price drops", on a sale car's page and on a saved car's card.
 *
 * One tap where this browser already has notifications on. Otherwise a small
 * sheet with two ways to hear: a notification on this device, or an email
 * (the address only, and nothing is sent to it until the link we email is
 * confirmed). Once on, the same spot says so and offers "Stop price alerts".
 *
 * Which cars this browser watches is remembered here, in localStorage, the
 * way saved cars are (savedStore.ts). The server holds the real list; this
 * is only so the button knows what to say without asking.
 *
 * Rendered only when the server says alerts are switched on
 * (PRICE_ALERTS_ENABLED) and the car can be watched.
 */

/* ── What this browser watches ─────────────────────────────────────────── */

interface Watch {
  via: "push" | "email";
  /** Email only: the token this browser made, which stops the alert. */
  token?: string;
  /** When it was asked, for "check your email" to fade after an hour. */
  at: number;
}

type Watches = Record<string, Watch>;

const CHANGED = "aaa:price-alerts-changed";
const keyFor = (market: string) => `aaa:price-alerts:${market}`;
const NONE: Watches = {};
const memory = new Map<string, string>();
const parsed = new Map<string, { raw: string | null; value: Watches }>();

function getRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function read(market: string): Watches {
  const key = keyFor(market);
  const raw = getRaw(key);
  const hit = parsed.get(key);
  if (hit && hit.raw === raw) return hit.value;
  let value: Watches = NONE;
  try {
    const data: unknown = raw ? JSON.parse(raw) : null;
    if (data && typeof data === "object" && !Array.isArray(data)) value = data as Watches;
  } catch {
    /* Unreadable: start again from nothing. */
  }
  parsed.set(key, { raw, value });
  return value;
}

function write(market: string, slug: string, watch: Watch | null): void {
  const key = keyFor(market);
  const next = { ...read(market) };
  if (watch) next[slug] = watch;
  else delete next[slug];
  const raw = JSON.stringify(next);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    memory.set(key, raw);
  }
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

const serverWatches = () => NONE;

/* ── This browser's push subscription ──────────────────────────────────── */

interface Keys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function keysOf(sub: PushSubscription): Keys | null {
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  return json.endpoint && p256dh && auth ? { endpoint: json.endpoint, p256dh, auth } : null;
}

async function currentKeys(): Promise<Keys | null> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? keysOf(sub) : null;
  } catch {
    return null;
  }
}

function decodeKey(input: string): Uint8Array<ArrayBuffer> {
  const base64 = cleanKey(input);
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Asks for permission and subscribes this browser, for price alerts only.
 *
 * Not `subscribeBrowser` from lib/push/client: that one also adds the browser
 * to the list for every broadcast ("Just arrived"), and somebody asking about
 * one car's price has not asked for those. The subscription made here goes
 * to the server only with the car it is for.
 */
async function subscribeForAlerts(): Promise<Keys> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked for this site in your browser settings."
        : "No problem. You can turn this on any time.",
    );
  }
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeKey(vapidKey()),
    }));
  const keys = keysOf(sub);
  if (!keys) throw new Error("We could not turn that on. Please try again.");
  return keys;
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/* ── The control ───────────────────────────────────────────────────────── */

export function PriceAlert({
  market,
  slug,
  name,
  email,
  variant = "page",
}: {
  market: string;
  slug: string;
  /** The car's whole name, for the sheet and for screen readers. */
  name: string;
  /** Whether alerts by email can be offered (a mail key is set). */
  email: boolean;
  /** "page" under a car's price; "card" under a saved car's card. */
  variant?: "page" | "card";
}) {
  const hydrated = useHydrated();
  const watches = useSyncExternalStore(
    subscribe,
    () => read(market),
    serverWatches,
  );
  const watch = watches[slug] ?? null;

  const [push, setPush] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // Read once, so "check your email" does not flip in the middle of a render.
  const [now] = useState(() => Date.now());
  const sheet = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    let cancelled = false;
    void detectPushState().then((s) => {
      if (!cancelled) setPush(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // On a car's page, agree with the server about this browser: an alert
  // stopped elsewhere is forgotten here, and one this browser has but forgot
  // (storage cleared) is remembered. Only for notifications: the server
  // never says whether an email address is on a list.
  const via = watch?.via ?? null;
  useEffect(() => {
    if (variant !== "page" || push !== "on" || via === "email") return;
    let cancelled = false;
    void (async () => {
      const keys = await currentKeys();
      if (!keys || cancelled) return;
      const { watching } = await priceAlertStatus({ market, slug, endpoint: keys.endpoint }).catch(
        () => ({ watching: null }),
      );
      if (cancelled || watching == null) return;
      if (watching && !via) write(market, slug, { via: "push", at: Date.now() });
      if (!watching && via === "push") write(market, slug, null);
    })();
    return () => {
      cancelled = true;
    };
  }, [variant, push, via, market, slug]);

  const canPush = push === "on" || push === "off";
  // Nothing to offer: no notifications in this browser and no email.
  if (!watch && hydrated && push !== "checking" && !canPush && push !== "needs-install" && !email) {
    return null;
  }

  const watchWith = async (keys: Keys) => {
    const result = await watchPriceByPush({ market, slug, ...keys });
    if (!result.ok) throw new Error(result.error ?? "We could not save that. Please try again.");
    write(market, slug, { via: "push", at: Date.now() });
    setNote("Done. We notify this device if the price drops.");
  };

  /** The button: one tap where notifications are already on, else the sheet. */
  const ask = async () => {
    setError(null);
    setNote(null);
    if (push === "on") {
      const keys = await currentKeys();
      if (keys) {
        setBusy(true);
        try {
          await watchWith(keys);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Something went wrong.");
        } finally {
          setBusy(false);
        }
        return;
      }
    }
    const dialog = sheet.current;
    if (dialog && typeof dialog.showModal === "function" && !dialog.open) {
      dialog.showModal();
      setOpen(true);
    }
  };

  /** "Notify this device", in the sheet. */
  const enablePush = async () => {
    setError(null);
    setBusy(true);
    try {
      await watchWith(await subscribeForAlerts());
      setPush("on");
      sheet.current?.close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!watch) return;
    setError(null);
    setBusy(true);
    try {
      const keys = watch.via === "push" ? await currentKeys() : null;
      const result = await stopPriceAlert({
        market,
        slug,
        endpoint: keys?.endpoint,
        token: watch.token,
      });
      if (!result.ok) throw new Error(result.error);
      write(market, slug, null);
      setNote(
        watch.via === "email"
          ? "Stopped. Every alert email has a stop link too."
          : "Stopped. No more alerts for this car.",
      );
    } catch {
      setError("We could not stop it just now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const fresh = watch ? now - watch.at < 60 * 60_000 : false;

  return (
    <div className={`pa pa--${variant}`} id={variant === "page" ? "price-alert" : undefined}>
      {watch ? (
        <div className="pa-on">
          <p className="pa-on-text">
            <i className="fas fa-bell" aria-hidden="true" />
            <span>
              {watch.via === "push"
                ? "We tell you if the price drops"
                : fresh
                  ? "Check your email. Tap the link to turn it on."
                  : "We email you if the price drops"}
            </span>
          </p>
          <button
            type="button"
            className="pa-stop"
            onClick={stop}
            disabled={busy}
            aria-label={`Stop price alerts for ${name}`}
          >
            Stop price alerts
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="pa-ask"
          ref={opener}
          onClick={ask}
          disabled={!hydrated || busy}
          aria-haspopup={push === "on" ? undefined : "dialog"}
          aria-label={variant === "card" ? `Tell me if the price of the ${name} drops` : undefined}
        >
          <i className="far fa-bell" aria-hidden="true" />
          {busy ? "Just a moment…" : "Tell me if the price drops"}
        </button>
      )}

      <p className="pa-note" role="status">
        {note}
      </p>
      {error && !open && (
        <p className="pa-error" role="alert">
          {error}
        </p>
      )}

      <dialog
        ref={sheet}
        className="cd-sheet pa-sheet"
        aria-labelledby={titleId}
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          const box = e.currentTarget.getBoundingClientRect();
          const inside =
            e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
          if (!inside) e.currentTarget.close();
        }}
        onClose={() => {
          setOpen(false);
          setError(null);
          opener.current?.focus({ preventScroll: true });
        }}
      >
        <div className="cd-sheet-head">
          <div>
            <p className="cd-sheet-car">{name}</p>
            <h2 className="cd-sheet-title" id={titleId}>
              Tell me if the price drops
            </h2>
          </div>
          <button
            type="button"
            className="cd-sheet-close"
            aria-label="Close"
            onClick={() => sheet.current?.close()}
          >
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <p className="pa-sheet-lead">One message per drop. Stop any time.</p>

        <div className="pa-ways">
          {canPush && (
            <button type="button" className="cd-btn cd-btn--primary" onClick={enablePush} disabled={busy}>
              <i className="fas fa-bell" aria-hidden="true" />
              {busy ? "Just a moment…" : "Notify this device"}
            </button>
          )}
          {push === "needs-install" && (
            <p className="pa-hint">
              <i className="fas fa-mobile-screen" aria-hidden="true" />
              <span>
                For notifications on an iPhone: tap <strong>Share</strong>, then{" "}
                <strong>Add to Home Screen</strong>, and open the site from there.
              </span>
            </p>
          )}
          {push === "blocked" && (
            <p className="pa-hint">
              <i className="fas fa-bell-slash" aria-hidden="true" />
              <span>Notifications are blocked for this site in your browser settings.</span>
            </p>
          )}

          {email && (
            <EmailWay
              market={market}
              slug={slug}
              primary={!canPush}
              onDone={(token) => {
                write(market, slug, { via: "email", token: token || undefined, at: Date.now() });
                setNote("Check your email. Tap the link to turn it on.");
                sheet.current?.close();
              }}
            />
          )}
        </div>

        {error && (
          <p className="pa-error" role="alert">
            {error}
          </p>
        )}
      </dialog>
    </div>
  );
}

/**
 * The email way: one box, one button. The address is all that is asked for.
 * Held in state, because React clears a form's own fields after its action
 * runs, which would wipe the address the moment the server asked for a fix.
 */
function EmailWay({
  market,
  slug,
  primary,
  onDone,
}: {
  market: string;
  slug: string;
  /** The filled button, where email is the only way on offer. */
  primary: boolean;
  onDone: (token: string) => void;
}) {
  const [state, action, pending] = useActionState<AlertResult | null, FormData>(watchPriceByEmail, null);
  const [address, setAddress] = useState("");
  // Made at the first send, in the browser: the server has no part in it.
  const token = useRef<string | null>(null);
  const boxId = useId();
  const told = useRef<AlertResult | null>(null);

  useEffect(() => {
    if (state?.ok && told.current !== state) {
      told.current = state;
      onDone(token.current ?? "");
    }
  }, [state, onDone]);

  const submit = (formData: FormData) => {
    token.current ??= randomToken();
    formData.set("browserToken", token.current);
    return action(formData);
  };

  return (
    <form action={submit} className="pa-email">
      <input type="hidden" name="market" value={market} />
      <input type="hidden" name="slug" value={slug} />
      {/* Left empty by people; filled by bots. */}
      <input type="text" name="leave_empty" tabIndex={-1} autoComplete="off" aria-hidden="true" className="pa-trap" />
      <div className="cd-field">
        <label htmlFor={boxId}>{primary ? "Your email" : "Or by email"}</label>
        <input
          id={boxId}
          type="email"
          name="email"
          required
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          aria-invalid={state && !state.ok ? true : undefined}
        />
      </div>
      {state && !state.ok && (
        <p className="cd-error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className={`cd-btn${primary ? " cd-btn--primary" : ""}`} disabled={pending}>
        <i className="fas fa-envelope" aria-hidden="true" />
        {pending ? "Just a moment…" : "Email me"}
      </button>
      <p className="pa-fine">We send one link to confirm. Used for this car&rsquo;s price only.</p>
    </form>
  );
}
