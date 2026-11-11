import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { referralPartners } from "@/db/schema";
import { REF_COOKIE, REF_COOKIE_MAX_AGE, normaliseCode } from "@/lib/referral";

/**
 * A partner's shareable link: /r/CHIDI-4K7P, or /r/CHIDI-4K7P/rentals/2019-camry
 * to land on one car.
 *
 * Short enough to say down a phone or print on a card, which matters more than
 * it sounds — the alternative is a query string on a long URL, and the part
 * people retype is the part that gets lost.
 *
 * The visitor is sent on to the partner's own market so the prices they see
 * are in their currency. Where they land comes from a fixed list, never from
 * the link itself: a link that redirected wherever it was told could be used
 * to send people to a look-alike site under this business's name.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string; dest?: string[] }> },
) {
  const { code, dest } = await params;
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

  // An unknown or suspended code still takes the visitor where the link
  // pointed. They are a potential customer regardless of whose link they
  // followed; only the attribution is lost.
  if (!partner) {
    return NextResponse.redirect(new URL(destination("us", dest), origin));
  }

  const response = NextResponse.redirect(
    new URL(destination(partner.marketCode, dest), origin),
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

/**
 * The only places a partner link can lead.
 *
 *   /r/CODE                  → the market's home page
 *   /r/CODE/rentals          → the rentals list
 *   /r/CODE/rentals/{slug}   → one car's rental page
 *   /r/CODE/check            → the free car check (US only: it reads US
 *                              government data, so Nigeria has no such page)
 *
 * Anything else falls back to the home page. A slug is letters, digits and
 * hyphens only, so nothing in it can turn the path into another address.
 */
function destination(market: string, dest: string[] | undefined): string {
  if (!dest || dest.length === 0) return `/${market}`;
  if (dest.length === 1 && dest[0] === "check" && market === "us") return "/us/check";
  if (dest[0] === "rentals") {
    if (dest.length === 1) return `/${market}/rentals`;
    if (dest.length === 2 && /^[a-z0-9-]{1,120}$/.test(dest[1])) {
      return `/${market}/rentals/${dest[1]}`;
    }
  }
  return `/${market}`;
}
