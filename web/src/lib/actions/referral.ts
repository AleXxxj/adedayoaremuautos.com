"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { referralPartners } from "@/db/schema";
import { requireStaff, assertMarketAccess } from "@/lib/auth";
import { normaliseCode, suggestCode, CODE_RE } from "@/lib/referral";
import { siteUrl } from "@/lib/feeds/inventory";

export interface PartnerResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** Shown once, on success — the partner's own code and link. */
  code?: string;
  link?: string;
}

const joinSchema = z.object({
  marketCode: z.enum(["us", "ng"]),
  fullName: z.string().trim().min(2, "Please enter your name").max(120),
  phone: z.string().trim().min(7, "Please enter a reachable phone number").max(40),
  email: z
    .string()
    .trim()
    .email("That email does not look right")
    .optional()
    .or(z.literal("")),
  whatsapp: z.string().trim().max(40).optional(),
  website: z.string().max(0, "Rejected").optional(),
});

/**
 * Signs someone up as a referral partner.
 *
 * Active immediately rather than pending approval. A code only attributes an
 * enquiry; it never moves money on its own, and commission is paid after the
 * business has confirmed a real sale. Making people wait for an approval step
 * that adds nothing would cost referrals — and an owner can suspend a partner
 * at any time.
 *
 * No bank details are collected. Payment is arranged directly, for the same
 * reason SSN and BVN never appear on this site.
 */
export async function joinReferralProgramme(
  _prev: PartnerResult | null,
  formData: FormData,
): Promise<PartnerResult> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = joinSchema.safeParse(
    Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, v === "" && k !== "website" ? undefined : v]),
    ),
  );

  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const v = parsed.data;
  // Honeypot. Answer as though it worked so the bot learns nothing.
  if (v.website) return { ok: true, code: "PENDING" };

  // Same person, same market, signing up twice: hand back the code they
  // already have rather than minting a second one that splits their earnings
  // across two identities.
  const [existing] = await db
    .select()
    .from(referralPartners)
    .where(
      and(
        eq(referralPartners.marketCode, v.marketCode),
        eq(referralPartners.phone, v.phone),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.status !== "active") {
      return {
        ok: false,
        error:
          "This number is already registered but is not currently active. Please call us and we will sort it out.",
      };
    }
    return {
      ok: true,
      code: existing.code,
      link: `${siteUrl()}/r/${existing.code}`,
    };
  }

  // Codes are derived from the name so a partner recognises their own, which
  // means collisions are likely among common names — hence the retry.
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = suggestCode(v.fullName);
    try {
      await db.insert(referralPartners).values({
        marketCode: v.marketCode,
        code,
        fullName: v.fullName,
        phone: v.phone,
        email: v.email || null,
        whatsapp: v.whatsapp || null,
      });
      revalidatePath("/admin/referrals");
      return { ok: true, code, link: `${siteUrl()}/r/${code}` };
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      if (!message.includes("referral_partners_code_unique")) {
        console.error("[referral] signup failed", e);
        return {
          ok: false,
          error: "Something went wrong. Please try again, or call us.",
        };
      }
      // Collision — go round again with a fresh code.
    }
  }

  return {
    ok: false,
    error: "Could not allocate a referral code. Please call us and we will set one up.",
  };
}

/* ── Admin ─────────────────────────────────────────────────────────────── */

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "suspended"]).optional(),
  commissionBps: z.coerce.number().int().min(0).max(2000).optional(),
  code: z.string().trim().toUpperCase().optional(),
});

export async function updatePartner(
  _prev: PartnerResult | null,
  formData: FormData,
): Promise<PartnerResult> {
  const user = await requireStaff();
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Nothing to change." };
  const v = parsed.data;

  const [partner] = await db
    .select()
    .from(referralPartners)
    .where(eq(referralPartners.id, v.id));
  if (!partner) return { ok: false, error: "That partner no longer exists." };
  assertMarketAccess(user, partner.marketCode);

  if (v.code && !CODE_RE.test(normaliseCode(v.code))) {
    return {
      ok: false,
      fieldErrors: {
        code: ["4–20 characters, capital letters, digits and dashes only."],
      },
    };
  }

  try {
    await db
      .update(referralPartners)
      .set({
        ...(v.status ? { status: v.status } : {}),
        ...(v.commissionBps != null ? { commissionBps: v.commissionBps } : {}),
        ...(v.code ? { code: normaliseCode(v.code) } : {}),
      })
      .where(eq(referralPartners.id, v.id));
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.includes("referral_partners_code_unique")) {
      return { ok: false, fieldErrors: { code: ["That code is already taken."] } };
    }
    return { ok: false, error: "Could not save that change." };
  }

  revalidatePath("/admin/referrals");
  return { ok: true };
}
