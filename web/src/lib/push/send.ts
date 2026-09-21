import "server-only";

import webpush from "web-push";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { siteUrl } from "@/lib/siteUrl";
import type { MarketCode } from "@/lib/market";

/**
 * Delivering browser notifications.
 *
 * DESIGN RULE, the same one the lead alerts follow: sending must never fail
 * the thing that triggered it. Publishing a vehicle succeeds whether or not a
 * single notification goes out. A dealership that cannot list a car because a
 * push service is having a bad morning is worse off than one whose customers
 * hear about it an hour later.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Where a tap lands. Site-relative. */
  url: string;
  /** Same tag replaces rather than stacks — six cars, one notification. */
  tag?: string;
  icon?: string;
}

export interface PushResult {
  sent: number;
  failed: number;
  /** Endpoints the push service said are gone; these rows were deleted. */
  pruned: number;
  /** Set when nothing could be attempted at all. */
  error?: string;
}

let configured = false;

/**
 * VAPID identifies this server to the push services, which refuse anonymous
 * senders. The contact address is required by the spec and is what Google or
 * Mozilla would use to reach the sender about a problem.
 */
function configure(): string | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    return "NEXT_PUBLIC_VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is not set.";
  }
  if (!configured) {
    const contact = process.env.PUSH_CONTACT_EMAIL?.trim() || "info@adedayoaremuautos.com";
    webpush.setVapidDetails(`mailto:${contact}`, publicKey, privateKey);
    configured = true;
  }
  return null;
}

/** How many to have in flight at once. Enough to be quick, not a stampede. */
const CONCURRENCY = 20;

/**
 * Sends one notification to every browser registered for a market.
 *
 * Failures are classified rather than counted. A 404 or 410 means the browser
 * is gone — permission revoked, app uninstalled, profile deleted — and the row
 * is removed, because an audience number that includes the departed is a
 * number nobody can act on. Anything else is counted against the row and left
 * alone; a push service having a bad minute should not empty the list.
 */
export async function pushToMarket(
  market: MarketCode,
  payload: PushPayload,
): Promise<PushResult> {
  const problem = configure();
  if (problem) return { sent: 0, failed: 0, pruned: 0, error: problem };

  const rows = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.marketCode, market));

  if (rows.length === 0) return { sent: 0, failed: 0, pruned: 0 };

  const base = siteUrl();
  const absolute = payload.url.startsWith("http")
    ? payload.url
    : `${base}${payload.url.startsWith("/") ? "" : "/"}${payload.url}`;

  const message = JSON.stringify({ ...payload, url: absolute });

  const ok: string[] = [];
  const dead: string[] = [];
  const shaky: string[] = [];

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const slice = rows.slice(i, i + CONCURRENCY);
    await Promise.all(
      slice.map(async (row) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: row.endpoint,
              keys: { p256dh: row.p256dh, auth: row.auth },
            },
            message,
            { TTL: 60 * 60 * 24 },
          );
          ok.push(row.endpoint);
        } catch (e) {
          const status = (e as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) dead.push(row.endpoint);
          else shaky.push(row.endpoint);
        }
      }),
    );
  }

  if (dead.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, dead));
  }
  if (shaky.length > 0) {
    await db
      .update(pushSubscriptions)
      .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
      .where(inArray(pushSubscriptions.endpoint, shaky));
  }
  if (ok.length > 0) {
    // Anything that accepted a message is healthy again, whatever it did last
    // time. Listing the successes is clearer than excluding the failures.
    await db
      .update(pushSubscriptions)
      .set({ failureCount: 0, lastSeenAt: new Date() })
      .where(inArray(pushSubscriptions.endpoint, ok));
  }

  const sent = ok.length;
  const failed = shaky.length;

  console.log(
    `[push] ${market} "${payload.title}" — sent ${sent}, failed ${failed}, pruned ${dead.length}`,
  );

  return { sent, failed, pruned: dead.length };
}

/** How many browsers would receive a push for this market right now. */
export async function pushAudience(market: MarketCode): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.marketCode, market));
  return row?.n ?? 0;
}
