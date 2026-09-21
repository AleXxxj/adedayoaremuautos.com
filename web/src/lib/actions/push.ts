"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, allowedMarkets } from "@/lib/auth";
import { pushToMarket } from "@/lib/push/send";

export interface PushFormResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** What actually happened, shown to whoever pressed send. */
  summary?: { sent: number; failed: number; pruned: number };
}

/**
 * A notification title and body appear in a small system panel and are
 * truncated hard by the operating system. These limits are generous against
 * what a phone actually shows, and exist so nobody writes a paragraph and
 * wonders why it arrived as an ellipsis.
 */
const schema = z.object({
  marketCode: z.enum(["us", "ng"], { message: "Choose a market." }),
  title: z
    .string()
    .trim()
    .min(3, "Give it a title")
    .max(60, "Keep the title under 60 characters"),
  body: z
    .string()
    .trim()
    .min(3, "Say something")
    .max(160, "Keep the message under 160 characters"),
  /** Where tapping it lands. Site-relative, checked below. */
  url: z.string().trim().max(200).optional(),
});

/**
 * Sends a notification to every browser registered for a market.
 *
 * Sent synchronously, unlike the automatic ones: somebody is standing at the
 * screen having just pressed send and should be told what happened rather
 * than left to guess. The audience is in the hundreds at most, so this
 * returns in a moment — if it ever grows into the tens of thousands it needs
 * the same resumable batching the email campaigns already use.
 */
export async function sendPushBroadcast(
  _prev: PushFormResult | null,
  formData: FormData,
): Promise<PushFormResult> {
  const user = await requireStaff();

  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }
  const v = parsed.data;

  if (!allowedMarkets(user).includes(v.marketCode)) {
    return { ok: false, error: "You cannot send to that market." };
  }

  /*
   * Only our own pages.
   *
   * The destination is delivered to every recipient's device and opened on a
   * tap, so allowing an off-site URL would turn the customer list into traffic
   * for somewhere else — and a notification from a dealership that opens a
   * stranger's site is the kind of thing people report rather than ignore.
   */
  let url = (v.url ?? "").trim();
  if (url && !url.startsWith("/")) {
    return {
      ok: false,
      fieldErrors: { url: ["Start the link with / — it must be a page on this site."] },
    };
  }
  // `//evil.com` is a protocol-relative URL, not a path on this site.
  if (url.startsWith("//")) {
    return { ok: false, fieldErrors: { url: ["That is not a page on this site."] } };
  }
  if (!url) url = `/${v.marketCode}`;

  const result = await pushToMarket(v.marketCode, {
    title: v.title,
    body: v.body,
    url,
  });

  if (result.error) return { ok: false, error: result.error };

  console.log(
    `[push] broadcast by ${user.email}: "${v.title}" -> ${JSON.stringify(result)}`,
  );

  // Sending prunes the devices that have gone, so the audience figure on this
  // page is stale the moment it completes — and a count that still promises
  // recipients who were just removed is worse than no count.
  revalidatePath("/admin/campaigns");

  return {
    ok: true,
    summary: { sent: result.sent, failed: result.failed, pruned: result.pruned },
  };
}
