import "server-only";

/**
 * Staff notification for new leads.
 *
 * DESIGN RULE: notification failure must never fail a lead submission.
 *
 * The lead is already committed to the database before any of this runs. If
 * Resend is down, if the Twilio balance is empty, if no keys are configured at
 * all — the customer still gets a success message and the lead is still in the
 * admin inbox. The old site lost every lead because delivery was outsourced to
 * a service that was never configured; nothing here is allowed to recreate that
 * single point of failure.
 */

export interface LeadNotification {
  leadId: string;
  type: string;
  market: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  vehicle?: string | null;
  adminUrl: string;
}

type Channel = "email" | "sms";

export interface NotifyOutcome {
  attempted: Channel[];
  delivered: Channel[];
  skipped: { channel: Channel; reason: string }[];
  failed: { channel: Channel; error: string }[];
}

export async function notifyStaffOfLead(
  lead: LeadNotification,
): Promise<NotifyOutcome> {
  const outcome: NotifyOutcome = {
    attempted: [],
    delivered: [],
    skipped: [],
    failed: [],
  };

  await Promise.allSettled([
    sendEmail(lead, outcome),
    sendSms(lead, outcome),
  ]);

  // Always leave a server-log trace, so a lead is discoverable even if every
  // channel is unconfigured.
  console.log(
    `[lead] ${lead.type} from ${lead.name} (${lead.market}) — ` +
      `delivered: ${outcome.delivered.join(", ") || "none"} — ${lead.adminUrl}`,
  );

  return outcome;
}

async function sendEmail(lead: LeadNotification, out: NotifyOutcome) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.LEAD_ALERT_EMAIL;
  const from = process.env.LEAD_ALERT_FROM ?? "leads@adedayoaremuautos.com";

  if (!key || !to) {
    out.skipped.push({ channel: "email", reason: "RESEND_API_KEY or LEAD_ALERT_EMAIL not set" });
    return;
  }
  out.attempted.push("email");

  const subject = `New ${lead.type.replace(/_/g, " ")} lead — ${lead.name}`;
  const lines = [
    `Type: ${lead.type}`,
    `Market: ${lead.market.toUpperCase()}`,
    `Name: ${lead.name}`,
    lead.phone ? `Phone: ${lead.phone}` : null,
    lead.email ? `Email: ${lead.email}` : null,
    lead.vehicle ? `Vehicle: ${lead.vehicle}` : null,
    lead.message ? `\nMessage:\n${lead.message}` : null,
    `\nOpen in admin: ${lead.adminUrl}`,
  ].filter(Boolean);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: to.split(",").map((s) => s.trim()),
        subject,
        text: lines.join("\n"),
        reply_to: lead.email ?? undefined,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    out.delivered.push("email");
  } catch (e) {
    out.failed.push({ channel: "email", error: e instanceof Error ? e.message : String(e) });
  }
}

async function sendSms(lead: LeadNotification, out: NotifyOutcome) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const to = process.env.LEAD_ALERT_SMS_TO;

  if (!sid || !token || !from || !to) {
    out.skipped.push({ channel: "sms", reason: "Twilio env vars not set" });
    return;
  }
  out.attempted.push("sms");

  const body =
    `New ${lead.type.replace(/_/g, " ")}: ${lead.name}` +
    (lead.phone ? ` ${lead.phone}` : "") +
    (lead.vehicle ? ` re ${lead.vehicle}` : "");

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ From: from, To: to, Body: body.slice(0, 300) }),
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    out.delivered.push("sms");
  } catch (e) {
    out.failed.push({ channel: "sms", error: e instanceof Error ? e.message : String(e) });
  }
}
