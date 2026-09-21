import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { MARKET_CODES } from "@/lib/market";
import { runWeeklyDigest } from "@/lib/digest/weekly";

export const dynamic = "force-dynamic";
/** Sending to a whole list takes longer than the default allowance. */
export const maxDuration = 300;

/**
 * The scheduled weekly digest, one run per market.
 *
 * Locked to the scheduler. This endpoint emails the entire mailing list, so an
 * open URL would be a button anybody on the internet could press repeatedly —
 * and the damage from that is not a bill, it is subscribers deciding this
 * sender is a nuisance.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when that variable is set,
 * so the check is against it. If the variable is missing the route refuses
 * everything rather than falling open: an unset secret is the one case where
 * defaulting to "allow" would be silently catastrophic.
 */
function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const offered = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  // Compared without leaking length or position through timing.
  const a = Buffer.from(offered);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    // Deliberately terse: an unauthenticated caller learns nothing about
    // whether the secret is unset or merely wrong.
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const results = [];
  for (const market of MARKET_CODES) {
    try {
      results.push(await runWeeklyDigest(market));
    } catch (e) {
      console.error(`[digest] ${market} threw`, e);
      results.push({
        market,
        found: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}
