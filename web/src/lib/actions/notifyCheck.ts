"use server";

import { requireStaff } from "@/lib/auth";
import { notifyStaffOfLead, type NotifyOutcome } from "@/lib/notify";
import { siteUrl } from "@/lib/feeds/inventory";

export interface NotifyCheckResult {
  ok: boolean;
  error?: string;
  outcome?: NotifyOutcome;
  /** Which variables are present. Never their values. */
  configured?: { email: boolean; sms: boolean; from: string };
}

/**
 * Sends a test alert and reports exactly what happened.
 *
 * Lead notification is deliberately silent when it fails — a customer must
 * never see an error because an email did not go out, and the lead is safe in
 * the database either way. The cost of that design is that a misconfiguration
 * is invisible: the owner sets three variables, gets no email, and has no way
 * to tell whether the problem is the key, the address, or an unverified
 * sending domain.
 *
 * This makes it visible on demand. It reports whether each variable is set and
 * carries the provider's own error text back, because "domain is not verified"
 * and "invalid API key" need completely different fixes and both look
 * identical from an empty inbox.
 *
 * The values themselves are never returned — only whether they exist.
 */
export async function sendTestNotification(): Promise<NotifyCheckResult> {
  const user = await requireStaff();
  if (user.role === "sales") {
    return { ok: false, error: "Only an owner or manager can send a test." };
  }

  const configured = {
    email: Boolean(process.env.RESEND_API_KEY && process.env.LEAD_ALERT_EMAIL),
    sms: Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.LEAD_ALERT_SMS_TO,
    ),
    from: process.env.LEAD_ALERT_FROM ?? "leads@adedayoaremuautos.com",
  };

  const outcome = await notifyStaffOfLead({
    leadId: "test",
    type: "test alert",
    market: user.marketScope ?? "us",
    name: `Test from ${user.fullName ?? user.email}`,
    phone: "+1 336 207 6521",
    email: user.email,
    message:
      "This is a test of lead notifications. If you are reading it, alerts are working — real enquiries will arrive the same way.",
    vehicle: null,
    adminUrl: `${siteUrl()}/admin/leads`,
  });

  return { ok: true, outcome, configured };
}
