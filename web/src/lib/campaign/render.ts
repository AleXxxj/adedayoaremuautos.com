/**
 * The email itself.
 *
 * Two rules govern everything here, and both cost design freedom:
 *
 * 1. Tables, inline styles, no flexbox, no grid, no external stylesheet.
 *    Outlook renders through Word's HTML engine and silently drops most of
 *    modern CSS. A layout that looks right in a browser preview and collapses
 *    in Outlook is worse than a plain one that holds everywhere.
 *
 * 2. Dark header, white body. The site is dark and it is tempting to match it
 *    end to end, but long text on a dark background is harder to read in mail
 *    clients, several of them invert colours unpredictably, and a mostly-dark
 *    email trips more spam heuristics. The band at the top carries the brand;
 *    the part people actually read stays legible.
 */

export interface CampaignVehicle {
  title: string;
  meta: string;
  price: string;
  imageUrl: string | null;
  url: string;
}

export interface RenderOptions {
  body: string;
  unsubscribeUrl: string;
  address: string;
  siteBase: string;
  vehicles?: CampaignVehicle[];
  phone?: string | null;
}

const GREEN = "#2a5c42";
const INK = "#1a1a1a";
const MUTED = "#6f6f6f";
const RULE = "#e4e4e4";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Turns a bare URL in the body into a link.
 *
 * Runs after escaping, so the pattern only ever sees text that is already
 * safe — matching before escaping would let a crafted URL smuggle an
 * attribute into the anchor it generates.
 */
function autolink(escaped: string): string {
  return escaped.replace(
    /(https?:\/\/[^\s<]+[^\s<.,:;"')\]])/g,
    `<a href="$1" style="color:${GREEN}">$1</a>`,
  );
}

function paragraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((p) => autolink(escapeHtml(p.trim())).replace(/\n/g, "<br>"))
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:${INK}">${p}</p>`,
    )
    .join("");
}

/** One vehicle, as a table so Outlook keeps the image and text side by side. */
function vehicleCard(v: CampaignVehicle): string {
  const image = v.imageUrl
    ? `<a href="${v.url}"><img src="${v.imageUrl}" alt="${escapeHtml(v.title)}" width="552" style="display:block;width:100%;max-width:552px;height:auto;border-radius:8px 8px 0 0;border:0" /></a>`
    : "";

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;border:1px solid ${RULE};border-radius:8px;border-collapse:separate">
  <tr><td style="padding:0">${image}</td></tr>
  <tr><td style="padding:16px 18px">
    <div style="font-size:17px;font-weight:700;color:${INK};margin-bottom:4px">${escapeHtml(v.title)}</div>
    ${v.meta ? `<div style="font-size:13px;color:${MUTED};margin-bottom:10px">${escapeHtml(v.meta)}</div>` : ""}
    <div style="font-size:20px;font-weight:700;color:${GREEN};margin-bottom:14px">${escapeHtml(v.price)}</div>
    <a href="${v.url}" style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:6px">View this vehicle</a>
  </td></tr>
</table>`;
}

export function renderHtml(o: RenderOptions): string {
  const cards = (o.vehicles ?? []).map(vehicleCard).join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Adedayo Aremu Autos</title></head>
<body style="margin:0;padding:0;background:#f2f2f2;-webkit-font-smoothing:antialiased">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f2f2f2">
<tr><td align="center" style="padding:24px 12px">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">

  <!-- Brand band. Dark like the site; the body below stays white to read. -->
  <tr><td style="background:#0a0a0a;padding:24px 28px">
    <img src="${o.siteBase}/img/logo.png" alt="" width="40" height="40" style="vertical-align:middle;border:0" />
    <span style="display:inline-block;vertical-align:middle;margin-left:12px;font-size:18px;font-weight:800;letter-spacing:.04em;color:#f0f0f0">
      ADEDAYO AREMU <span style="color:#4e9d76">AUTOS</span>
    </span>
    <div style="margin-top:6px;font-size:11px;letter-spacing:.16em;color:#8f8f8f">
      BUY &bull; RENT &bull; RENT-TO-OWN &bull; FINANCE
    </div>
  </td></tr>

  <tr><td style="padding:32px 28px 8px">
    ${paragraphs(o.body)}
  </td></tr>

  ${cards ? `<tr><td style="padding:8px 28px 0">${cards}</td></tr>` : ""}

  <tr><td style="padding:8px 28px 32px">
    <a href="${o.siteBase}/us/inventory" style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 26px;border-radius:8px">
      Browse all vehicles
    </a>
    ${o.phone ? `<div style="margin-top:16px;font-size:14px;color:${MUTED}">Or call us on <a href="tel:${o.phone}" style="color:${GREEN};font-weight:600">${escapeHtml(o.phone)}</a></div>` : ""}
  </td></tr>

  <tr><td style="background:#fafafa;border-top:1px solid ${RULE};padding:20px 28px">
    <div style="font-size:12px;line-height:1.6;color:${MUTED}">
      ${escapeHtml(o.address)}
    </div>
    <div style="margin-top:8px;font-size:12px;line-height:1.6;color:${MUTED}">
      You are receiving this because you subscribed on our website.
      <a href="${o.unsubscribeUrl}" style="color:${MUTED};text-decoration:underline">Unsubscribe</a>
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/**
 * The plain-text alternative.
 *
 * Not optional: a message with no text part scores markedly worse with spam
 * filters, and some people genuinely read mail this way.
 */
export function renderText(o: RenderOptions): string {
  const cars = (o.vehicles ?? [])
    .map((v) => `* ${v.title} — ${v.price}\n  ${v.meta}\n  ${v.url}`)
    .join("\n\n");

  return [
    "ADEDAYO AREMU AUTOS",
    "",
    o.body,
    cars ? `\n${cars}` : "",
    `\nBrowse all vehicles: ${o.siteBase}/us/inventory`,
    o.phone ? `Call us: ${o.phone}` : "",
    "",
    "---",
    o.address,
    `Unsubscribe: ${o.unsubscribeUrl}`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}
