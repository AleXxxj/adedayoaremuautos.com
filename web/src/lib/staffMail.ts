import "server-only";

import { mailFrom } from "@/lib/mail";

/**
 * Sends a staff invitation straight to the person it is for.
 *
 * The link used to be handed over by hand: the admin displayed it in a box and
 * the owner copied it into WhatsApp. That failed in the field, and the failure
 * is worth recording because nothing in the logs would ever have shown it.
 *
 * The token is 56 characters inside a URL roughly 120 long, presented in a
 * horizontally scrolling box. On a phone — which is where the owner was — a
 * hand-made selection of that box very easily stops short, and a truncated
 * token is rejected by Supabase with the words "Email link is invalid or has
 * expired". So a link that was never used at all reports itself as expired,
 * everyone concludes the link timed out, and generating a fresh one reproduces
 * the same result forever.
 *
 * Sending the mail from here removes the copy entirely for the normal case.
 * The link is still shown in the admin as a fallback, because email is not
 * guaranteed either — but it is no longer the only path.
 */

export interface InviteMailResult {
  sent: boolean;
  /** Why it was not sent, for the admin to see. Never shown to the recipient. */
  error?: string;
}

export async function sendInviteEmail(opts: {
  to: string;
  name?: string | null;
  link: string;
  /** An invitation to a new colleague, or a fresh link for an existing one. */
  kind: "invite" | "recovery";
}): Promise<InviteMailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, error: "RESEND_API_KEY is not set." };

  const greeting = opts.name?.trim() ? `Hi ${opts.name.trim().split(/\s+/)[0]},` : "Hi,";
  const subject =
    opts.kind === "invite"
      ? "Your Adedayo Aremu Autos staff account"
      : "Set a new password for your Adedayo Aremu Autos account";

  const lead =
    opts.kind === "invite"
      ? "You have been given access to the Adedayo Aremu Autos admin, where vehicles, enquiries and bookings are managed."
      : "A new sign-in link was requested for your Adedayo Aremu Autos admin account.";

  const text = [
    greeting,
    "",
    lead,
    "",
    "Open this link to choose your password:",
    opts.link,
    "",
    "The link works once. If it does not open, ask for a new one to be sent —",
    "do not retype it by hand, as it is too long to copy accurately.",
    "",
    "If you were not expecting this, you can ignore it.",
    "",
    "Adedayo Aremu Autos",
  ].join("\n");

  // A single anchor carrying the whole URL: the recipient taps, and nothing
  // depends on any part of the address surviving a manual selection.
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f5;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden">
      <tr><td style="background:#0a0a0a;padding:20px 28px">
        <span style="color:#f4f6f5;font-size:15px;font-weight:700;letter-spacing:.08em">ADEDAYO AREMU AUTOS</span>
      </td></tr>
      <tr><td style="padding:28px">
        <p style="margin:0 0 14px;font-size:15px;color:#111">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#333">${escapeHtml(lead)}</p>
        <p style="margin:0 0 24px">
          <a href="${escapeAttr(opts.link)}" style="display:inline-block;background:#2a5c42;color:#fff;text-decoration:none;padding:13px 24px;border-radius:8px;font-size:15px;font-weight:600">Choose your password</a>
        </p>
        <p style="margin:0 0 8px;font-size:13px;line-height:1.55;color:#666">
          The link works once. If it has stopped working, ask for a new one to be sent rather than retyping it — it is too long to copy accurately by hand.
        </p>
        <p style="margin:0;font-size:13px;color:#666">If you were not expecting this, you can ignore it.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: mailFrom(), to: [opts.to], subject, text, html }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { sent: false, error: `${res.status} ${await res.text()}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** A URL in an href — quotes and angle brackets only. */
function escapeAttr(s: string): string {
  return s.replace(/["<>]/g, (c) => ({ '"': "&quot;", "<": "%3C", ">": "%3E" })[c]!);
}
