import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { referralPartners } from "@/db/schema";
import { REF_COOKIE, REF_COOKIE_MAX_AGE, normaliseCode } from "@/lib/referral";

/**
 * A partner's shareable link: /r/CHIDI-4K7P
 *
 * Short enough to say down a phone or print on a card, which matters more than
 * it sounds — the alternative is a query string on a long URL, and the part
 * people retype is the part that gets lost.
 *
 * The visitor is sent on to the partner's own market so the prices they see
 * are in their currency.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const normalised = normaliseCode(decodeURIComponent(code));
  const { origin } = request.nextUrl;

  const [partner] = await db
    .select({
      code: referralPartners.code,
      marketCode: referralPartners.marketCode,
    })
    .from(referralPartners)
    .where(
      and(
        eq(referralPartners.code, normalised),
        eq(referralPartners.status, "active"),
      ),
    )
    .limit(1);

  // An unknown or suspended code still lands the visitor on the site rather
  // than a 404. They are a potential customer regardless of whose link they
  // followed; only the attribution is lost.
  if (!partner) {
    return NextResponse.redirect(new URL("/us", origin));
  }

  const response = NextResponse.redirect(
    new URL(`/${partner.marketCode}`, origin),
  );

  // First touch wins: if a code is already held, it is not overwritten. The
  // partner who introduced someone to the dealership is the one who earned
  // it, and a later link — often the buyer idly clicking a friend's post —
  // should not take the commission from them.
  if (!request.cookies.get(REF_COOKIE)) {
    response.cookies.set(REF_COOKIE, partner.code, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: REF_COOKIE_MAX_AGE,
      path: "/",
    });
  }

  return response;
}
