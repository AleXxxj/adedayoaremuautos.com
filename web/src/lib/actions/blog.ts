"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { newsletterSubscribers, articleComments } from "@/db/schema";
import { requireStaff } from "@/lib/auth";

export interface BlogResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** Set when an existing subscriber re-submits, so the copy can differ. */
  already?: boolean;
}

/* ── Newsletter ────────────────────────────────────────────────────────── */

const subscribeSchema = z.object({
  email: z.string().trim().toLowerCase().email("That email does not look right"),
  marketCode: z.enum(["us", "ng"]),
  source: z.string().trim().max(200).optional(),
  website: z.string().max(0, "Rejected").optional(),
});

/**
 * Records a newsletter subscription.
 *
 * The legacy form had no action attribute at all, so every address anyone
 * entered was thrown away by the browser on submit.
 *
 * Re-subscribing is not an error: it clears any previous unsubscribe and
 * reports success, because telling someone "you are already on the list" is
 * both unhelpful and leaks whether an address is on it.
 */
export async function subscribeToNewsletter(
  _prev: BlogResult | null,
  formData: FormData,
): Promise<BlogResult> {
  const parsed = subscribeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const v = parsed.data;
  if (v.website) return { ok: true };

  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;

  try {
    const [row] = await db
      .insert(newsletterSubscribers)
      .values({
        email: v.email,
        marketCode: v.marketCode,
        source: v.source ?? null,
        unsubscribeToken: randomBytes(24).toString("base64url"),
        consentIp: ip,
      })
      .onConflictDoUpdate({
        target: newsletterSubscribers.email,
        set: { unsubscribedAt: null, marketCode: v.marketCode },
      })
      .returning({ createdAt: newsletterSubscribers.createdAt });

    // A row whose createdAt predates this request was already on the list.
    const already = Date.now() - row.createdAt.getTime() > 5_000;
    return { ok: true, already };
  } catch (e) {
    console.error("[newsletter] subscribe failed", e);
    return {
      ok: false,
      error: "We could not save that just now. Please try again shortly.",
    };
  }
}

/* ── Comments ──────────────────────────────────────────────────────────── */

const commentSchema = z.object({
  articleSlug: z.string().trim().min(1).max(160),
  marketCode: z.enum(["us", "ng"]),
  name: z.string().trim().min(2, "Please enter your name").max(80),
  email: z.string().trim().email("That email does not look right").optional().or(z.literal("")),
  body: z
    .string()
    .trim()
    .min(4, "Please write a little more")
    .max(3000, "That is longer than we can accept"),
  website: z.string().max(0, "Rejected").optional(),
  renderedAt: z.coerce.number().optional(),
});

const COMMENT_MIN_FILL_MS = 3000;
const COMMENT_RATE_LIMIT = 3;
const COMMENT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Accepts a comment and holds it for moderation.
 *
 * Nothing submitted here is ever shown to the public until a member of staff
 * approves it in the admin. The legacy page displayed three invented comments
 * above a form that posted nowhere; unmoderated comments under a dealership's
 * own articles are a reputational and legal surface, not a feature to ship
 * open.
 */
export async function submitComment(
  _prev: BlogResult | null,
  formData: FormData,
): Promise<BlogResult> {
  const raw = Object.fromEntries(formData.entries());
  const cleaned = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v === "" && k !== "website" ? undefined : v]),
  );

  const parsed = commentSchema.safeParse(cleaned);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const v = parsed.data;
  if (v.website) return { ok: true };
  if (v.renderedAt && Date.now() - v.renderedAt < COMMENT_MIN_FILL_MS) {
    return { ok: true };
  }

  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;

  if (ip) {
    const since = new Date(Date.now() - COMMENT_WINDOW_MS);
    const [{ recent }] = await db
      .select({ recent: sql<number>`count(*)::int` })
      .from(articleComments)
      .where(and(eq(articleComments.authorIp, ip), gte(articleComments.createdAt, since)));
    if (recent >= COMMENT_RATE_LIMIT) {
      return {
        ok: false,
        error: "You have posted a few comments already. Please come back later.",
      };
    }
  }

  try {
    await db.insert(articleComments).values({
      articleSlug: v.articleSlug,
      marketCode: v.marketCode,
      authorName: v.name,
      authorEmail: v.email || null,
      body: v.body,
      authorIp: ip,
    });
  } catch (e) {
    console.error("[comment] insert failed", e);
    return { ok: false, error: "We could not post that just now. Please try again." };
  }

  // Deliberately no revalidatePath here. The admin list is force-dynamic and
  // re-queries on every load, so revalidating buys nothing — but it does make
  // the router refresh whichever page called the action, which remounts this
  // form and throws away the "thank you" state before anyone can read it.
  return { ok: true };
}

/** Approved comments for an article, oldest first. */
export async function approvedComments(slug: string) {
  return db
    .select({
      id: articleComments.id,
      authorName: articleComments.authorName,
      body: articleComments.body,
      createdAt: articleComments.createdAt,
    })
    .from(articleComments)
    .where(and(eq(articleComments.articleSlug, slug), eq(articleComments.status, "approved")))
    .orderBy(articleComments.createdAt);
}

/* ── Admin ─────────────────────────────────────────────────────────────── */

export async function moderateComment(
  _prev: BlogResult | null,
  formData: FormData,
): Promise<BlogResult> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "");

  if (!id || (action !== "approve" && action !== "reject")) {
    return { ok: false, error: "Nothing to do." };
  }

  await db
    .update(articleComments)
    .set({
      status: action === "approve" ? "approved" : "rejected",
      moderatedAt: new Date(),
      moderatedByEmail: user.email,
    })
    .where(eq(articleComments.id, id));

  revalidatePath("/admin/comments");
  return { ok: true };
}

export async function listCommentsForModeration() {
  return db
    .select()
    .from(articleComments)
    .orderBy(desc(articleComments.createdAt))
    .limit(200);
}
