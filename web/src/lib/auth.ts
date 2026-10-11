import "server-only";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { staff, referralPartners } from "@/db/schema";
import { createClient } from "./supabase/server";
import type { MarketCode } from "./market";

export interface Staff {
  id: string;
  email: string;
  fullName: string | null;
  role: "owner" | "manager" | "sales";
  marketScope: MarketCode | null;
}

/**
 * The authorisation boundary. Called by every admin page and every server
 * action — not just by middleware.
 *
 * Two separate checks: Supabase must recognise the session, AND the user must
 * have a row in `staff` marked active. Signing up for a Supabase account does
 * not make someone staff; only an existing owner can grant that.
 */
export async function requireStaff(): Promise<Staff> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const [record] = await db
    .select()
    .from(staff)
    .where(eq(staff.id, user.id))
    .limit(1);

  if (!record || !record.isActive) {
    /*
     * Authenticated but not staff.
     *
     * A referral partner is exactly this: a real Supabase account with no row
     * in `staff`. Signing them out — which is what used to happen
     * unconditionally — would throw a partner out of their own dashboard for
     * the crime of following a link to /admin. So a partner is sent to their
     * own side of the site with their session intact, and only a genuine
     * nobody has the session terminated.
     */
    const [partner] = await db
      .select({ id: referralPartners.id })
      .from(referralPartners)
      .where(eq(referralPartners.userId, user.id))
      .limit(1);

    if (partner) redirect("/partner");

    // Authenticated and nothing at all. Terminate the session rather than
    // leave them in a confusing half-signed-in state.
    await supabase.auth.signOut();
    redirect("/admin/login?error=not_staff");
  }

  return {
    id: record.id,
    email: record.email,
    fullName: record.fullName,
    role: record.role,
    marketScope: record.marketScope,
  };
}

export interface PartnerSession {
  id: string;
  code: string;
  fullName: string;
  email: string | null;
  marketCode: MarketCode;
  /** The sale rate. */
  commissionBps: number;
  /** The hire rate, which is the higher of the two. */
  rentalCommissionBps: number;
}

/**
 * The authorisation boundary for the partner side.
 *
 * Deliberately the same shape as `requireStaff`, and deliberately separate
 * from it: two checks that both have to pass — Supabase must recognise the
 * session, and that user must be linked to a partner who has reached `active`.
 *
 * `status = 'active'` is what makes the agreement load-bearing on this side
 * too. An approved partner who has not accepted the terms has no account to
 * log into, and a suspended one is kept out of the dashboard while the
 * business looks into them, rather than being left able to watch the
 * commission they are no longer accruing.
 *
 * Called by the partner page and by every partner action, not just by the
 * proxy — the proxy is a redirect for the sake of the reader, not the
 * boundary.
 */
export async function requirePartner(): Promise<PartnerSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/partner/login");

  const [record] = await db
    .select()
    .from(referralPartners)
    .where(eq(referralPartners.userId, user.id))
    .limit(1);

  if (!record) {
    // A staff member who wandered here, or an account with nothing behind it.
    // The session is left alone: signing a member of staff out of the admin
    // because they opened the partner page would be its own small outage.
    redirect("/partner/login?error=not_partner");
  }

  if (record.status !== "active") {
    redirect("/partner/login?error=inactive");
  }

  return {
    id: record.id,
    code: record.code,
    fullName: record.fullName,
    email: record.email,
    marketCode: record.marketCode,
    commissionBps: record.commissionBps,
    rentalCommissionBps: record.rentalCommissionBps,
  };
}

/** Whether this staff member may act on the given market. */
export function canAccessMarket(user: Staff, market: MarketCode): boolean {
  return user.marketScope === null || user.marketScope === market;
}

/** Markets this staff member may act on. */
export function allowedMarkets(user: Staff): MarketCode[] {
  return user.marketScope ? [user.marketScope] : ["us", "ng"];
}

export function assertMarketAccess(user: Staff, market: MarketCode): void {
  if (!canAccessMarket(user, market)) {
    throw new Error(`Not permitted to modify ${market} inventory.`);
  }
}
