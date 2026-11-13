"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, staff, saleHolds } from "@/db/schema";
import type { Staff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MIN_FILL_MS } from "@/lib/leadIntake";
import { siteUrl } from "@/lib/siteUrl";
import type { MarketCode } from "@/lib/market";
import {
  holdsTableReady,
  isUuid,
  markSaleHoldDeposit,
  releaseSaleHold,
  schemaMissing,
  startHoldCheckout,
  type StaffChange,
} from "@/lib/saleHolds/core";
import { holdReference, saleHoldEnabled } from "@/lib/saleHolds/settings";
import { holdStripe, stripeKeyMode } from "@/lib/saleHolds/stripe";

/**
 * Holding a car for sale: what a buyer's form and the admin's buttons call.
 *
 * Every export here is a public endpoint, so each one checks for itself who
 * is calling and whether the feature is on. The work is in
 * src/lib/saleHolds/core.ts.
 */

export interface HoldActionResult {
  ok: boolean;
  /** Stripe's payment page. The browser goes there. */
  url?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * Whether the caller is a signed-in, active member of staff, without the
 * redirect requireStaff does: a buyer pressing a button must not be sent to
 * the admin's sign-in page.
 */
async function signedInStaff(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const [record] = await db
      .select({ isActive: staff.isActive })
      .from(staff)
      .where(eq(staff.id, user.id))
      .limit(1);
    return Boolean(record?.isActive);
  } catch {
    return false;
  }
}

/**
 * For the car page's card, and only when Stripe is in test mode: may this
 * visitor try the checkout? True for signed-in staff, so the founder can run
 * it with Stripe's test cards. Says nothing else about anybody.
 */
export async function saleHoldStaffPreview(): Promise<boolean> {
  if (!saleHoldEnabled() || stripeKeyMode() !== "test") return false;
  return signedInStaff();
}

const startSchema = z.object({
  marketCode: z.enum(["us", "ng"]),
  slug: z.string().trim().min(1).max(160),
  name: z.string().trim().min(2, "Please enter your name").max(120),
  phone: z.string().trim().min(7, "Please enter a phone number we can reach").max(40),
  email: z.string().trim().email("That email does not look right").max(200).optional(),
  terms: z.literal("on", { message: "Please check the box to agree to the hold terms" }),
  leave_empty: z.string().optional(),
  elapsedMs: z.coerce.number().int().min(0).optional(),
});

/**
 * Sends a buyer to Stripe to pay the deposit.
 *
 * Holds nothing. The hold is made when Stripe confirms the payment (the
 * webhook), and a checkout that is closed or left unpaid holds nothing.
 */
export async function startSaleHold(
  _prev: HoldActionResult | null,
  formData: FormData,
): Promise<HoldActionResult> {
  const unavailable = "Holding a car online is not available yet. Call us and we will help.";
  if (!saleHoldEnabled()) return { ok: false, error: unavailable };

  const mode = stripeKeyMode();
  if (mode === "none") return { ok: false, error: unavailable };
  // A test key takes no real money and declines every real card, so only
  // staff, who know to use a test card, get past this.
  if (mode === "test" && !(await signedInStaff())) {
    return { ok: false, error: "Card payments are in test mode. Nothing can be charged yet." };
  }

  const cleaned = Object.fromEntries(
    [...formData.entries()].map(([k, v]) => [k, v === "" ? undefined : v]),
  );
  const parsed = startSchema.safeParse(cleaned);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }
  const v = parsed.data;

  // The same two bot checks as every public form: a hidden field only a
  // script fills in, and a form sent faster than a person can type.
  if (v.leave_empty || (v.elapsedMs !== undefined && v.elapsedMs < MIN_FILL_MS)) {
    return { ok: false, error: "We could not start the payment. Please try again." };
  }

  const result = await startHoldCheckout(
    {
      market: v.marketCode as MarketCode,
      slug: v.slug,
      name: v.name,
      phone: v.phone,
      email: v.email ?? null,
    },
    { stripe: holdStripe, baseUrl: siteUrl() },
  );
  return result.ok ? { ok: true, url: result.url } : { ok: false, error: result.error };
}

/* ── Admin ─────────────────────────────────────────────────────────────── */

const HOLDS = "/admin/holds";

/** The staff member, allowed to act on this hold's market. */
async function staffFor(id: string): Promise<Staff | string> {
  // Loaded here, not at the top: the auth module pulls in the admin's
  // navigation, which the test suite (which calls startSaleHold with the
  // switch off) cannot load outside Next.
  const { requireSection, assertMarketAccess } = await import("@/lib/auth");
  const user = await requireSection(HOLDS);
  if (!isUuid(id)) return "Hold not found.";
  if (!(await holdsTableReady())) return "Holds are not set up yet.";
  try {
    const [row] = await db
      .select({ marketCode: saleHolds.marketCode })
      .from(saleHolds)
      .where(eq(saleHolds.id, id))
      .limit(1);
    if (!row) return "Hold not found.";
    assertMarketAccess(user, row.marketCode);
  } catch (e) {
    if (schemaMissing(e)) return "Holds are not set up yet.";
    throw e;
  }
  return user;
}

async function finish(user: Staff, action: string, change: StaffChange): Promise<HoldActionResult> {
  if (!change.ok || !change.hold) return { ok: false, error: change.error };
  await db.insert(auditLog).values({
    actorId: user.id,
    actorEmail: user.email,
    entity: "sale_hold",
    entityId: change.hold.id,
    action,
    diff: {
      reference: holdReference(change.hold.id),
      status: change.hold.status,
      deposit: change.hold.depositState,
    } as never,
  });
  revalidatePath(HOLDS);
  revalidatePath("/admin/vehicles");
  // The car may have gone back on sale, or stopped being "pending".
  revalidatePath("/[market]/inventory/[slug]", "page");
  revalidatePath("/[market]/inventory", "page");
  return { ok: true };
}

/** "Release hold": ends it now and puts the car back on sale. */
export async function releaseHold(
  _prev: HoldActionResult | null,
  formData: FormData,
): Promise<HoldActionResult> {
  const id = String(formData.get("id") ?? "");
  const user = await staffFor(id);
  if (typeof user === "string") return { ok: false, error: user };
  return finish(user, "release", await releaseSaleHold(id, user.id));
}

/**
 * "Mark deposit refunded", "Applied to sale", and "Undo".
 *
 * A record of what the staff member did in Stripe. This does not refund
 * anything: the app never moves money.
 */
export async function markHoldDeposit(
  _prev: HoldActionResult | null,
  formData: FormData,
): Promise<HoldActionResult> {
  const id = String(formData.get("id") ?? "");
  const to = String(formData.get("to") ?? "");
  if (to !== "refunded" && to !== "applied" && to !== "held") {
    return { ok: false, error: "Unknown change." };
  }
  const user = await staffFor(id);
  if (typeof user === "string") return { ok: false, error: user };
  return finish(user, `deposit_${to}`, await markSaleHoldDeposit(id, to, user.id));
}
