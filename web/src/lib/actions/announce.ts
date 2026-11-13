"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, assertMarketAccess } from "@/lib/auth";
import { announce } from "@/lib/campaign/announce";
import { findAnnounceable } from "@/lib/campaign/announceContent";
import { INTRO_MAX, kindWord } from "@/lib/campaign/announceDraft";

export interface AnnounceResult {
  ok: boolean;
  error?: string;
  message?: string;
  /** Which item this result is about, so the panel shows it in the right place. */
  key?: string;
}

const schema = z.object({
  marketCode: z.enum(["us", "ng"]),
  kind: z.enum(["guide", "article"]),
  slug: z.string().trim().min(1).max(200),
  intro: z.string().max(INTRO_MAX * 2).optional(),
  email: z.string().optional(),
  push: z.string().optional(),
  again: z.string().optional(),
  confirm: z.string().optional(),
});

const people = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * Announces one guide or article to one market's subscribers.
 *
 * The browser sends only which page and the one editable line. The title, the
 * promise and the address are read from the site's content here, so a
 * tampered form cannot put other words in front of the list.
 */
export async function sendAnnouncement(
  _prev: AnnounceResult | null,
  formData: FormData,
): Promise<AnnounceResult> {
  // The same rule as any broadcast: owners and managers only.
  const user = await requireStaff();
  if (user.role === "sales") {
    return { ok: false, error: "Only an owner or manager can send to the mailing list." };
  }

  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "That did not come through. Try again." };
  const v = parsed.data;
  const key = `${v.marketCode}:${v.kind}:${v.slug}`;
  assertMarketAccess(user, v.marketCode);

  // The second press. The first press of Send only opens the confirm step in
  // the browser; a request without this did not come from that step.
  if (v.confirm !== "yes") {
    return { ok: false, key, error: "Press Send, then confirm." };
  }

  const item = findAnnounceable(v.marketCode, v.kind, v.slug);
  if (!item) return { ok: false, key, error: "That page is not on the site." };

  const out = await announce({
    item,
    intro: v.intro,
    email: v.email === "1",
    push: v.push === "1",
    again: v.again === "1",
    user: { id: user.id, email: user.email },
  });

  revalidatePath("/admin/campaigns");
  if (!out.ok) return { ok: false, key, error: out.error };

  const parts: string[] = [];
  if (out.progress) {
    if (out.progress.error) {
      parts.push(`Email stopped: ${out.progress.error} Use Continue sending below.`);
    } else if (out.progress.finished) {
      parts.push(`Emailed ${people(out.progress.sent, "subscriber")}.`);
      if (out.progress.failed > 0) parts.push(`${out.progress.failed} failed.`);
    } else {
      parts.push(
        `Emailed ${out.progress.sent} so far, ${out.progress.remaining} to go. Use Continue sending below.`,
      );
    }
  }
  if (out.push) {
    parts.push(
      out.push.error
        ? `Notification not sent: ${out.push.error}`
        : `Notified ${people(out.push.sent, "device")}.`,
    );
  }

  return {
    ok: true,
    key,
    message: `The ${kindWord(item.kind)} is announced. ${parts.join(" ")}`.trim(),
  };
}
