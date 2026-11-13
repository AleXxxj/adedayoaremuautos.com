import "server-only";
import { escapeHtml } from "@/lib/campaign/render";
import { mailFrom } from "@/lib/mail";

/**
 * The answer to "Ask to keep it".
 *
 * Sent once staff have approved or declined, to the address on the booking.
 * It answers a question the renter asked, so it is not marketing and carries
 * nothing else. The booking page shows the same answer; this is so they do
 * not have to keep checking it.
 */
const GREEN = "#2a5c42";
const MUTED = "#6b736e";
const RULE = "#e6e6e6";

export interface ExtensionDecisionMail {
  to: string;
  name: string;
  vehicle: string;
  approved: boolean;
  /**
   * The return date as it now stands, formatted for the market. For an
   * approval it is the new date; for a decline, the unchanged one.
   */
  returnDay: string;
  /** Approved only: formatted money, or null when the days cost nothing more. */
  added: string | null;
  /** Approved only: the booking's total now. */
  newTotal: string | null;
  /** The renter's private booking page, when the booking has one. */
  url: string | null;
  businessPhone: string | null;
}

export function extensionDecisionSubject(d: ExtensionDecisionMail): string {
  return d.approved
    ? `Approved: your ${d.vehicle} is yours until ${d.returnDay}`
    : `About keeping your ${d.vehicle} longer`;
}

export function renderExtensionDecision(d: ExtensionDecisionMail): { html: string; text: string } {
  const first = d.name.trim().split(/\s+/)[0] || "there";
  const call = d.businessPhone ? `Call us at ${d.businessPhone}` : "Call us";

  const row = (label: string, value: string) => `<tr>
    <td style="padding:7px 0;font-size:13px;color:${MUTED};width:38%;vertical-align:top">${escapeHtml(label)}</td>
    <td style="padding:7px 0;font-size:15px;color:#111;vertical-align:top"><strong>${escapeHtml(value)}</strong></td>
  </tr>`;

  const lead = d.approved
    ? `Good news. You can keep your ${d.vehicle} longer.`
    : `We are sorry. We could not extend your ${d.vehicle} this time.`;
  const pay = d.added
    ? "You pay the added cost with us, not online."
    : "There is no added cost.";
  const declinedNext = `Your return date has not changed. ${call} and we will look at other options with you.`;

  const body = d.approved
    ? `<div style="border:1px solid ${RULE};border-radius:10px;padding:16px 18px;margin-bottom:18px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        ${row("New return date", d.returnDay)}
        ${d.added ? row("Added cost", d.added) : ""}
        ${d.newTotal ? row("New total", d.newTotal) : ""}
      </table>
    </div>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#333">${escapeHtml(pay)}</p>`
    : `<div style="border:1px solid ${RULE};border-radius:10px;padding:16px 18px;margin-bottom:18px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        ${row("Return date", d.returnDay)}
      </table>
    </div>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#333">${escapeHtml(declinedNext)}</p>`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(extensionDecisionSubject(d))}</title></head>
<body style="margin:0;padding:0;background:#f2f2f2;-webkit-font-smoothing:antialiased">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f2f2f2">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">

  <tr><td style="background:#0a0a0a;padding:22px 28px">
    <span style="font-size:11px;letter-spacing:.16em;color:#8f8f8f">ADEDAYO AREMU AUTOS</span>
    <div style="margin-top:5px;font-size:18px;font-weight:700;color:#f0f0f0">${d.approved ? `Yours until ${escapeHtml(d.returnDay)}` : "We could not extend your rental"}</div>
  </td></tr>

  <tr><td style="padding:28px">
    <p style="margin:0 0 14px;font-size:16px;color:#111">Hello ${escapeHtml(first)},</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#333">${escapeHtml(lead)}</p>
    ${body}
    ${
      d.url
        ? `<p style="margin:0">
      <a href="${escapeHtml(d.url)}" style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 26px;border-radius:8px">View your booking</a>
    </p>`
        : ""
    }
  </td></tr>

  <tr><td style="background:#fafafa;border-top:1px solid ${RULE};padding:18px 28px">
    <div style="font-size:12px;line-height:1.6;color:${MUTED}">
      Sent because you asked to keep your rental longer${d.approved && d.businessPhone ? `. Questions? Call ${escapeHtml(d.businessPhone)}` : ""}.
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  const text = [
    `Hello ${first},`,
    "",
    lead,
    "",
    ...(d.approved
      ? [
          `New return date: ${d.returnDay}`,
          ...(d.added ? [`Added cost: ${d.added}`] : []),
          ...(d.newTotal ? [`New total: ${d.newTotal}`] : []),
          "",
          pay,
        ]
      : [`Return date: ${d.returnDay}`, "", declinedNext]),
    ...(d.url ? ["", `View your booking: ${d.url}`] : []),
    "",
    "Sent because you asked to keep your rental longer.",
    "",
    "Adedayo Aremu Autos",
    ...(d.businessPhone ? [d.businessPhone] : []),
  ].join("\n");

  return { html, text };
}

/** Sends it. Throws on failure; the caller logs and carries on. */
export async function sendExtensionDecision(d: ExtensionDecisionMail): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key || !d.to) throw new Error("mail is not configured");

  const { html, text } = renderExtensionDecision(d);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: mailFrom(),
      to: [d.to],
      subject: extensionDecisionSubject(d),
      html,
      text,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}
