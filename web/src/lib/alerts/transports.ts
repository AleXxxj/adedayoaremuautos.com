import "server-only";
import webpush from "web-push";
import { mailFrom } from "@/lib/mail";
import type { AlertMail } from "@/lib/mail/priceAlert";
import type { PushKeys } from "./store";

/**
 * How a price alert leaves the building: one browser notification, or one
 * email. An interface, so the test suite and local development can capture
 * messages in place of sending them (scripts/verify-price-alerts.mts).
 *
 * The real ones use what the rest of the site uses: the VAPID keys the
 * broadcast notifications use (src/lib/push/send.ts) and Resend with the
 * site's From header (src/lib/mail.ts).
 */
export interface AlertTransports {
  push(
    to: PushKeys,
    payload: { title: string; body: string; url: string; tag?: string },
  ): Promise<"sent" | "gone" | "failed">;
  mail(to: string, mail: AlertMail): Promise<boolean>;
}

let vapidReady = false;

function vapid(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return false;
  if (!vapidReady) {
    const contact = process.env.PUSH_CONTACT_EMAIL?.trim() || "info@adedayoaremuautos.com";
    webpush.setVapidDetails(`mailto:${contact}`, publicKey, privateKey);
    vapidReady = true;
  }
  return true;
}

export const liveTransports: AlertTransports = {
  async push(to, payload) {
    if (!vapid()) return "failed";
    try {
      await webpush.sendNotification(
        { endpoint: to.endpoint, keys: { p256dh: to.p256dh, auth: to.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 24 },
      );
      return "sent";
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode;
      return status === 404 || status === 410 ? "gone" : "failed";
    }
  },

  async mail(to, mail) {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key) return false;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: mailFrom(),
          to: [to],
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          headers: { "List-Unsubscribe": `<${mail.stopUrl}>` },
        }),
        signal: AbortSignal.timeout(8000),
      });
      // The status only. Resend's error body can repeat the recipient.
      if (!res.ok) console.error("[alerts] mail refused, status", res.status);
      return res.ok;
    } catch (e) {
      console.error("[alerts] mail threw:", e instanceof Error ? e.name : "unknown");
      return false;
    }
  },
};
