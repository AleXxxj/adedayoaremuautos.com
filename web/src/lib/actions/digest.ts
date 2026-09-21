"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { requireStaff, allowedMarkets } from "@/lib/auth";
import { isMarketCode, type MarketCode } from "@/lib/market";
import { runWeeklyDigest, digestPreview } from "@/lib/digest/weekly";

export interface DigestActionResult {
  ok: boolean;
  message?: string;
  error?: string;
}

/**
 * Sends this week's digest now, rather than waiting for Saturday.
 *
 * `force` is passed because the person pressing it can see what is in it and
 * has decided to send it anyway — the cooldown exists to stop the schedule
 * doubling up, not to overrule somebody standing at the screen.
 */
export async function sendDigestNow(
  _prev: DigestActionResult | null,
  formData: FormData,
): Promise<DigestActionResult> {
  const user = await requireStaff();
  const market = String(formData.get("marketCode") ?? "");

  if (!isMarketCode(market)) return { ok: false, error: "Choose a market." };
  if (!allowedMarkets(user).includes(market)) {
    return { ok: false, error: "You cannot send to that market." };
  }

  const outcome = await runWeeklyDigest(market as MarketCode, {
    force: true,
    createdByEmail: user.email,
  });

  revalidatePath("/admin/campaigns");

  if (outcome.skipped) return { ok: false, error: outcome.skipped };
  if (outcome.error) return { ok: false, error: outcome.error };

  return {
    ok: true,
    message:
      `Sent ${outcome.found} new arrival${outcome.found === 1 ? "" : "s"} to ` +
      `${outcome.sent ?? 0} subscriber${(outcome.sent ?? 0) === 1 ? "" : "s"}.` +
      (outcome.failed ? ` ${outcome.failed} could not be delivered.` : ""),
  };
}

export interface DigestPreviewRow {
  id: string;
  label: string;
}

/** What Saturday's digest would contain for a market, as it stands today. */
export async function previewDigest(market: string): Promise<DigestPreviewRow[]> {
  await requireStaff();
  if (!isMarketCode(market)) return [];

  const rows = await digestPreview(market as MarketCode);
  return rows.map((v) => ({
    id: v.id,
    label: [v.year, v.make, v.model, v.trim].filter(Boolean).join(" "),
  }));
}

/** Stops a digest that was interrupted from sitting half-sent forever. */
export async function markDigestDone(id: string): Promise<void> {
  await requireStaff();
  await db
    .update(campaigns)
    .set({ status: "sent", completedAt: new Date() })
    .where(eq(campaigns.id, id));
  revalidatePath("/admin/campaigns");
}
