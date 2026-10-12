import "server-only";
import { escapeHtml } from "@/lib/campaign/render";
import { mailFrom } from "@/lib/mail";

/**
 * "We are holding it for you."
 *
 * The one email that has to arrive. A reservation the customer cannot get
 * back to is not a reservation — before this, the only way to pay was the
 * button on the confirmation panel, so closing the tab ended the matter.
 * This carries the link they will open while standing on the forecourt.
 *
 * It states the expiry as a date and time rather than "48 hours", because
 * somebody reading it on Thursday evening should not have to work out when
 * Saturday morning is.
 */
const GREEN = "#2a5c42";
const MUTED = "#6b736e";
const RULE = "#e6e6e6";

export interface ReservationMail {
  to: string;
  name: string;
  vehicle: string;
  dates: string;
  reference: string;
  amount: string;
  depositDue: string | null;
  /** Formatted for the market, e.g. "Saturday 14 October, 3:40pm". */
  heldUntil: string;
  payUrl: string;
  businessPhone: string | null;
}

export function reservationSubject(d: ReservationMail): string {
  return `Holding your ${d.vehicle} — reference ${d.reference}`;
}

export function renderReservation(d: ReservationMail): {
  html: string;
  text: string;
} {
  const row = (label: string, value: string) => `<tr>
    <td style="padding:7px 0;font-size:13px;color:${MUTED};width:38%;vertical-align:top">${escapeHtml(label)}</td>
    <td style="padding:7px 0;font-size:15px;color:#111;vertical-align:top">${value}</td>
  </tr>`;

  const first = d.name.trim().split(/\s+/)[0] || "there";

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(reservationSubject(d))}</title></head>
<body style="margin:0;padding:0;background:#f2f2f2;-webkit-font-smoothing:antialiased">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f2f2f2">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">

  <tr><td style="background:#0a0a0a;padding:22px 28px">
    <span style="font-size:11px;letter-spacing:.16em;color:#8f8f8f">ADEDAYO AREMU AUTOS</span>
    <div style="margin-top:5px;font-size:18px;font-weight:700;color:#f0f0f0">We are holding your vehicle</div>
  </td></tr>

  <tr><td style="padding:28px 28px 0">
    <p style="margin:0 0 14px;font-size:16px;color:#111">Hello ${escapeHtml(first)},</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#333">
      Your ${escapeHtml(d.vehicle)} is reserved. Nobody else can book these
      dates while the hold lasts.
    </p>

    <div style="border:1px solid ${RULE};border-radius:10px;padding:16px 18px;margin-bottom:18px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        ${row("Reference", `<strong>${escapeHtml(d.reference)}</strong>`)}
        ${row("Vehicle", escapeHtml(d.vehicle))}
        ${row("Dates", escapeHtml(d.dates))}
        ${row("To pay", `<strong>${escapeHtml(d.amount)}</strong>`)}
        ${d.depositDue ? row("Deposit at pickup", `${escapeHtml(d.depositDue)} <span style="color:${MUTED};font-size:13px">refundable</span>`) : ""}
      </table>
    </div>

    <div style="border:1px solid rgba(201,162,39,.5);background:rgba(201,162,39,.08);border-radius:10px;padding:14px 16px;margin-bottom:22px">
      <div style="font-size:15px;font-weight:700;color:#8a6d1b">Held until ${escapeHtml(d.heldUntil)}</div>
      <div style="margin-top:4px;font-size:13.5px;line-height:1.55;color:#5f4f18">
        After that the dates go back on the market. Call us if you need longer
        — we can usually extend it.
      </div>
    </div>
  </td></tr>

  <tr><td style="padding:0 28px">
    <div style="font-size:13px;font-weight:700;color:#111;letter-spacing:.02em">TWO WAYS TO DO THIS</div>
    <ul style="margin:10px 0 0;padding-left:20px;font-size:15px;line-height:1.7;color:#333">
      <li><strong>Come and see it first.</strong> Have a look at the vehicle, and pay from the link below on your phone when you are happy.</li>
      <li><strong>Or pay now</strong> and it is confirmed immediately.</li>
    </ul>
    <p style="margin:18px 0 0">
      <a href="${escapeHtml(d.payUrl)}" style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 26px;border-radius:8px">View your reservation and pay</a>
    </p>
    <p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:${MUTED}">
      If the button does not work, copy this into your browser:<br>
      <span style="word-break:break-all;color:#333">${escapeHtml(d.payUrl)}</span>
    </p>
  </td></tr>

  <tr><td style="padding:22px 28px 28px">
    <div style="font-size:13px;font-weight:700;color:#111;letter-spacing:.02em">WHEN YOU COLLECT</div>
    <ul style="margin:10px 0 0;padding-left:20px;font-size:15px;line-height:1.7;color:#333">
      <li>Bring the driving licence of whoever will be driving.</li>
      <li>We check your documents before the vehicle is released, so please make sure the names match your booking.</li>
      ${d.depositDue ? `<li>The refundable deposit of <strong>${escapeHtml(d.depositDue)}</strong> is taken at pickup, not now.</li>` : ""}
    </ul>
  </td></tr>

  <tr><td style="background:#fafafa;border-top:1px solid ${RULE};padding:18px 28px">
    <div style="font-size:12px;line-height:1.6;color:${MUTED}">
      Sent because you reserved a vehicle with us${d.businessPhone ? `. Questions? Call ${escapeHtml(d.businessPhone)}` : ""}.
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  const text = [
    `Hello ${first},`,
    "",
    `Your ${d.vehicle} is reserved. Nobody else can book these dates while the hold lasts.`,
    "",
    `Reference: ${d.reference}`,
    `Dates: ${d.dates}`,
    `To pay: ${d.amount}`,
    ...(d.depositDue ? [`Deposit at pickup: ${d.depositDue} (refundable)`] : []),
    "",
    `HELD UNTIL ${d.heldUntil}`,
    "After that the dates go back on the market. Call us if you need longer — we can usually extend it.",
    "",
    "Two ways to do this:",
    "  - Come and see the vehicle first, and pay from the link below on your phone when you are happy.",
    "  - Or pay now and it is confirmed immediately.",
    "",
    d.payUrl,
    "",
    "When you collect, bring the driving licence of whoever will be driving. We check your documents before the vehicle is released.",
    "",
    "Adedayo Aremu Autos",
  ].join("\n");

  return { html, text };
}

/** Sends it. Never allowed to fail the booking it is reporting. */
export async function sendReservation(d: ReservationMail): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key || !d.to) return;

  const { html, text } = renderReservation(d);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: mailFrom(),
        to: [d.to],
        subject: reservationSubject(d),
        html,
        text,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error("[reservation] mail failed", res.status, await res.text());
  } catch (e) {
    console.error("[reservation] mail threw", e);
  }
}
