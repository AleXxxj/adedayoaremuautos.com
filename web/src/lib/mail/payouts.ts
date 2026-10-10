import "server-only";
import { escapeHtml } from "@/lib/campaign/render";
import { mailFrom } from "@/lib/mail";
import { siteUrl } from "@/lib/siteUrl";

/**
 * The two emails a payout needs.
 *
 * One to the owner, because a request sitting unseen in a dashboard nobody has
 * open is a partner wondering whether the button did anything. One to the
 * partner when the money has gone, carrying the reference — "we paid you" with
 * nothing to check it against is how a payment gets chased twice.
 */

const GREEN = "#2a5c42";
const MUTED = "#6b736e";
const RULE = "#e6e6e6";

function shell(heading: string, bodyHtml: string, footer: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f2f2f2;-webkit-font-smoothing:antialiased">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f2f2f2">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <tr><td style="background:#0a0a0a;padding:22px 28px">
    <span style="font-size:11px;letter-spacing:.16em;color:#8f8f8f">ADEDAYO AREMU AUTOS</span>
    <div style="margin-top:5px;font-size:18px;font-weight:700;color:#f0f0f0">${escapeHtml(heading)}</div>
  </td></tr>
  <tr><td style="padding:28px">${bodyHtml}</td></tr>
  <tr><td style="background:#fafafa;border-top:1px solid ${RULE};padding:18px 28px">
    <div style="font-size:12px;line-height:1.6;color:${MUTED}">${escapeHtml(footer)}</div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

async function send(to: string, subject: string, html: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key || !to) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: mailFrom(), to: [to], subject, html, text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error("[payout] mail failed", res.status, await res.text());
  } catch (e) {
    console.error("[payout] mail threw", e);
  }
}

/** A partner has asked to be paid. Sent to whoever handles the money. */
export async function notifyStaffOfPayoutRequest(o: {
  name: string;
  code: string;
  amount: string;
  note?: string | null;
}): Promise<void> {
  const to = process.env.LEAD_ALERT_EMAIL?.split(",")[0]?.trim();
  if (!to) return;

  const admin = `${siteUrl()}/admin/payouts`;
  const html = shell(
    "Payout requested",
    `<div style="font-size:30px;font-weight:800;color:#111">${escapeHtml(o.amount)}</div>
     <div style="margin-top:6px;font-size:15px;color:#333">
       ${escapeHtml(o.name)} · <code>${escapeHtml(o.code)}</code>
     </div>
     ${
       o.note
         ? `<div style="margin-top:16px;font-size:13px;color:${MUTED}">Their note</div>
            <div style="margin-top:4px;border-left:3px solid ${RULE};padding:2px 0 2px 14px;font-size:15px;line-height:1.6;color:#333;white-space:pre-line">${escapeHtml(o.note)}</div>`
         : ""
     }
     <p style="margin:24px 0 0">
       <a href="${escapeHtml(admin)}" style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 22px;border-radius:8px">Review the request</a>
     </p>
     <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:${MUTED}">
       This figure is already net of anything they have requested and not yet
       been paid, so it cannot be double-counted.
     </p>`,
    "Sent to you because you handle partner payouts.",
  );
  const text = [
    "Payout requested",
    "",
    `${o.amount} — ${o.name} (${o.code})`,
    ...(o.note ? ["", `Their note: ${o.note}`] : []),
    "",
    `Review: ${admin}`,
  ].join("\n");

  await send(to, `Payout requested — ${o.amount} to ${o.name}`, html, text);
}

/** The money has gone. */
export async function sendPayoutPaid(o: {
  to: string;
  name: string;
  amount: string;
  reference?: string | null;
}): Promise<void> {
  const first = o.name.trim().split(/\s+/)[0] || "there";
  const html = shell(
    "Your payout has been sent",
    `<p style="margin:0 0 14px;font-size:16px;color:#111">Hello ${escapeHtml(first)},</p>
     <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#333">
       We have sent your payout. Thank you for the business you have brought us.
     </p>
     <div style="margin:0 0 18px;border:1px solid ${RULE};border-radius:10px;padding:18px;text-align:center">
       <div style="font-size:12px;letter-spacing:.14em;color:${MUTED}">AMOUNT</div>
       <div style="margin-top:4px;font-size:28px;font-weight:800;color:#111">${escapeHtml(o.amount)}</div>
       ${
         o.reference
           ? `<div style="margin-top:12px;font-size:13px;color:${MUTED}">Reference</div>
              <div style="margin-top:2px;font-size:15px;color:#333">${escapeHtml(o.reference)}</div>`
           : ""
       }
     </div>
     <p style="margin:0;font-size:15px;line-height:1.6;color:#333">
       It is marked as paid on your partner dashboard. If it has not reached
       you within a few working days, reply to this email and we will chase it.
     </p>`,
    "Sent because you are a referral partner of Adedayo Aremu Autos.",
  );
  const text = [
    `Hello ${first},`,
    "",
    "We have sent your payout. Thank you for the business you have brought us.",
    "",
    `Amount: ${o.amount}`,
    ...(o.reference ? [`Reference: ${o.reference}`] : []),
    "",
    "It is marked as paid on your partner dashboard. If it has not reached you within a few working days, reply to this email and we will chase it.",
    "",
    "Adedayo Aremu Autos",
  ].join("\n");

  await send(o.to, `Your payout of ${o.amount} has been sent`, html, text);
}
