import "server-only";
import { escapeHtml } from "@/lib/campaign/render";

/**
 * The two emails price-drop alerts send.
 *
 *  1. "Confirm your price alert": one link, sent once when an address asks
 *     to watch a car. Nothing else is sent until its button is pressed.
 *  2. "Price drop": car, old price, new price, link. One per drop.
 *
 * Both carry a stop link and the business's postal address. Both are short:
 * the reader asked one question, and the answer is a price.
 *
 * This file only writes the words. Sending is src/lib/alerts/transports.ts,
 * so tests can capture a message without one leaving the building.
 */

const GREEN = "#2a5c42";
const MUTED = "#6b736e";
const RULE = "#e6e6e6";

export interface AlertMail {
  subject: string;
  html: string;
  text: string;
  /** The stop link, also offered to the mail client as List-Unsubscribe. */
  stopUrl: string;
}

const mailingAddress = () =>
  process.env.MAILING_ADDRESS ?? "Adedayo Aremu Autos, 507 Gillespie St, Greensboro, NC 27401, USA";

function shell(opts: {
  subject: string;
  heading: string;
  body: string;
  button: { label: string; url: string };
  why: string;
  stopUrl: string;
}): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(opts.subject)}</title></head>
<body style="margin:0;padding:0;background:#f2f2f2;-webkit-font-smoothing:antialiased">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f2f2f2">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">

  <tr><td style="background:#0a0a0a;padding:22px 28px">
    <span style="font-size:11px;letter-spacing:.16em;color:#8f8f8f">ADEDAYO AREMU AUTOS</span>
    <div style="margin-top:5px;font-size:18px;font-weight:700;color:#f0f0f0">${escapeHtml(opts.heading)}</div>
  </td></tr>

  <tr><td style="padding:28px">
    ${opts.body}
    <p style="margin:22px 0 0">
      <a href="${escapeHtml(opts.button.url)}" style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 26px;border-radius:8px">${escapeHtml(opts.button.label)}</a>
    </p>
  </td></tr>

  <tr><td style="background:#fafafa;border-top:1px solid ${RULE};padding:18px 28px">
    <div style="font-size:12px;line-height:1.6;color:${MUTED}">
      ${escapeHtml(opts.why)}
      <a href="${escapeHtml(opts.stopUrl)}" style="color:${MUTED};text-decoration:underline">Stop price alerts for this car</a>.<br>
      ${escapeHtml(mailingAddress())}
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

export interface ConfirmMailInput {
  carName: string;
  price: string;
  confirmUrl: string;
  stopUrl: string;
}

export function renderAlertConfirm(d: ConfirmMailInput): AlertMail {
  const subject = `Confirm your price alert: ${d.carName}`;
  const why = "Sent because this address asked for a price alert on our website. Not you? Ignore this and nothing more is sent.";
  const html = shell({
    subject,
    heading: "One tap to turn on your price alert",
    body: `
    <p style="margin:0 0 6px;font-size:13px;color:${MUTED}">The car</p>
    <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#111">${escapeHtml(d.carName)}</p>
    <p style="margin:0 0 6px;font-size:13px;color:${MUTED}">Price today</p>
    <p style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111">${escapeHtml(d.price)}</p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#333">
      Confirm, and we email you if this price goes down. One email per drop. Nothing else.
    </p>`,
    button: { label: "Yes, tell me if the price drops", url: d.confirmUrl },
    why,
    stopUrl: d.stopUrl,
  });
  const text = [
    `${d.carName}`,
    `Price today: ${d.price}`,
    "",
    "Confirm, and we email you if this price goes down. One email per drop. Nothing else.",
    "",
    `Confirm: ${d.confirmUrl}`,
    "",
    why,
    `Stop price alerts for this car: ${d.stopUrl}`,
    "",
    mailingAddress(),
  ].join("\n");
  return { subject, html, text, stopUrl: d.stopUrl };
}

export interface DropMailInput {
  carName: string;
  oldPrice: string;
  newPrice: string;
  carUrl: string;
  stopUrl: string;
}

export function renderPriceDrop(d: DropMailInput): AlertMail {
  const subject = `Price drop: ${d.carName} is now ${d.newPrice}`;
  const why = "Sent because you asked us to tell you if this car's price dropped.";
  const html = shell({
    subject,
    heading: "The price dropped",
    body: `
    <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#111">${escapeHtml(d.carName)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${RULE};border-radius:10px">
      <tr>
        <td style="padding:14px 18px;font-size:13px;color:${MUTED};width:38%">Now</td>
        <td style="padding:14px 18px;font-size:24px;font-weight:800;color:#111">${escapeHtml(d.newPrice)}</td>
      </tr>
      <tr>
        <td style="padding:12px 18px;font-size:13px;color:${MUTED};border-top:1px solid ${RULE}">Was</td>
        <td style="padding:12px 18px;font-size:16px;color:${MUTED};text-decoration:line-through;border-top:1px solid ${RULE}">${escapeHtml(d.oldPrice)}</td>
      </tr>
    </table>`,
    button: { label: "See the car", url: d.carUrl },
    why,
    stopUrl: d.stopUrl,
  });
  const text = [
    d.carName,
    `Now: ${d.newPrice}`,
    `Was: ${d.oldPrice}`,
    "",
    `See the car: ${d.carUrl}`,
    "",
    why,
    `Stop price alerts for this car: ${d.stopUrl}`,
    "",
    mailingAddress(),
  ].join("\n");
  return { subject, html, text, stopUrl: d.stopUrl };
}
