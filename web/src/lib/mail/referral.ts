import "server-only";
import { escapeHtml } from "@/lib/campaign/render";
import { mailFrom } from "@/lib/mail";
import { siteUrl } from "@/lib/siteUrl";

/**
 * The emails the referral programme sends.
 *
 * All transactional, all without an unsubscribe link: somebody who has
 * applied to be paid by this business needs the decision and the agreement,
 * and letting them switch those off would mean losing the thread of their own
 * application.
 */

const GREEN = "#2a5c42";
const MUTED = "#6b736e";
const RULE = "#e6e6e6";

function shell(heading: string, bodyHtml: string): string {
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
    <div style="font-size:12px;line-height:1.6;color:${MUTED}">
      Sent because you applied to the Adedayo Aremu Autos referral programme.
    </div>
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
    if (!res.ok) console.error("[referral] mail failed", res.status, await res.text());
  } catch (e) {
    console.error("[referral] mail threw", e);
  }
}

/**
 * "We have your application."
 *
 * Sent the instant it is submitted, because the alternative is somebody
 * refreshing their inbox wondering whether the form worked. It promises a
 * reply within one working day and says nothing about the outcome — an
 * acknowledgement that sounds like an acceptance is worse than silence.
 */
export async function sendApplicationReceived(o: { to: string; name: string }): Promise<void> {
  const first = o.name.trim().split(/\s+/)[0] || "there";
  const html = shell(
    "Application received",
    `<p style="margin:0 0 14px;font-size:16px;color:#111">Hello ${escapeHtml(first)},</p>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333">
       Thank you for applying to our referral programme. We have your
       application and someone will read it properly.
     </p>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333">
       You will hear from us <strong>within one working day</strong>, either
       by email or by phone. If we go ahead, the next step is a short
       agreement to read and accept — nothing is owed by you at any point.
     </p>
     <p style="margin:0;font-size:15px;line-height:1.6;color:${MUTED}">
       There is nothing to do in the meantime.
     </p>`,
  );
  const text = [
    `Hello ${first},`,
    "",
    "Thank you for applying to our referral programme. We have your application and someone will read it properly.",
    "",
    "You will hear from us within one working day, either by email or by phone. If we go ahead, the next step is a short agreement to read and accept — nothing is owed by you at any point.",
    "",
    "There is nothing to do in the meantime.",
    "",
    "Adedayo Aremu Autos",
  ].join("\n");

  await send(o.to, "We have your referral partner application", html, text);
}

/**
 * "You are approved — here is the agreement."
 *
 * The link is the only thing in this email that matters, so it is a button and
 * it is also printed as text: the invitation links were being hand-copied off
 * a phone screen and arriving truncated, and this is the same failure waiting
 * to happen to a 90-character token.
 *
 * It deliberately does not say "welcome aboard". Nothing is agreed until they
 * have read the terms and accepted them, and an email that celebrates first
 * makes the agreement look like a formality.
 */
export async function sendAgreementToSign(o: {
  to: string;
  name: string;
  link: string;
  commission: string;
}): Promise<void> {
  const first = o.name.trim().split(/\s+/)[0] || "there";
  const html = shell(
    "Your partner agreement",
    `<p style="margin:0 0 14px;font-size:16px;color:#111">Hello ${escapeHtml(first)},</p>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333">
       Good news — we would like to take your application forward. The last
       step is the partner agreement. It is short, it is in plain English, and
       you should read it before you accept it.
     </p>
     <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#333">
       Your commission rate is <strong>${escapeHtml(o.commission)}</strong> of
       what the customer pays us, on completed hires and sales you introduce.
     </p>
     <p style="margin:0 0 18px">
       <a href="${escapeHtml(o.link)}" style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 26px;border-radius:8px">Read and accept the agreement</a>
     </p>
     <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:${MUTED}">
       If the button does not work, copy this address into your browser:<br>
       <span style="word-break:break-all;color:#333">${escapeHtml(o.link)}</span>
     </p>
     <p style="margin:0;font-size:15px;line-height:1.6;color:#333">
       You can also decline on that page, and nothing further happens. Your
       referral code becomes live only once you have accepted.
     </p>`,
  );
  const text = [
    `Hello ${first},`,
    "",
    "Good news — we would like to take your application forward. The last step is the partner agreement. It is short, it is in plain English, and you should read it before you accept it.",
    "",
    `Your commission rate is ${o.commission} of what the customer pays us, on completed hires and sales you introduce.`,
    "",
    "Read and accept the agreement:",
    o.link,
    "",
    "You can also decline on that page, and nothing further happens. Your referral code becomes live only once you have accepted.",
    "",
    "Adedayo Aremu Autos",
  ].join("\n");

  await send(o.to, "Your Adedayo Aremu Autos partner agreement", html, text);
}

/**
 * "Not this time."
 *
 * Sent because the alternative is an applicant who was told to expect an
 * answer within a working day and never hears one, and then phones to ask.
 * The reason is whatever the reviewer typed; where they typed nothing, the
 * email says plainly that no reason was given rather than inventing one.
 */
export async function sendApplicationDeclined(o: {
  to: string;
  name: string;
  reason?: string | null;
}): Promise<void> {
  const first = o.name.trim().split(/\s+/)[0] || "there";
  const reason = o.reason?.trim();
  const html = shell(
    "About your application",
    `<p style="margin:0 0 14px;font-size:16px;color:#111">Hello ${escapeHtml(first)},</p>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333">
       Thank you for applying to our referral programme. We are not taking
       your application forward at this time.
     </p>
     ${
       reason
         ? `<div style="margin:0 0 16px;border-left:3px solid ${RULE};padding:2px 0 2px 14px;font-size:15px;line-height:1.6;color:#333;white-space:pre-line">${escapeHtml(reason)}</div>`
         : ""
     }
     <p style="margin:0;font-size:15px;line-height:1.6;color:#333">
       This is not a judgement on you and it is not permanent — you are welcome
       to apply again later, or to call us if you would like to talk it through.
     </p>`,
  );
  const text = [
    `Hello ${first},`,
    "",
    "Thank you for applying to our referral programme. We are not taking your application forward at this time.",
    ...(reason ? ["", reason] : []),
    "",
    "This is not a judgement on you and it is not permanent — you are welcome to apply again later, or to call us if you would like to talk it through.",
    "",
    "Adedayo Aremu Autos",
  ].join("\n");

  await send(o.to, "About your referral partner application", html, text);
}

/**
 * "You're in."
 *
 * Sent the moment the agreement is accepted, because that is the moment the
 * code goes live — and a partner whose code works but who was never told is a
 * partner sending nobody. Carries the code, the link, and the way in to their
 * own account.
 */
export async function sendPartnerWelcome(o: {
  to: string;
  name: string;
  code: string;
  link: string;
  accountLink: string;
  commission: string;
}): Promise<void> {
  const first = o.name.trim().split(/\s+/)[0] || "there";
  const html = shell(
    "Welcome — you are a partner",
    `<p style="margin:0 0 14px;font-size:16px;color:#111">Congratulations ${escapeHtml(first)},</p>
     <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#333">
       Your agreement is accepted and your referral code is live from now.
       Anyone who books or buys through your link is recorded against your
       name, and you earn ${escapeHtml(o.commission)} of what they pay.
     </p>

     <div style="margin:0 0 20px;border:1px solid ${RULE};border-radius:10px;padding:18px;text-align:center">
       <div style="font-size:12px;letter-spacing:.14em;color:${MUTED}">YOUR CODE</div>
       <div style="margin-top:4px;font-size:26px;font-weight:800;letter-spacing:.06em;color:#111">${escapeHtml(o.code)}</div>
       <div style="margin-top:12px;font-size:13px;color:${MUTED}">Your link</div>
       <div style="margin-top:3px;font-size:14px;word-break:break-all;color:${GREEN}">${escapeHtml(o.link)}</div>
     </div>

     <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#333">
       Set up your partner account to see live stock, every referral you have
       made, what has completed, and what you are owed.
     </p>
     <p style="margin:0 0 18px">
       <a href="${escapeHtml(o.accountLink)}" style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 26px;border-radius:8px">Create my partner account</a>
     </p>
     <p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED}">
       If the button does not work, copy this address into your browser:<br>
       <span style="word-break:break-all;color:#333">${escapeHtml(o.accountLink)}</span>
     </p>`,
  );
  const text = [
    `Congratulations ${first},`,
    "",
    `Your agreement is accepted and your referral code is live from now. Anyone who books or buys through your link is recorded against your name, and you earn ${o.commission} of what they pay.`,
    "",
    `Your code: ${o.code}`,
    `Your link: ${o.link}`,
    "",
    "Set up your partner account to see live stock, every referral you have made, what has completed, and what you are owed:",
    o.accountLink,
    "",
    "Adedayo Aremu Autos",
  ].join("\n");

  await send(o.to, "Welcome to the Adedayo Aremu Autos partner programme", html, text);
}

/** An application is waiting. Sent to whoever handles the leads. */
export async function notifyStaffOfApplication(o: {
  id: string;
  name: string;
  market: string;
  phone: string;
  email: string;
  proposal: string;
}): Promise<void> {
  const to = process.env.LEAD_ALERT_EMAIL?.split(",")[0]?.trim();
  if (!to) return;

  const admin = `${siteUrl()}/admin/referrals`;
  const html = shell(
    "New referral partner application",
    `<div style="font-size:22px;font-weight:800;color:#111;margin-bottom:12px">${escapeHtml(o.name)}</div>
     <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:15px;color:#111">
       <tr><td style="padding:5px 0;color:${MUTED};width:30%">Market</td><td>${escapeHtml(o.market.toUpperCase())}</td></tr>
       <tr><td style="padding:5px 0;color:${MUTED}">Phone</td><td><a href="tel:${escapeHtml(o.phone.replace(/[^\d+]/g, ""))}" style="color:${GREEN};text-decoration:none">${escapeHtml(o.phone)}</a></td></tr>
       <tr><td style="padding:5px 0;color:${MUTED}">Email</td><td><a href="mailto:${escapeHtml(o.email)}" style="color:${GREEN};text-decoration:none">${escapeHtml(o.email)}</a></td></tr>
     </table>
     <div style="margin-top:18px;font-size:13px;color:${MUTED}">How they plan to refer</div>
     <div style="margin-top:6px;border-left:3px solid ${RULE};padding:2px 0 2px 14px;font-size:15px;line-height:1.6;color:#333;white-space:pre-line">${escapeHtml(o.proposal)}</div>
     <p style="margin:24px 0 0">
       <a href="${escapeHtml(admin)}" style="display:inline-block;border:1px solid ${RULE};color:#111;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px">Review the application</a>
     </p>
     <p style="margin:16px 0 0;font-size:13px;color:${MUTED}">
       They have been told to expect an answer within one working day.
     </p>`,
  );
  const text = [
    "New referral partner application",
    "",
    o.name,
    `Market: ${o.market.toUpperCase()}`,
    `Phone: ${o.phone}`,
    `Email: ${o.email}`,
    "",
    "How they plan to refer:",
    o.proposal,
    "",
    `Review: ${admin}`,
    "They have been told to expect an answer within one working day.",
  ].join("\n");

  await send(to, `Referral application — ${o.name}`, html, text);
}
