import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contentAnnouncements, type ContentAnnouncement } from "@/db/schema";
import type { MarketCode } from "@/lib/market";

/**
 * Reading the record of what has been announced.
 *
 * The table arrives with migration 0036. Until that is applied, every read
 * here answers "the feature is off" instead of failing the page: the
 * Broadcasts screen and the ordinary campaign sender both pass through this
 * file, and neither may break because a new table is not there yet.
 */

/** Postgres "undefined_table" / "undefined_column", anywhere in the cause chain. */
export function isMissingAnnounceTable(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    const e = current as { code?: unknown; cause?: unknown };
    if (e.code === "42P01" || e.code === "42703") return true;
    current = e.cause;
  }
  return false;
}

export interface AnnouncedList {
  /** False while migration 0036 has not been applied. */
  ready: boolean;
  /** Newest first. */
  rows: ContentAnnouncement[];
}

/** Everything announced so far in these markets. */
export async function listAnnounced(
  markets: MarketCode[],
  database: typeof db = db,
): Promise<AnnouncedList> {
  if (markets.length === 0) return { ready: true, rows: [] };
  try {
    const rows = await database
      .select()
      .from(contentAnnouncements)
      .where(inArray(contentAnnouncements.marketCode, markets))
      .orderBy(desc(contentAnnouncements.createdAt));
    return { ready: true, rows };
  } catch (e) {
    if (isMissingAnnounceTable(e)) return { ready: false, rows: [] };
    throw e;
  }
}

/**
 * The announcement a campaign carries, or null for an ordinary campaign.
 *
 * Only a missing table is treated as "ordinary". Any other failure is thrown:
 * guessing "ordinary" on a database hiccup would send an announcement in the
 * wrong template.
 */
export async function announcementForCampaign(
  campaignId: string,
  database: typeof db = db,
): Promise<ContentAnnouncement | null> {
  try {
    const [row] = await database
      .select()
      .from(contentAnnouncements)
      .where(eq(contentAnnouncements.campaignId, campaignId))
      .limit(1);
    return row ?? null;
  } catch (e) {
    if (isMissingAnnounceTable(e)) return null;
    throw e;
  }
}
