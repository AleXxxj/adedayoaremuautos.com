"use client";

/**
 * The browser half of notifications, shared by the two places that offer them.
 *
 * The control beside the newsletter and the prompt that appears after a
 * visitor has looked around do the same work, and must agree exactly about
 * what state a browser is in — one of them reporting "off" while the other
 * thinks "on" would be worse than either being wrong alone.
 */

export type PushState =
  | "checking"
  | "unsupported"
  | "needs-install"   // iOS Safari, not yet added to the Home Screen
  | "off"
  | "on"
  | "blocked"
  | "working";

/**
 * Cleans a VAPID key that has been through a hosting provider's settings form.
 *
 * A key copied into a dashboard picks things up: a trailing newline from the
 * shell, quotes from a .env line, the `NAME=` prefix when the whole line was
 * selected rather than the value. Any of those reaches atob() and it throws
 * "The string contains invalid characters", which tells the reader nothing
 * about which of the three happened.
 */
export function cleanKey(raw: string): string {
  return raw
    .trim()
    .replace(/^[A-Z0-9_]+=/, "")
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, "");
}

function urlBase64ToUint8Array(input: string): Uint8Array<ArrayBuffer> {
  const base64 = cleanKey(input);

  // Said plainly and before decoding, because atob's own message names no
  // cause and this is the one failure an owner has to fix in a dashboard.
  if (!/^[A-Za-z0-9_-]+$/.test(base64)) {
    throw new Error(
      "The notification key on the server is not valid — it has stray characters in it.",
    );
  }
  // An uncompressed P-256 public key is 65 bytes, which is 87 base64 chars.
  if (base64.length < 80) {
    throw new Error(
      "The notification key on the server looks cut short. It should be 87 characters.",
    );
  }

  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normal);
  // Backed by an explicit ArrayBuffer: applicationServerKey is typed as
  // BufferSource, which a Uint8Array over a SharedArrayBuffer does not satisfy.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // iPadOS reports itself as a Mac; the touch points give it away.
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  // Safari's own, non-standard flag for a Home Screen app.
  (window.navigator as unknown as { standalone?: boolean }).standalone === true;

export const vapidKey = () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** What this browser can currently do, without asking it for anything. */
export async function detectPushState(): Promise<PushState> {
  // Nothing can work without the server's public key, so show nothing at all
  // rather than a control that fails. This is what makes it safe to deploy
  // the feature before the keys are set in the host.
  if (!vapidKey()) return "unsupported";

  const supported =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  // An iPhone in a Safari tab is not "unsupported" — it is one Home Screen
  // away from working, and that is worth saying.
  if (!supported) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "blocked";

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? "on" : "off";
  } catch {
    return "off";
  }
}

/**
 * Asks the browser for permission and registers the result with the server.
 *
 * Throws with a message meant for the reader rather than the developer, since
 * every one of these ends up on screen.
 */
export async function subscribeBrowser(market: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked for this site in your browser settings."
        : "No problem — you can turn these on any time.",
    );
  }

  const reg = await navigator.serviceWorker.register("/sw.js");
  // register() resolves before the worker is usable; this waits for it.
  await navigator.serviceWorker.ready;

  const key = vapidKey();
  if (!key) throw new Error("Notifications are not configured yet.");

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      // Required by Chrome: every push must show something. We never send a
      // silent one anyway.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    }));

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON(), market }),
  });
  if (!res.ok) throw new Error("We could not save that. Please try again.");
}

/** Removes the subscription here and on the server. */
export async function unsubscribeBrowser(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;

  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
}
