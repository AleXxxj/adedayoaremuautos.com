import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, vehicles } from "@/db/schema";
import { MARKETS, type MarketCode } from "@/lib/market";
import { snapshotAudience, sendNextBatch } from "@/lib/campaign/send";

/**
 * The weekly summary of new arrivals.
 *
 * This is the shape stock announcements take by email, and the reason it is a
 * digest rather than one message per car is deliverability. A push can be
 * replaced — six cars collapse into one alert — but an email cannot be
 * recalled or merged. A dealership that emails its whole list every time a
 * vehicle is listed teaches Gmail that its mail is bulk, and once that is
 * learned it applies to everything from the same domain: the lead alerts, the
 * birthday offers, the rental confirmations. One considered email a week
 * costs nothing and risks nothing.
 *
 * It writes an ordinary campaign rather than inventing a parallel path, so the
 * digest inherits the batching, the resumability, the recipient ledger, the
 * unsubscribe header and the postal address the manual composer already has —
 * and appears in the same history, which is where anyone will look for it.
 */

/** How far back an arrival counts as "this week". */
const WINDOW_DAYS = 7;

/** Enough to be worth opening, few enough to stay scannable on a phone. */
const MAX_VEHICLES = 6;

/** Nothing else may go out within this many days of the last digest. */
const COOLDOWN_DAYS = 6;

export interface DigestOutcome {
  market: MarketCode;
  /** New arrivals found in the window. */
  found: number;
  /** Why nothing was sent, when nothing was. */
  skipped?: string;
  campaignId?: string;
  recipients?: number;
  sent?: number;
  failed?: number;
  error?: string;
}

/** What a digest for this market would contain, without sending anything. */
export async function digestPreview(market: MarketCode) {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  return db
    .select({
      id: vehicles.id,
      year: vehicles.year,
      make: vehicles.make,
      model: vehicles.model,
      trim: vehicles.trim,
      priceMinor: vehicles.priceMinor,
      publishedAt: vehicles.publishedAt,
    })
    .from(vehicles)
    .where(
      and(
        eq(vehicles.marketCode, market),
        // Still available today. A car listed on Monday and sold on Friday
        // should not lead Sunday's email.
        eq(vehicles.status, "available"),
        gte(vehicles.publishedAt, since),
      ),
    )
    .orderBy(desc(vehicles.publishedAt))
    .limit(MAX_VEHICLES);
}

/** Whether a digest has already gone to this market recently. */
async function sentRecently(market: MarketCode): Promise<boolean> {
  const since = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.kind, "weekly_digest"),
        eq(campaigns.marketCode, market),
        gte(campaigns.createdAt, since),
      ),
    );
  return (row?.n ?? 0) > 0;
}

function subjectFor(count: number, market: MarketCode): string {
  const where = market === "us" ? "Greensboro" : "Nigeria";
  if (count === 1) return `A new arrival in ${where} this week`;
  return `${count} new arrivals in ${where} this week`;
}

/**
 * The covering note.
 *
 * Short on purpose. The vehicles below it are the message; a paragraph of
 * salesmanship above them is what people learn to scroll past, and then to
 * unsubscribe from.
 */
function bodyFor(count: number, market: MarketCode): string {
  const cfg = MARKETS[market];
  const lead =
    count === 1
      ? "One vehicle joined the forecourt this week."
      : `${count} vehicles joined the forecourt this week.`;

  return [
    "Hello,",
    "",
    `${lead} Here is what is new, with today's prices in ${cfg.currency}.`,
    "",
    "Tap any of them to see the full details, photographs and history.",
  ].join("\n");
}

/**
 * Builds and sends this week's digest for one market.
 *
 * Silence is a valid outcome and the common one. A week with no new stock
 * produces no email: a digest that arrives saying nothing has happened is the
 * fastest way to teach people that this sender is not worth opening.
 */
export async function runWeeklyDigest(
  market: MarketCode,
  options: { force?: boolean; createdByEmail?: string } = {},
): Promise<DigestOutcome> {
  const arrivals = await digestPreview(market);

  if (arrivals.length === 0) {
    return { market, found: 0, skipped: "No new vehicles were listed this week." };
  }

  if (!options.force && (await sentRecently(market))) {
    return {
      market,
      found: arrivals.length,
      skipped: `A digest already went to ${market.toUpperCase()} within the last ${COOLDOWN_DAYS} days.`,
    };
  }

  const subject = subjectFor(arrivals.length, market);

  const [campaign] = await db
    .insert(campaigns)
    .values({
      marketCode: market,
      kind: "weekly_digest",
      subject,
      body: bodyFor(arrivals.length, market),
      // Ids, not a copy: the price and photograph are resolved as the mail
      // goes out, so the digest can never quote a figure edited since.
      vehicleIds: arrivals.map((v) => v.id),
      status: "sending",
      createdByEmail: options.createdByEmail ?? "weekly digest",
      startedAt: new Date(),
    })
    .returning({ id: campaigns.id });

  const recipients = await snapshotAudience(campaign.id, market);
  if (recipients === 0) {
    await db
      .update(campaigns)
      .set({ status: "sent", completedAt: new Date() })
      .where(eq(campaigns.id, campaign.id));
    return {
      market,
      found: arrivals.length,
      campaignId: campaign.id,
      recipients: 0,
      skipped: "Nobody is subscribed in this market.",
    };
  }

  // Drained here rather than left for somebody to press Continue: no one is
  // watching a scheduled job. The batch loop is bounded so a stuck send can
  // never spin — anything left over is picked up by the Continue button on
  // the Broadcasts screen, exactly as an interrupted manual send would be.
  let sent = 0;
  let failed = 0;
  let error: string | undefined;

  for (let pass = 0; pass < 25; pass++) {
    const progress = await sendNextBatch(campaign.id);
    sent = progress.sent;
    failed = progress.failed;
    if (progress.error) {
      error = progress.error;
      break;
    }
    if (progress.finished) break;
  }

  console.log(
    `[digest] ${market} "${subject}" — ${recipients} recipients, sent ${sent}, failed ${failed}`,
  );

  return { market, found: arrivals.length, campaignId: campaign.id, recipients, sent, failed, error };
}
