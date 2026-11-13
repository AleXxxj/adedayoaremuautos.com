import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { referralPartners } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * "Is an active partner logged in on this browser?" — yes or no, nothing else.
 *
 * The public pages are cached and shared, so the header can't know who is
 * looking at it when it is built. It asks here once it is on screen, and
 * swaps "Log in" for "My page" on a yes. No name, code or email is returned:
 * the answer only decides which words a button shows. The partner page
 * itself is still guarded by requirePartner.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let active = false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const [partner] = await db
        .select({ status: referralPartners.status })
        .from(referralPartners)
        .where(eq(referralPartners.userId, user.id))
        .limit(1);
      active = partner?.status === "active";
    }
  } catch {
    // Any failure reads as "not logged in": the button then says "Log in",
    // and the log-in page sorts it out.
  }
  return NextResponse.json({ active }, { headers: { "Cache-Control": "private, no-store" } });
}
