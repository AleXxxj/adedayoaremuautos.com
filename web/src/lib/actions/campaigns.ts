"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, newsletterSubscribers } from "@/db/schema";
import { requireStaff, assertMarketAccess } from "@/lib/auth";
import { sendNextBatch, sendPreview, snapshotAudience } from "@/lib/campaign/send";
import type { SendProgress } from "@/lib/campaign/send";

export interface CampaignResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  message?: string;
  progress?: SendProgress;
}

const composeSchema = z.object({
  marketCode: z.enum(["us", "ng"]),
  subject: z.string().trim().min(3, "Give it a subject").max(200),
  body: z.string().trim().min(20, "Write a little more than that").max(20000),
  /** Comma-separated ids from the picker. Capped to match the CHECK. */
  vehicleIds: z.string().optional(),
});

/** "a,b,c" -> ["a","b","c"], de-duplicated, uuid-shaped only, max 12. */
function parseVehicleIds(raw: string | undefined): string[] {
  if (!raw) return [];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => uuid.test(s)))].slice(0, 12);
}

/**
 * Sending to the whole list is restricted to owners and managers.
 *
 * Sales staff answer the customers they are given; a message to every customer
 * the business has is a different kind of act, and it cannot be recalled.
 */
async function requireBroadcaster() {
  const user = await requireStaff();
  if (user.role === "sales") {
    throw new Error("Only an owner or manager can send to the mailing list.");
  }
  return user;
}

/** How many people a send would actually reach right now. */
export async function audienceSize(market: "us" | "ng"): Promise<number> {
  await requireBroadcaster();
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(newsletterSubscribers)
    .where(
      and(
        eq(newsletterSubscribers.marketCode, market),
        isNull(newsletterSubscribers.unsubscribedAt),
      ),
    );
  return total;
}

/** Sends the draft to the signed-in member of staff, and nobody else. */
export async function sendTestCampaign(
  _prev: CampaignResult | null,
  formData: FormData,
): Promise<CampaignResult> {
  const user = await requireBroadcaster();
  const parsed = composeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const result = await sendPreview(
    parsed.data.subject,
    parsed.data.body,
    user.email,
    parsed.data.marketCode,
    parseVehicleIds(parsed.data.vehicleIds),
  );
  return result.ok
    ? { ok: true, message: `Test sent to ${user.email}. Check it before sending for real.` }
    : { ok: false, error: result.error };
}

/**
 * Creates the campaign, freezes its audience, and sends the first slice.
 *
 * The record is written before a single message goes out. If the function is
 * cut short mid-send, every remaining recipient is still marked pending and
 * the campaign can be resumed — rather than the business knowing only that
 * "some of them" received it.
 */
export async function startCampaign(
  _prev: CampaignResult | null,
  formData: FormData,
): Promise<CampaignResult> {
  const user = await requireBroadcaster();
  const parsed = composeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }
  const v = parsed.data;
  assertMarketAccess(user, v.marketCode);

  // Typing the word is the confirmation. A broadcast has no undo, and a plain
  // button is one mis-click away from every customer receiving a draft.
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "SEND") {
    return {
      ok: false,
      fieldErrors: { confirm: ['Type SEND to confirm.'] },
    };
  }

  const [campaign] = await db
    .insert(campaigns)
    .values({
      marketCode: v.marketCode,
      subject: v.subject,
      body: v.body,
      vehicleIds: parseVehicleIds(v.vehicleIds),
      status: "sending",
      createdBy: user.id,
      createdByEmail: user.email,
      startedAt: new Date(),
    })
    .returning({ id: campaigns.id });

  const count = await snapshotAudience(campaign.id, v.marketCode);
  if (count === 0) {
    await db
      .update(campaigns)
      .set({ status: "sent", completedAt: new Date() })
      .where(eq(campaigns.id, campaign.id));
    revalidatePath("/admin/campaigns");
    return { ok: false, error: "Nobody is subscribed in that market yet." };
  }

  const progress = await sendNextBatch(campaign.id);
  revalidatePath("/admin/campaigns");

  return {
    ok: true,
    progress,
    message: progress.finished
      ? `Sent to ${progress.sent} subscriber${progress.sent === 1 ? "" : "s"}.`
      : `Sent ${progress.sent} so far — ${progress.remaining} still to go. Press Continue.`,
  };
}

/** Picks up a campaign that was interrupted. */
export async function continueCampaign(
  _prev: CampaignResult | null,
  formData: FormData,
): Promise<CampaignResult> {
  await requireBroadcaster();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Nothing to continue." };

  const progress = await sendNextBatch(id);
  revalidatePath("/admin/campaigns");

  return {
    ok: true,
    progress,
    message: progress.finished
      ? "Finished."
      : `${progress.remaining} still to go. Press Continue again.`,
  };
}
