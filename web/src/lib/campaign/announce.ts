import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  campaigns,
  contentAnnouncements,
  newsletterSubscribers,
  pushSubscriptions,
} from "@/db/schema";
import { siteUrl } from "@/lib/siteUrl";
import { violates } from "@/lib/dbError";
import { pushToMarket, type PushResult } from "@/lib/push/send";
import { sendNextBatch, snapshotAudience, type SendProgress } from "./send";
import { isMissingAnnounceTable } from "./announceRecord";
import { draftFor, type Announceable } from "./announceDraft";

/**
 * Announcing a guide or an article to the people who subscribed.
 *
 * Only ever called from a staff action, after a person pressed Send and then
 * confirmed. Nothing in the build, the deploy or a scheduled job calls this.
 *
 * It is not a second sender. The email is an ordinary campaign: the same
 * audience rule (this market, not unsubscribed), the same per-recipient
 * ledger, the same unsubscribe link and header, the same Continue button if a
 * long list is cut short. The notification goes through pushToMarket, the
 * same call the notification composer makes.
 *
 * What this adds is the claim. Before a single message leaves, a row is
 * written saying "this guide has been announced in this market", inside the
 * same transaction that creates the campaign. The database allows one such
 * row per guide, so a double press, two members of staff at once, or a retry
 * after a timeout all find the claim taken and send nothing.
 */

export const ANNOUNCE_NOT_READY =
  "Announcements are not switched on yet. The database needs one update first. Ask the developer.";

export interface AnnounceInput {
  item: Announceable;
  /** The one editable line. Empty means the default. */
  intro?: string | null;
  email: boolean;
  push: boolean;
  /** Staff chose "Send again" on something already announced. */
  again?: boolean;
  user: { id?: string | null; email: string };
}

export interface AnnounceOutcome {
  ok: boolean;
  error?: string;
  /** Refused because it was already announced and "send again" was not chosen. */
  already?: boolean;
  campaignId?: string;
  /** People the email was addressed to. */
  recipients?: number;
  progress?: SendProgress;
  push?: PushResult;
}

/** Stand-ins for the two senders, so the test suite can watch what is asked of them. */
export interface AnnounceDeps {
  database?: typeof db;
  sendPush?: typeof pushToMarket;
}

export async function announce(
  input: AnnounceInput,
  deps: AnnounceDeps = {},
): Promise<AnnounceOutcome> {
  const database = deps.database ?? db;
  const sendPush = deps.sendPush ?? pushToMarket;
  const { item, user } = input;
  const draft = draftFor(item, siteUrl(), input.intro);

  if (!input.email && !input.push) {
    return { ok: false, error: "Choose email, notification, or both." };
  }

  // Who is there to hear it, by the same rules the senders apply.
  const [{ subscribers }] = await database
    .select({ subscribers: sql<number>`count(*)::int` })
    .from(newsletterSubscribers)
    .where(
      and(
        eq(newsletterSubscribers.marketCode, item.market),
        isNull(newsletterSubscribers.unsubscribedAt),
      ),
    );
  const [{ devices }] = await database
    .select({ devices: sql<number>`count(*)::int` })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.marketCode, item.market));

  const byEmail = input.email && subscribers > 0;
  const byPush = input.push && devices > 0;

  // Refused before anything is recorded, so the guide stays on the list of
  // things still to announce.
  if (!byEmail && !byPush) {
    return { ok: false, error: "Nobody to send to in that market yet." };
  }
  if (byEmail && !process.env.RESEND_API_KEY) {
    return { ok: false, error: "Email is not set up on this site (RESEND_API_KEY is not set)." };
  }

  // Has it gone out before? Read first so the common case gets a clear
  // answer; the unique index below is what actually guarantees it.
  let first: { createdAt: Date } | undefined;
  try {
    [first] = await database
      .select({ createdAt: contentAnnouncements.createdAt })
      .from(contentAnnouncements)
      .where(
        and(
          eq(contentAnnouncements.marketCode, item.market),
          eq(contentAnnouncements.contentType, item.kind),
          eq(contentAnnouncements.slug, item.slug),
          eq(contentAnnouncements.sendAgain, false),
        ),
      )
      .limit(1);
  } catch (e) {
    if (isMissingAnnounceTable(e)) return { ok: false, error: ANNOUNCE_NOT_READY };
    throw e;
  }

  if (first && !input.again) {
    return {
      ok: false,
      already: true,
      error: `Already announced on ${first.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}. Nothing was sent.`,
    };
  }

  // The claim and the campaign, together or not at all.
  let campaignId: string | null = null;
  let announcementId: string;
  try {
    const made = await database.transaction(async (tx) => {
      let cid: string | null = null;
      if (byEmail) {
        const [c] = await tx
          .insert(campaigns)
          .values({
            marketCode: item.market,
            subject: draft.subject,
            body: draft.body,
            status: "sending",
            createdBy: user.id ?? null,
            createdByEmail: user.email,
            startedAt: new Date(),
          })
          .returning({ id: campaigns.id });
        cid = c.id;
      }
      const [a] = await tx
        .insert(contentAnnouncements)
        .values({
          marketCode: item.market,
          contentType: item.kind,
          slug: item.slug,
          title: draft.title,
          intro: draft.intro,
          campaignId: cid,
          // A first announcement takes the one slot the index allows. Only a
          // repeat is marked as one.
          sendAgain: Boolean(first),
          announcedBy: user.id ?? null,
          announcedByEmail: user.email,
        })
        .returning({ id: contentAnnouncements.id });
      return { cid, aid: a.id };
    });
    campaignId = made.cid;
    announcementId = made.aid;
  } catch (e) {
    if (isMissingAnnounceTable(e)) return { ok: false, error: ANNOUNCE_NOT_READY };
    if (violates(e, "content_announcements_once")) {
      return {
        ok: false,
        already: true,
        error: "Somebody announced this a moment ago. Nothing was sent twice.",
      };
    }
    throw e;
  }

  const outcome: AnnounceOutcome = { ok: true };

  if (campaignId) {
    outcome.campaignId = campaignId;
    outcome.recipients = await snapshotAudience(campaignId, item.market, database);
    outcome.progress = await sendNextBatch(campaignId, database);
  }

  if (byPush) {
    // A notification that fails must not turn a sent email into an error.
    try {
      outcome.push = await sendPush(item.market, draft.push, database);
    } catch (e) {
      outcome.push = {
        sent: 0, failed: 0, pruned: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
    await database
      .update(contentAnnouncements)
      .set({ pushSent: outcome.push.sent, pushFailed: outcome.push.failed })
      .where(eq(contentAnnouncements.id, announcementId));
  }

  console.log(
    `[announce] ${item.market} ${item.kind} "${item.slug}" by ${user.email}: ` +
      `email ${outcome.progress ? `${outcome.progress.sent} sent, ${outcome.progress.remaining} left` : "off"}, ` +
      `push ${outcome.push ? `${outcome.push.sent} sent` : "off"}`,
  );

  return outcome;
}
