"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { referralPartners } from "@/db/schema";
import { requireStaff, assertMarketAccess } from "@/lib/auth";
import {
  normaliseCode,
  suggestCode,
  CODE_RE,
  formatBps,
  referralLink,
  agreementLink,
  accountSetupLink,
} from "@/lib/referral";
import { partnerByAgreementToken } from "@/lib/partner";
import { PARTNER_TERMS_VERSION } from "@/content/partnerTerms";
import { siteUrl } from "@/lib/feeds/inventory";
import {
  sendApplicationReceived,
  notifyStaffOfApplication,
  sendAgreementToSign,
  sendApplicationDeclined,
  sendPartnerWelcome,
} from "@/lib/mail/referral";

export interface PartnerResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** Shown once, on success — the partner's own code and link. */
  code?: string;
  link?: string;
  /** The application is in, awaiting a decision. */
  pending?: boolean;
}

const joinSchema = z.object({
  marketCode: z.enum(["us", "ng"], { message: "Choose a market" }),
  fullName: z.string().trim().min(2, "Please enter your name").max(120),
  phone: z.string().trim().min(7, "Please enter a reachable phone number").max(40),
  /**
   * Required now, where it used to be optional.
   *
   * Every step after this one is an email: the acknowledgement, the decision,
   * the agreement to sign, the link to create an account. An application with
   * no address cannot be answered, so asking for it is kinder than accepting
   * it and going quiet.
   */
  email: z.string().trim().email("We need an email address to reply to"),
  whatsapp: z.string().trim().max(40).optional(),
  businessName: z.string().trim().max(160).optional(),
  city: z.string().trim().max(120).optional(),
  /** Their case, in their own words. The part a human actually reads. */
  proposal: z
    .string()
    .trim()
    .min(20, "Tell us a little about how you plan to refer customers")
    .max(2000),
  applicantSite: z.string().trim().max(200).optional(),
  website: z.string().max(0, "Rejected").optional(),
  renderedAt: z.coerce.number().optional(),
});

/**
 * Applies to become a referral partner.
 *
 * This used to make people active immediately, and that was right while a
 * code only tagged an enquiry: it moved no money, so an approval step would
 * have cost referrals and bought nothing.
 *
 * Commission changes it. A partner who will be owed money is someone the
 * business has agreed terms with, so an application is now reviewed by a
 * person. The code is minted here but stays inert until the status reaches
 * active — an approved partner who has not signed the agreement must not be
 * able to earn, or the agreement is decorative.
 *
 * Still no bank details. Payout arrangements come later and go through the
 * payment provider, for the same reason SSN and BVN never appear on this site.
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
  // Honeypot, and a submission faster than a person can read the form.
  // Answered as though it worked so a bot learns nothing.
  if (v.website) return { ok: true, code: "PENDING" };
  if (v.renderedAt && Date.now() - v.renderedAt < 2000) return { ok: true, code: "PENDING" };

  // Same person applying twice. What they are told depends on where their
  // first application got to, because "we already have you" is useless when
  // what they want to know is whether they were accepted.
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
    if (existing.status === "active") {
      return { ok: true, code: existing.code, link: `${siteUrl()}/r/${existing.code}` };
    }
    if (existing.status === "pending") {
      return {
        ok: false,
        error: "We already have your application and are reviewing it. We will email you.",
      };
    }
    if (existing.status === "approved") {
      return {
        ok: false,
        error:
          "You have been approved — check your email for the agreement. Call us if it has not arrived.",
      };
    }
    return {
      ok: false,
      error: "This number is already registered. Please call us and we will sort it out.",
    };
  }

  // Codes are derived from the name so a partner recognises their own, which
  // makes collisions likely among common names — hence the retry.
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = suggestCode(v.fullName);
    try {
      const [row] = await db
        .insert(referralPartners)
        .values({
          marketCode: v.marketCode,
          code,
          fullName: v.fullName,
          phone: v.phone,
          email: v.email,
          whatsapp: v.whatsapp || null,
          businessName: v.businessName || null,
          city: v.city || null,
          proposal: v.proposal,
          website: v.applicantSite || null,
          // Inert until reviewed. The code exists so it can be reserved and
          // shown on the decision, but it attributes nothing yet.
          status: "pending",
          appliedAt: new Date(),
        })
        .returning({ id: referralPartners.id });

      // Both are courtesies and neither may fail the application: it is
      // already recorded and visible in the admin whatever the mail does.
      void sendApplicationReceived({
        to: v.email,
        name: v.fullName,
      }).catch((e) => console.error("[referral] applicant email failed", e));

      void notifyStaffOfApplication({
        id: row.id,
        name: v.fullName,
        market: v.marketCode,
        phone: v.phone,
        email: v.email,
        proposal: v.proposal,
      }).catch((e) => console.error("[referral] staff alert failed", e));

      revalidatePath("/admin/referrals");
      return { ok: true, pending: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      if (!message.includes("referral_partners_code_unique")) {
        console.error("[referral] application failed", e);
        return { ok: false, error: "Something went wrong. Please try again, or call us." };
      }
      // Collision — go round again with a fresh code.
    }
  }

  return {
    ok: false,
    error: "Could not record your application. Please call us and we will set it up.",
  };
}

/* ── Review ────────────────────────────────────────────────────────────── */

const reviewSchema = z.object({
  id: z.string().uuid(),
  /** The sale rate. */
  commissionBps: z.coerce.number().int().min(0).max(2000).optional(),
  /** The hire rate, which is normally the higher of the two. */
  rentalCommissionBps: z.coerce.number().int().min(0).max(2000).optional(),
});

/**
 * Takes an application forward.
 *
 * Approval is not activation. It mints the agreement token and emails it, and
 * the status stops at `approved` — the code stays inert until the partner has
 * accepted the terms, because a partner earning commission under an agreement
 * they never saw is the one outcome this whole flow exists to prevent.
 *
 * Idempotent on purpose: pressing Approve twice re-sends the agreement with a
 * fresh token rather than erroring, since "did they get it?" is the question
 * the owner will actually be asking.
 */
export async function approvePartner(
  _prev: PartnerResult | null,
  formData: FormData,
): Promise<PartnerResult> {
  const user = await requireStaff();
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Could not read that request." };

  const [partner] = await db
    .select()
    .from(referralPartners)
    .where(eq(referralPartners.id, parsed.data.id));
  if (!partner) return { ok: false, error: "That application no longer exists." };
  assertMarketAccess(user, partner.marketCode);

  /*
   * Active is not the same as agreed.
   *
   * Partners registered before the agreement existed were left active on
   * purpose — re-reviewing them would have switched off codes already in
   * circulation — which means they are live, earning, and have signed
   * nothing. Refusing to send them an agreement because they are already
   * active, as this did, is the one case where the check was simply wrong:
   * it blocked the only route to fixing the thing that matters.
   */
  if (partner.status === "active" && partner.agreedAt) {
    return { ok: false, error: "They have already accepted — nothing to approve." };
  }
  if (!partner.email) {
    // The agreement is only deliverable by email, so there is nothing useful
    // this can do. Said plainly rather than failing silently.
    return {
      ok: false,
      error: "No email address on this application. Add one before approving.",
    };
  }

  const token = randomBytes(24).toString("base64url");
  const saleBps = parsed.data.commissionBps ?? partner.commissionBps;
  const hireBps =
    parsed.data.rentalCommissionBps ?? partner.rentalCommissionBps;

  /*
   * A partner who is already live stays live while they read it.
   *
   * Dropping them back to `approved` would switch off a code that is in
   * circulation — on business cards, in WhatsApp threads — and silently stop
   * attributing their referrals until they happened to open an email. The
   * agreement is what their future commission rests on, not their ability to
   * keep working in the meantime.
   */
  const keepActive = partner.status === "active";

  await db
    .update(referralPartners)
    .set({
      status: keepActive ? "active" : "approved",
      commissionBps: saleBps,
      rentalCommissionBps: hireBps,
      reviewedAt: new Date(),
      reviewedByEmail: user.email,
      declineReason: null,
      agreementToken: token,
      agreementSentAt: new Date(),
      agreementVersion: PARTNER_TERMS_VERSION,
      // A re-approval after a decline starts the agreement over. An already
      // signed one is never cleared here — only a decline or a fresh
      // application reaches this line with agreedAt set.
      agreedAt: null,
      agreementDeclinedAt: null,
    })
    .where(eq(referralPartners.id, partner.id));

  await sendAgreementToSign({
    to: partner.email,
    name: partner.fullName,
    link: agreementLink(siteUrl(), token),
    hireRate: formatBps(hireBps),
    saleRate: formatBps(saleBps),
  });

  revalidatePath("/admin/referrals");
  return { ok: true, error: undefined };
}

const declineSchema = reviewSchema.extend({
  reason: z.string().trim().max(1000).optional(),
});

/**
 * Turns an application down, and says so.
 *
 * The email is the point. Everyone who applies has been told to expect an
 * answer within one working day, and a decline that is never sent is how an
 * applicant ends up phoning the showroom to ask.
 */
export async function declinePartner(
  _prev: PartnerResult | null,
  formData: FormData,
): Promise<PartnerResult> {
  const user = await requireStaff();
  const parsed = declineSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Could not read that request." };

  const [partner] = await db
    .select()
    .from(referralPartners)
    .where(eq(referralPartners.id, parsed.data.id));
  if (!partner) return { ok: false, error: "That application no longer exists." };
  assertMarketAccess(user, partner.marketCode);

  await db
    .update(referralPartners)
    .set({
      status: "declined",
      reviewedAt: new Date(),
      reviewedByEmail: user.email,
      declineReason: parsed.data.reason || null,
      // Any agreement link already sent stops working.
      agreementToken: null,
    })
    .where(eq(referralPartners.id, partner.id));

  if (partner.email) {
    await sendApplicationDeclined({
      to: partner.email,
      name: partner.fullName,
      reason: parsed.data.reason,
    });
  }

  revalidatePath("/admin/referrals");
  return { ok: true };
}

/* ── The agreement ─────────────────────────────────────────────────────── */

export interface AgreementResult {
  ok: boolean;
  error?: string;
  /** Accepted: the code is live and the account link is in the welcome email. */
  accepted?: boolean;
  declined?: boolean;
  accountLink?: string;
  code?: string;
}

/**
 * The partner accepts.
 *
 * This is the only place a partner becomes `active`, which is what makes the
 * agreement load-bearing rather than decorative: every attribution point
 * filters on that status, so until this runs their code tags nothing.
 *
 * What is recorded is version, time and address. If a commission is ever
 * disputed the question is which wording they agreed to and when, and a bare
 * `agreed boolean` cannot answer it.
 */
export async function acceptAgreement(
  _prev: AgreementResult | null,
  formData: FormData,
): Promise<AgreementResult> {
  const token = String(formData.get("token") ?? "");
  const partner = await partnerByAgreementToken(token);
  if (!partner) {
    return { ok: false, error: "This link is no longer valid. Please contact us." };
  }
  if (partner.status === "declined" || partner.status === "suspended") {
    return { ok: false, error: "This agreement is closed. Please contact us." };
  }

  // A second click on a page left open. Answered as the success it already is,
  // rather than as an error that makes the partner think it failed.
  if (partner.status === "active" && partner.agreedAt) {
    return {
      ok: true,
      accepted: true,
      code: partner.code,
      accountLink: accountSetupLink(siteUrl(), token),
    };
  }

  // Taken from the proxy header rather than the socket: every request here
  // arrives through Vercel's edge. Recorded for evidence, never displayed.
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;

  await db
    .update(referralPartners)
    .set({
      status: "active",
      agreedAt: new Date(),
      agreementVersion: partner.agreementVersion ?? PARTNER_TERMS_VERSION,
      agreementIp: ip,
      agreementDeclinedAt: null,
    })
    .where(eq(referralPartners.id, partner.id));

  const base = siteUrl();
  const accountLink = accountSetupLink(base, token);

  if (partner.email) {
    // Fire-and-forget: the agreement is accepted and their code is live
    // whatever the mail does, and failing the acceptance over a mail server
    // would be the worse outcome by far.
    void sendPartnerWelcome({
      to: partner.email,
      name: partner.fullName,
      code: partner.code,
      link: referralLink(base, partner.code),
      accountLink,
      hireRate: formatBps(partner.rentalCommissionBps),
      saleRate: formatBps(partner.commissionBps),
    }).catch((e) => console.error("[referral] welcome email failed", e));
  }

  revalidatePath("/admin/referrals");
  return { ok: true, accepted: true, code: partner.code, accountLink };
}

/**
 * The partner declines.
 *
 * Recorded rather than ignored, so the owner is not left chasing someone who
 * has already said no.
 *
 * The token is deliberately kept. Clearing it was the first instinct — a
 * declined link should stop working — and it produced exactly the wrong
 * screen: every server action re-renders the page it was called from, the
 * lookup then found nothing, and somebody who had just declined was told
 * their link was not valid. It reads as a failure of the thing they had in
 * fact just done successfully.
 *
 * Nothing is lost by keeping it. The token only ever identifies this one
 * applicant, and `acceptAgreement` refuses a declined row, so the link that
 * still resolves can show them what they chose and cannot be used to undo it.
 */
export async function declineAgreement(
  _prev: AgreementResult | null,
  formData: FormData,
): Promise<AgreementResult> {
  const token = String(formData.get("token") ?? "");
  const partner = await partnerByAgreementToken(token);
  if (!partner) {
    return { ok: false, error: "This link is no longer valid." };
  }
  // Again: active without `agreedAt` is a partner who never signed, and they
  // are entitled to decline now that they have finally been shown the terms.
  if (partner.status === "active" && partner.agreedAt) {
    return {
      ok: false,
      error: "You have already accepted this agreement. Call us if you want to end it.",
    };
  }

  await db
    .update(referralPartners)
    .set({
      status: "declined",
      agreementDeclinedAt: new Date(),
      declineReason: "Declined by the applicant",
    })
    .where(eq(referralPartners.id, partner.id));

  revalidatePath("/admin/referrals");
  return { ok: true, declined: true };
}

/* ── Admin ─────────────────────────────────────────────────────────────── */

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "suspended"]).optional(),
  commissionBps: z.coerce.number().int().min(0).max(2000).optional(),
  rentalCommissionBps: z.coerce.number().int().min(0).max(2000).optional(),
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
        ...(v.rentalCommissionBps != null
          ? { rentalCommissionBps: v.rentalCommissionBps }
          : {}),
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
