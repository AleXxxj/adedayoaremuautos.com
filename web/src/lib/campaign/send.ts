import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, campaignRecipients, newsletterSubscribers } from "@/db/schema";
import { siteUrl } from "@/lib/feeds/inventory";

/**
 * Resend accepts up to 100 messages per batch call. Each recipient gets their
 * own message rather than sharing a `to` field — putting the whole list in one
 * header would disclose every subscriber's address to every subscriber, and it
 * would make a per-person unsubscribe link impossible.
 */
const BATCH_SIZE = 100;

/**
 * How many to attempt per invocation.
 *
 * A serverless function has a wall clock, and a list that outgrows it must not
 * half-send and lose its place. Recipients are written as rows up front, so
 * stopping here is safe: the next run reads whatever is still pending, and the
 * unique constraint on (campaign, email) means a retry cannot double-send.
 */
const PER_RUN = 400;

export interface SendProgress {
  attempted: number;
  sent: number;
  failed: number;
  remaining: number;
  finished: boolean;
  error?: string;
}

/** Plain text into simple, well-behaved email HTML. Exported so the
 *  legally required footer can be asserted on without sending mail. */
export function renderHtml(body: string, unsubscribeUrl: string, address: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => escapeHtml(p.trim()).replace(/\n/g, "<br>"))
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${p}</p>`)
    .join("");

  // Inline styles and a table-free single column: every quirk of Outlook and
  // Gmail punishes anything cleverer, and a newsletter that renders as a wall
  // of unstyled text reads as spam.
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f5">
<div style="max-width:600px;margin:0 auto;padding:32px 24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;color:#1a1a1a;background:#ffffff">
  <div style="font-weight:700;font-size:18px;letter-spacing:.02em;margin-bottom:24px">
    ADEDAYO AREMU <span style="color:#2a5c42">AUTOS</span>
  </div>
  ${paragraphs}
  <hr style="border:0;border-top:1px solid #e3e3e3;margin:32px 0 16px">
  <p style="margin:0 0 8px;font-size:12px;color:#767676;line-height:1.5">
    ${escapeHtml(address)}
  </p>
  <p style="margin:0;font-size:12px;color:#767676;line-height:1.5">
    You are receiving this because you subscribed on our website.
    <a href="${unsubscribeUrl}" style="color:#767676">Unsubscribe</a>.
  </p>
</div></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderText(body: string, unsubscribeUrl: string, address: string): string {
  return `${body}\n\n---\n${address}\nUnsubscribe: ${unsubscribeUrl}`;
}

/**
 * Freezes the audience for a campaign.
 *
 * Snapshotting the list rather than querying it at send time means someone who
 * subscribes mid-send is not half-included, and someone who unsubscribes after
 * the snapshot is still excluded — see the filter below, which is re-checked
 * per batch.
 */
export async function snapshotAudience(campaignId: string, market: string): Promise<number> {
  const subs = await db
    .select({ id: newsletterSubscribers.id, email: newsletterSubscribers.email })
    .from(newsletterSubscribers)
    .where(
      and(
        eq(newsletterSubscribers.marketCode, market as "us" | "ng"),
        sql`${newsletterSubscribers.unsubscribedAt} is null`,
      ),
    );

  if (subs.length === 0) return 0;

  await db
    .insert(campaignRecipients)
    .values(
      subs.map((s) => ({
        campaignId,
        subscriberId: s.id,
        email: s.email,
      })),
    )
    .onConflictDoNothing();

  await db
    .update(campaigns)
    .set({ recipientCount: subs.length })
    .where(eq(campaigns.id, campaignId));

  return subs.length;
}

/**
 * Sends the next slice of a campaign.
 *
 * Safe to call repeatedly: only rows still marked pending are attempted, and
 * each is marked before the next batch begins.
 */
export async function sendNextBatch(campaignId: string): Promise<SendProgress> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_ALERT_FROM ?? "leads@adedayoaremuautos.com";
  const address =
    process.env.MAILING_ADDRESS ??
    "Adedayo Aremu Autos, 507 Gillespie St, Greensboro, NC 27401, USA";

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    return { attempted: 0, sent: 0, failed: 0, remaining: 0, finished: true, error: "No such campaign." };
  }
  if (!key) {
    return {
      attempted: 0, sent: 0, failed: 0, remaining: 0, finished: false,
      error: "RESEND_API_KEY is not set.",
    };
  }

  const pending = await db
    .select()
    .from(campaignRecipients)
    .where(
      and(eq(campaignRecipients.campaignId, campaignId), eq(campaignRecipients.status, "pending")),
    )
    .limit(PER_RUN);

  if (pending.length === 0) {
    await finalise(campaignId);
    return { attempted: 0, sent: 0, failed: 0, remaining: 0, finished: true };
  }

  // Anyone who opted out between the snapshot and now must not be emailed.
  const optedOut = new Set(
    (
      await db
        .select({ email: newsletterSubscribers.email })
        .from(newsletterSubscribers)
        .where(sql`${newsletterSubscribers.unsubscribedAt} is not null`)
    ).map((r) => r.email),
  );

  const base = siteUrl();
  let sent = 0;
  let failed = 0;

  // Filtered ONCE, before the loop. Filtering inside it and then slicing by
  // the unfiltered index skipped recipients whenever anyone had opted out —
  // the filtered array is shorter than the loop bound, so the tail was never
  // reached and those rows stayed pending for good.
  const deliverable = pending.filter((r) => !optedOut.has(r.email));
  const skipped = pending.filter((r) => optedOut.has(r.email));

  // Recorded rather than left pending. An unsubscribed row that keeps its
  // pending status can never be resolved, so the campaign would never finish
  // and "Continue sending" would offer itself forever with nothing to send.
  for (const r of skipped) {
    await db
      .update(campaignRecipients)
      .set({ status: "skipped", error: "Unsubscribed before this batch was sent" })
      .where(eq(campaignRecipients.id, r.id));
  }

  // Fetched once, and only for the addresses actually being written to. The
  // previous version re-read every subscriber in the database on every batch.
  const tokens = new Map(
    deliverable.length === 0
      ? []
      : (
          await db
            .select({
              email: newsletterSubscribers.email,
              token: newsletterSubscribers.unsubscribeToken,
            })
            .from(newsletterSubscribers)
            .where(inArray(newsletterSubscribers.email, deliverable.map((r) => r.email)))
        ).map((r) => [r.email, r.token] as const),
  );

  for (let i = 0; i < deliverable.length; i += BATCH_SIZE) {
    const slice = deliverable.slice(i, i + BATCH_SIZE);

    const messages = slice.map((r) => {
      const url = `${base}/unsubscribe?token=${encodeURIComponent(tokens.get(r.email) ?? "")}`;
      return {
        from,
        to: [r.email],
        subject: campaign.subject,
        html: renderHtml(campaign.body, url, address),
        text: renderText(campaign.body, url, address),
        headers: {
          // Required by Gmail and Yahoo for bulk senders since 2024. Without
          // both of these, mail to those providers is rejected or junked.
          "List-Unsubscribe": `<${url}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      };
    });

    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);

      for (const r of slice) {
        await db
          .update(campaignRecipients)
          .set({ status: "sent", sentAt: new Date() })
          .where(eq(campaignRecipients.id, r.id));
      }
      sent += slice.length;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      for (const r of slice) {
        await db
          .update(campaignRecipients)
          .set({ status: "failed", error: message.slice(0, 500) })
          .where(eq(campaignRecipients.id, r.id));
      }
      failed += slice.length;
    }
  }

  await db
    .update(campaigns)
    .set({
      sentCount: sql`${campaigns.sentCount} + ${sent}`,
      failedCount: sql`${campaigns.failedCount} + ${failed}`,
    })
    .where(eq(campaigns.id, campaignId));

  const [{ left }] = await db
    .select({ left: sql<number>`count(*)::int` })
    .from(campaignRecipients)
    .where(
      and(eq(campaignRecipients.campaignId, campaignId), eq(campaignRecipients.status, "pending")),
    );

  if (left === 0) await finalise(campaignId);

  return {
    attempted: pending.length,
    sent,
    failed,
    remaining: left,
    finished: left === 0,
  };
}

async function finalise(campaignId: string) {
  const [{ failed }] = await db
    .select({ failed: sql<number>`count(*)::int` })
    .from(campaignRecipients)
    .where(
      and(eq(campaignRecipients.campaignId, campaignId), eq(campaignRecipients.status, "failed")),
    );

  await db
    .update(campaigns)
    .set({ status: failed > 0 ? "failed" : "sent", completedAt: new Date() })
    .where(eq(campaigns.id, campaignId));
}

/** A single message to one address, for the "send myself a test" button. */
export async function sendPreview(
  subject: string,
  body: string,
  to: string,
): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_ALERT_FROM ?? "leads@adedayoaremuautos.com";
  const address =
    process.env.MAILING_ADDRESS ??
    "Adedayo Aremu Autos, 507 Gillespie St, Greensboro, NC 27401, USA";
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set." };

  // A deliberately dead token: a test must render the footer exactly as a real
  // send would, without giving the tester a link that unsubscribes anyone.
  const url = `${siteUrl()}/unsubscribe?token=preview`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `[TEST] ${subject}`,
        html: renderHtml(body, url, address),
        text: renderText(body, url, address),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
