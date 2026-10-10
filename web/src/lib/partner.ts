import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { referralPartners } from "@/db/schema";

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
