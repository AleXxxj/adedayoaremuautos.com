import "server-only";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { referralPartners } from "@/db/schema";
import { REF_COOKIE, normaliseCode } from "@/lib/referral";
import type { MarketCode } from "@/lib/market";

/**
 * The partner whose link brought this visitor, if any.
 *
 * Shared by leads and rental bookings, which is the whole reason it lives
 * here: it was a private helper inside the leads action, so a customer who
 * followed a partner's link and hired a car for a week was credited to
 * nobody — the attribution existed for enquiries and not for the one thing
 * that actually takes payment.
 *
 * `status = 'active'` is load-bearing. A pending application and an approved
 * partner who has not accepted the agreement both have a code; neither may
 * attribute anything, or the agreement is decorative and an applicant can
 * earn before anyone has agreed terms with them.
 *
 * Market-scoped, because codes are market-scoped: a Lagos partner's code must
 * not quietly claim a Greensboro booking.
 */
export async function resolveReferralPartner(
  market: MarketCode,
): Promise<string | null> {
  const raw = (await cookies()).get(REF_COOKIE)?.value;
  if (!raw) return null;

  const [partner] = await db
    .select({ id: referralPartners.id })
    .from(referralPartners)
    .where(
      and(
        eq(referralPartners.code, normaliseCode(raw)),
        eq(referralPartners.marketCode, market),
        eq(referralPartners.status, "active"),
      ),
    )
    .limit(1);

  return partner?.id ?? null;
}

/**
 * Looks up whoever is holding an agreement link.
 *
 * Deliberately not a server action. It returns the whole partner row — name,
 * phone, email, the proposal they wrote — and a server action is an endpoint
 * anyone can call with any argument. Keeping it server-only means the row is
 * read while rendering the page the token unlocks and nowhere else.
 *
 * The token is matched exactly and nothing else is accepted as an identifier.
 * The shape check in front of the query is the same guard the invitation route
 * carries, for the same reason: a token short of full length was cut in
 * transit and is worth saying so about, rather than passing a fragment to the
 * database and reporting "not valid".
 */
export async function partnerByAgreementToken(token: string) {
  if (!token || token.length < 20 || /[^A-Za-z0-9_-]/.test(token)) return null;

  const [row] = await db
    .select()
    .from(referralPartners)
    .where(eq(referralPartners.agreementToken, token))
    .limit(1);

  return row ?? null;
}
