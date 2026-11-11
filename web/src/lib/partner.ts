import "server-only";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { referralPartners, rentalBookings, rentalPayments } from "@/db/schema";
import { REF_COOKIE, normaliseCode } from "@/lib/referral";
import { phoneDigitsKey, phoneKeySql } from "@/lib/phoneKey";
import { keepsRenters } from "@/content/partnerTerms";
import type { MarketCode } from "@/lib/market";

/**
 * The partner a renter belongs to, for a new rental booking.
 *
 * A partner earns on every rental their renter makes, week after week, not
 * only the first (partner terms, clause 2). The link's cookie lasts 90 days
 * in one browser, so a weekly driver who rebooks from another device, or
 * after three months, would otherwise stop earning their partner anything.
 *
 * So the renter's own history decides first, matched on the phone number's
 * digits in this market:
 *
 * - Only bookings that became rentals count: the car went out, or the
 *   booking was confirmed and paid for. A reservation nobody came for, or a
 *   cancelled one, claims no one. The phone number on a request is whatever
 *   was typed, so otherwise a request made with someone else's number would
 *   claim that person for good.
 * - The first of those decides. If the renter first rented with us directly,
 *   they are the business's own customer (clause 5) and no later link makes
 *   them a partner's. If a partner brought them, that partner keeps them —
 *   "the earlier record stands" — while the partner is active and has
 *   accepted the terms that say so. A partner still on v1 agreed to the
 *   90-day link and nothing longer, so for them the link decides, as before.
 * - A renter with no rental yet goes to the link they arrived through.
 *
 * And never a partner's own rental: a booking under the partner's own phone
 * or WhatsApp number earns no one anything (clause 5).
 *
 * Bookings keep their own partner id once written, so a partner who is later
 * suspended keeps what was already credited but is not given new rentals.
 */
export async function referralPartnerForRenter(
  market: MarketCode,
  phone: string,
  // For scripts/verify-referrals.mts: the history lookup against a throwaway
  // Postgres, and a stand-in for the link cookie, which only exists inside a
  // real request.
  test?: { database: typeof db; linkPartner: string | null },
): Promise<string | null> {
  const database = test?.database ?? db;
  const key = phoneDigitsKey(phone);
  const fromLink = () =>
    test ? Promise.resolve(test.linkPartner) : resolveReferralPartner(market);

  const first = key ? await firstRental(database, market, key) : null;
  let partnerId: string | null;
  if (!first) {
    partnerId = await fromLink();
  } else if (!first.partnerId || first.partnerStatus !== "active") {
    // The business's own customer, or a suspended partner's: nobody else's.
    return null;
  } else if (keepsRenters(first.agreementVersion)) {
    partnerId = first.partnerId;
  } else {
    partnerId = await fromLink();
  }

  if (partnerId && key && (await isPartnersOwnNumber(database, partnerId, key))) return null;
  return partnerId;
}

/** The renter's first booking that became a rental, referred or not. */
async function firstRental(database: typeof db, market: MarketCode, key: string) {
  const [row] = await database
    .select({
      partnerId: rentalBookings.referralPartnerId,
      partnerStatus: referralPartners.status,
      agreementVersion: referralPartners.agreementVersion,
    })
    .from(rentalBookings)
    .leftJoin(referralPartners, eq(referralPartners.id, rentalBookings.referralPartnerId))
    .where(
      and(
        eq(rentalBookings.marketCode, market),
        sql`${phoneKeySql(rentalBookings.customerPhone)} = ${key}`,
        or(
          inArray(rentalBookings.status, ["active", "returned"]),
          and(
            eq(rentalBookings.status, "confirmed"),
            sql`exists (select 1 from ${rentalPayments} where ${rentalPayments.bookingId} = ${rentalBookings.id} and ${rentalPayments.status} = 'paid')`,
          ),
        ),
      ),
    )
    .orderBy(asc(rentalBookings.createdAt))
    .limit(1);
  return row ?? null;
}

async function isPartnersOwnNumber(
  database: typeof db,
  partnerId: string,
  key: string,
): Promise<boolean> {
  const [p] = await database
    .select({ phone: referralPartners.phone, whatsapp: referralPartners.whatsapp })
    .from(referralPartners)
    .where(eq(referralPartners.id, partnerId))
    .limit(1);
  return !!p && [p.phone, p.whatsapp].some((n) => !!n && phoneDigitsKey(n) === key);
}

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
