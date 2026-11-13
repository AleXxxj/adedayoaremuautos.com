import "server-only";
import { escapeHtml } from "@/lib/campaign/render";
import { mailFrom } from "@/lib/mail";

/**
 * "Your rental ends in 2 days. Need it longer?"
 *
 * One short email, to a renter who has the car and gave an address when they
 * booked it. It is about their own rental, it is sent once per return date,
 * and it says so. The link is their private booking page, where the request
 * is one tap.
 */
const GREEN = "#2a5c42";
const MUTED = "#6b736e";
const RULE = "#e6e6e6";

export interface ExtensionReminderMail {
  to: string;
  name: string;
  vehicle: string;
  /** Formatted for the market, e.g. "Friday, November 20". */
  returnDay: string;
  /** The renter's private booking page. */
  url: string;
  businessPhone: string | null;
}

export function extensionReminderSubject(d: ExtensionReminderMail): string {
  return `Your ${d.vehicle} is due back ${d.returnDay}`;
}

export function renderExtensionReminder(d: ExtensionReminderMail): { html: string; text: string } {
  const first = d.name.trim().split(/\s+/)[0] || "there";
  const call = d.businessPhone ? ` Or call ${d.businessPhone}.` : "";

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(extensionReminderSubject(d))}</title></head>
<body style="margin:0;padding:0;background:#f2f2f2;-webkit-font-smoothing:antialiased">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f2f2f2">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">

  <tr><td style="background:#0a0a0a;padding:22px 28px">
    <span style="font-size:11px;letter-spacing:.16em;color:#8f8f8f">ADEDAYO AREMU AUTOS</span>
    <div style="margin-top:5px;font-size:18px;font-weight:700;color:#f0f0f0">Due back ${escapeHtml(d.returnDay)}</div>
  </td></tr>

  <tr><td style="padding:28px">
    <p style="margin:0 0 14px;font-size:16px;color:#111">Hello ${escapeHtml(first)},</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#333">
      Your ${escapeHtml(d.vehicle)} is due back ${escapeHtml(d.returnDay)}.
      Need it longer? Ask for another week from your booking page. It takes one tap.
    </p>
    <p style="margin:0 0 14px">
      <a href="${escapeHtml(d.url)}" style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 26px;border-radius:8px">Keep it another week</a>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED}">
      You see the added cost before you ask. Nothing is charged online, and we confirm before anything changes.${escapeHtml(call)}
    </p>
  </td></tr>

  <tr><td style="background:#fafafa;border-top:1px solid ${RULE};padding:18px 28px">
    <div style="font-size:12px;line-height:1.6;color:${MUTED}">
      Sent because you are renting a vehicle from us. We send this once before each return date, not as marketing.
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  const text = [
    `Hello ${first},`,
    "",
    `Your ${d.vehicle} is due back ${d.returnDay}.`,
    "Need it longer? Ask for another week from your booking page. It takes one tap:",
    d.url,
    "",
    `You see the added cost before you ask. Nothing is charged online, and we confirm before anything changes.${call}`,
    "",
    "Sent because you are renting a vehicle from us. We send this once before each return date, not as marketing.",
    "",
    "Adedayo Aremu Autos",
  ].join("\n");

  return { html, text };
}

/** Sends it. Throws on failure so the caller can count what went out. */
export async function sendExtensionReminder(d: ExtensionReminderMail): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key || !d.to) throw new Error("mail is not configured");

  const { html, text } = renderExtensionReminder(d);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: mailFrom(),
      to: [d.to],
      subject: extensionReminderSubject(d),
      html,
      text,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}
