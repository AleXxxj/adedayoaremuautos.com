"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { sendAlertConfirm } from "@/lib/alerts/deliver";
import { mailConfigured, priceAlertsEnabled, pushEndpointAllowed } from "@/lib/alerts/rules";
import {
  confirmEmail,
  pushStatus,
  stopByPush,
  stopByToken,
  watchByEmail,
  watchByPush,
  type WatchRefusal,
} from "@/lib/alerts/store";

/**
 * Price-drop alerts, as the public calls them.
 *
 * Open to anybody, like saving a car: no account. So nothing sent here is
 * trusted. The car comes as a market and a slug and is looked up; the price
 * recorded is the database's, never the browser's; a push endpoint must be a
 * real push service's; an address gets one confirmation link and no alerts
 * until its button is pressed.
 *
 * With PRICE_ALERTS_ENABLED off, every action here refuses before it touches
 * the database.
 */

export interface AlertResult {
  ok: boolean;
  error?: string;
}

const OFF: AlertResult = { ok: false, error: "Price alerts are off right now." };

const REFUSAL: Record<WatchRefusal, string> = {
  "not-watchable": "This car can't be watched right now.",
  limit: "That is the most cars you can watch. Stop one first.",
  busy: "We can't send that email right now. Try again in an hour.",
  unavailable: "We could not save that. Please try again.",
};

const car = {
  market: z.enum(["us", "ng"]),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
};

const pushSchema = z.object({
  ...car,
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(500),
});

/** This browser, which has notifications on, watches this car. */
export async function watchPriceByPush(input: {
  market: string;
  slug: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<AlertResult> {
  if (!priceAlertsEnabled()) return OFF;
  const parsed = pushSchema.safeParse(input);
  if (!parsed.success || !pushEndpointAllowed(parsed.data.endpoint)) {
    return { ok: false, error: REFUSAL.unavailable };
  }
  const result = await watchByPush(parsed.data);
  return result.ok ? { ok: true } : { ok: false, error: REFUSAL[result.reason] };
}

const emailSchema = z.object({
  ...car,
  email: z.string().trim().toLowerCase().email().max(254),
  browserToken: z.string().max(64).optional(),
  // Any value means a bot, answered as if it worked.
  leave_empty: z.string().optional(),
});

/**
 * An address asks to watch this car. The answer is the same whether or not
 * the address was already on file.
 */
export async function watchPriceByEmail(
  _prev: AlertResult | null,
  formData: FormData,
): Promise<AlertResult> {
  if (!priceAlertsEnabled() || !mailConfigured()) return OFF;
  const parsed = emailSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "That email does not look right." };
  }
  const v = parsed.data;
  if (v.leave_empty) return { ok: true };

  const result = await watchByEmail(v);
  if (!result.ok) return { ok: false, error: REFUSAL[result.reason] };

  if (result.confirm) {
    const sent = await sendAlertConfirm(result.confirm);
    if (!sent) {
      // An alert nobody can confirm is only an address on file for nothing.
      await stopByToken(result.confirm.stopToken);
      console.error("[alerts] confirmation email could not be sent");
      return { ok: false, error: "We could not send the email. Please try again." };
    }
  }
  return { ok: true };
}

/** Whether this browser watches this car. Null when it cannot be known. */
export async function priceAlertStatus(input: {
  market: string;
  slug: string;
  endpoint: string;
}): Promise<{ watching: boolean | null }> {
  if (!priceAlertsEnabled()) return { watching: null };
  const parsed = z.object({ ...car, endpoint: z.string().url().max(1000) }).safeParse(input);
  if (!parsed.success) return { watching: null };
  return { watching: await pushStatus(parsed.data) };
}

/**
 * "Stop price alerts" on the car page: by this browser's push endpoint, or by
 * the token this browser made when it asked by email. The row is deleted.
 */
export async function stopPriceAlert(input: {
  market: string;
  slug: string;
  endpoint?: string;
  token?: string;
}): Promise<AlertResult> {
  // Stopping works with the switch off too: turning the feature off must
  // never be what keeps somebody on a list.
  const parsed = z
    .object({
      ...car,
      endpoint: z.string().url().max(1000).optional(),
      token: z.string().max(64).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: REFUSAL.unavailable };
  const v = parsed.data;

  if (v.endpoint) {
    const done = await stopByPush({ market: v.market, slug: v.slug, endpoint: v.endpoint });
    if (!done) return { ok: false, error: REFUSAL.unavailable };
  }
  if (v.token) await stopByToken(v.token);
  return { ok: true };
}

/* ── The buttons on /alerts, reached from an email ─────────────────────── */

const token = (formData: FormData) => String(formData.get("token") ?? "");

/** "Yes, tell me": a button and not the link itself, so a mail scanner that
    opens every link cannot confirm an address for its owner. */
export async function confirmPriceAlertAction(formData: FormData): Promise<void> {
  const found = priceAlertsEnabled() ? await confirmEmail(token(formData)) : null;
  redirect(found ? `/alerts?done=on&m=${found.marketCode}&car=${found.slug}` : "/alerts?done=invalid");
}

/** "Stop price alerts", from an email. */
export async function stopPriceAlertAction(formData: FormData): Promise<void> {
  const found = await stopByToken(token(formData));
  redirect(found ? `/alerts?done=off&m=${found.marketCode}&car=${found.slug}` : "/alerts?done=gone");
}
