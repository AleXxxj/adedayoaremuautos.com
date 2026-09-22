import "server-only";

import { escapeHtml } from "@/lib/campaign/render";
import { mailFrom } from "@/lib/mail";

/**
 * The receipt a customer gets the moment their rental payment lands.
 *
 * Written to settle the question rather than defer it. Somebody who has just
 * typed their card number into a website they found this week wants to know
 * the money arrived and the car is theirs — telling them instead that
 * "we will be in touch" reads as though it is still up in the air, which is
 * the opposite of what they paid for. So the booking is stated as confirmed,
 * what they booked is shown back to them, and what happens next is specific:
 * bring a licence, the deposit is due at pickup, here is the number to call.
 *
 * Transactional, so no unsubscribe link. Suppressing this would mean
 * suppressing somebody's proof of payment.
 */

const GREEN = "#2a5c42";
const MUTED = "#6b736e";
const RULE = "#e6e6e6";

export interface BookingPaidData {
  customerName: string;
  customerEmail: string;
  reference: string;
  vehicle: string;
  /** Already formatted for the market, e.g. "22 September 2026". */
  startLabel: string;
  endLabel: string;
  days: number;
  /** Formatted money strings. */
  amountPaid: string;
  depositDue: string | null;
  pickupLocation: string | null;
  businessPhone: string | null;
  bookingUrl: string;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:7px 0;font-size:13px;color:${MUTED};width:38%;vertical-align:top">${escapeHtml(label)}</td>
    <td style="padding:7px 0;font-size:15px;color:#111;vertical-align:top">${value}</td>
  </tr>`;
}

export function bookingPaidSubject(d: BookingPaidData): string {
  return `Booking confirmed — ${d.vehicle} (${d.reference})`;
}

export function renderBookingPaid(d: BookingPaidData): { html: string; text: string } {
  const nights = `${d.days} day${d.days === 1 ? "" : "s"}`;

  const rows = [
    row("Reference", `<strong>${escapeHtml(d.reference)}</strong>`),
    row("Vehicle", escapeHtml(d.vehicle)),
    row("Pick-up", escapeHtml(d.startLabel)),
    row("Return", escapeHtml(d.endLabel)),
    row("Duration", escapeHtml(nights)),
    d.pickupLocation ? row("Collect from", escapeHtml(d.pickupLocation)) : "",
  ]
    .filter(Boolean)
    .join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(bookingPaidSubject(d))}</title></head>
<body style="margin:0;padding:0;background:#f2f2f2;-webkit-font-smoothing:antialiased">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f2f2f2">
<tr><td align="center" style="padding:24px 12px">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">

  <tr><td style="background:#0a0a0a;padding:22px 28px">
    <span style="font-size:11px;letter-spacing:.16em;color:#8f8f8f">ADEDAYO AREMU AUTOS</span>
    <div style="margin-top:5px;font-size:18px;font-weight:700;color:#f0f0f0">Your booking is confirmed</div>
  </td></tr>

  <tr><td style="padding:28px 28px 0">
    <p style="margin:0 0 6px;font-size:16px;color:#111">Hello ${escapeHtml(d.customerName.split(/\s+/)[0] || "there")},</p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#333">
      We have received your payment of <strong>${escapeHtml(d.amountPaid)}</strong>
      and the vehicle is reserved for your dates. Nothing further is needed to
      hold it.
    </p>
  </td></tr>

  <tr><td style="padding:20px 28px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="border:1px solid ${RULE};border-radius:10px">
      <tr><td style="padding:6px 18px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:22px 28px 0">
    <div style="font-size:13px;font-weight:700;color:#111;letter-spacing:.02em">WHEN YOU COLLECT</div>
    <ul style="margin:10px 0 0;padding-left:20px;font-size:15px;line-height:1.7;color:#333">
      <li>Bring the driving licence of whoever will be driving.</li>
      ${
        d.depositDue
          ? `<li>A refundable security deposit of <strong>${escapeHtml(d.depositDue)}</strong> is taken at pickup — it was not charged today.</li>`
          : ""
      }
      <li>We will be in touch to agree a collection time.</li>
    </ul>
  </td></tr>

  <tr><td style="padding:22px 28px 28px">
    ${
      d.businessPhone
        ? `<div style="font-size:15px;color:#333">Any questions, call us on
             <a href="tel:${escapeHtml(d.businessPhone.replace(/[^\d+]/g, ""))}" style="color:${GREEN};font-weight:600;text-decoration:none">${escapeHtml(d.businessPhone)}</a>
             and quote <strong>${escapeHtml(d.reference)}</strong>.</div>`
        : ""
    }
  </td></tr>

  <tr><td style="background:#fafafa;border-top:1px solid ${RULE};padding:18px 28px">
    <div style="font-size:12px;line-height:1.6;color:${MUTED}">
      This is your receipt — please keep it. It was sent because you booked a
      vehicle with us, not as marketing.
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  const text = [
    `Hello ${d.customerName.split(/\s+/)[0] || "there"},`,
    "",
    `We have received your payment of ${d.amountPaid} and your booking is confirmed.`,
    "",
    `Reference:   ${d.reference}`,
    `Vehicle:     ${d.vehicle}`,
    `Pick-up:     ${d.startLabel}`,
    `Return:      ${d.endLabel}`,
    `Duration:    ${nights}`,
    d.pickupLocation ? `Collect from: ${d.pickupLocation}` : null,
    "",
    "When you collect:",
    "- Bring the driving licence of whoever will be driving.",
    d.depositDue
      ? `- A refundable security deposit of ${d.depositDue} is taken at pickup. It was not charged today.`
      : null,
    "- We will be in touch to agree a collection time.",
    "",
    d.businessPhone ? `Questions? Call ${d.businessPhone} and quote ${d.reference}.` : null,
    "",
    "Adedayo Aremu Autos",
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { html, text };
}

/**
 * Sends it, and never lets a failure matter.
 *
 * Called from the payment webhook, where throwing would make Stripe retry the
 * whole delivery — and a retry would find the booking already confirmed and do
 * nothing, so the customer would lose the receipt permanently over a momentary
 * mail outage. The payment is recorded either way; this is a courtesy on top.
 */
export async function sendBookingPaidEmail(d: BookingPaidData): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key || !d.customerEmail) return;

  const { html, text } = renderBookingPaid(d);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: mailFrom(),
        to: [d.customerEmail],
        subject: bookingPaidSubject(d),
        html,
        text,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error("[payments] receipt failed", res.status, await res.text());
  } catch (e) {
    console.error("[payments] receipt threw", e);
  }
}
