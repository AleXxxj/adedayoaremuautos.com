import "server-only";
import { desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { articleComments } from "@/db/schema";
import type { MarketCode } from "@/lib/market";

/**
 * Recent comments for the moderation screen, in the markets the reader works.
 *
 * Server-only on purpose. This used to be exported from a "use server" file,
 * which made it an endpoint any visitor's browser could call, signed in or
 * not — and it returned every commenter's email and IP address.
 *
 * Only the columns the moderation row shows are selected. Everything a server
 * component hands a client component is sent to the browser, so selecting the
 * whole row put each commenter's IP address in the page even though nothing
 * displayed it. The market filter matches the leads and subscriber screens:
 * staff limited to one market moderate only that market's comments.
 */
export async function listCommentsForModeration(markets: MarketCode[]) {
  return db
    .select({
      id: articleComments.id,
      articleSlug: articleComments.articleSlug,
      marketCode: articleComments.marketCode,
      authorName: articleComments.authorName,
      authorEmail: articleComments.authorEmail,
      body: articleComments.body,
      status: articleComments.status,
      moderatedByEmail: articleComments.moderatedByEmail,
      createdAt: articleComments.createdAt,
    })
    .from(articleComments)
    .where(inArray(articleComments.marketCode, markets))
    .orderBy(desc(articleComments.createdAt))
    .limit(200);
}

/** One row of the moderation list: exactly what the screen shows. */
export type ModerationComment = Awaited<ReturnType<typeof listCommentsForModeration>>[number];
