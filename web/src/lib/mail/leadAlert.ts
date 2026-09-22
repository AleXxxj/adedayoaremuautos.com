import "server-only";


import { escapeHtml } from "@/lib/campaign/render";

/**
 * The email a member of staff gets when an enquiry arrives.
 *
 * Designed against how it is actually read: on a phone, between other things,
 * by someone deciding whether to ring this person back now or later. So the
 * name and what they want come first, the phone number is a button large
 * enough to hit with a thumb, and everything else is below the fold where it
 * belongs.
 *
 * It is not a marketing email and carries no unsubscribe link — this is
 * transactional mail to the business about its own enquiry, and an
 * unsubscribe on it would be an invitation to switch off the leads.
 */

const GREEN = "#2a5c42";
const MUTED = "#6b736e";
const RULE = "#e6e6e6";

export interface LeadAlertData {
  type: string;
  market: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  vehicle?: string | null;
  adminUrl: string;
}

/** "rent_to_own" -> "Rent to own". The stored value is a database enum. */
function readableType(type: string): string {
  const words = type.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The subject is the whole message for most people, because it is what shows
 * on a lock screen. Name and what they want, in that order, and nothing else
 * competing for the space.
 */
export function leadSubject(d: LeadAlertData): string {
  const kind = readableType(d.type).toLowerCase();
  return d.vehicle
    ? `New ${kind} enquiry — ${d.name} · ${d.vehicle}`
    : `New ${kind} enquiry — ${d.name}`;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:${MUTED};width:30%;vertical-align:top">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-size:15px;color:#111;vertical-align:top">${value}</td>
  </tr>`;
}

export function renderLeadAlert(d: LeadAlertData): { html: string; text: string } {
  const kind = readableType(d.type);

  // Tel links must not carry spaces or punctuation, or a phone will refuse
  // to dial them.
  const dialable = (d.phone ?? "").replace(/[^\d+]/g, "");

  const rows = [
    row("Enquiry", `<strong>${escapeHtml(kind)}</strong>`),
    d.vehicle ? row("Vehicle", escapeHtml(d.vehicle)) : "",
    d.email
      ? row(
          "Email",
          `<a href="mailto:${escapeHtml(d.email)}" style="color:${GREEN};text-decoration:none">${escapeHtml(d.email)}</a>`,
        )
      : "",
    row("Market", escapeHtml(d.market.toUpperCase())),
  ]
    .filter(Boolean)
    .join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(leadSubject(d))}</title></head>
<body style="margin:0;padding:0;background:#f2f2f2;-webkit-font-smoothing:antialiased">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f2f2f2">
<tr><td align="center" style="padding:24px 12px">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">

  <tr><td style="background:#0a0a0a;padding:18px 28px">
    <span style="font-size:11px;letter-spacing:.16em;color:#8f8f8f">ADEDAYO AREMU AUTOS</span>
    <div style="margin-top:4px;font-size:16px;font-weight:700;color:#f0f0f0">New enquiry</div>
  </td></tr>

  <!-- The name, big. This is the one thing worth reading at a glance. -->
  <tr><td style="padding:28px 28px 4px">
    <div style="font-size:24px;font-weight:800;color:#111;line-height:1.25">${escapeHtml(d.name)}</div>
  </td></tr>

  ${
    dialable
      ? `<tr><td style="padding:14px 28px 4px">
    <a href="tel:${escapeHtml(dialable)}" style="display:block;background:${GREEN};color:#ffffff;text-decoration:none;font-size:18px;font-weight:700;padding:16px 20px;border-radius:10px;text-align:center">
      Call ${escapeHtml(d.phone ?? "")}
    </a>
  </td></tr>`
      : ""
  }

  <tr><td style="padding:16px 28px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>
  </td></tr>

  ${
    d.message
      ? `<tr><td style="padding:18px 28px 0">
    <div style="font-size:13px;color:${MUTED};margin-bottom:6px">What they said</div>
    <div style="border-left:3px solid ${RULE};padding:2px 0 2px 14px;font-size:15px;line-height:1.6;color:#333;white-space:pre-line">${escapeHtml(d.message)}</div>
  </td></tr>`
      : ""
  }

  <tr><td style="padding:24px 28px 32px">
    <a href="${escapeHtml(d.adminUrl)}" style="display:inline-block;border:1px solid ${RULE};color:#111;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px">
      Open in the admin
    </a>
  </td></tr>

  <tr><td style="background:#fafafa;border-top:1px solid ${RULE};padding:16px 28px">
    <div style="font-size:12px;line-height:1.6;color:${MUTED}">
      Sent automatically when an enquiry is submitted on the website. Reply to
      this email and it goes to the customer.
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  // Not optional. A message with no text part scores worse with spam filters,
  // and a phone's notification preview is drawn from it.
  const text = [
    `New ${kind.toLowerCase()} enquiry`,
    "",
    d.name,
    d.phone ? `Phone: ${d.phone}` : null,
    d.email ? `Email: ${d.email}` : null,
    d.vehicle ? `Vehicle: ${d.vehicle}` : null,
    `Market: ${d.market.toUpperCase()}`,
    d.message ? `\nWhat they said:\n${d.message}` : null,
    "",
    `Open in the admin: ${d.adminUrl}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { html, text };
}
