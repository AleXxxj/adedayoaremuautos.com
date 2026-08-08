import "server-only";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { staff } from "@/db/schema";
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
    // Authenticated but not authorised. Terminate the session so they are not
    // left in a confusing half-signed-in state.
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
