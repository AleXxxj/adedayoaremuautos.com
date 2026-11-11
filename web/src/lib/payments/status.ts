import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rentalBookings, rentalPayments } from "@/db/schema";
import { MARKETS, type MarketCode } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";

/**
 * What a customer sees on the confirmation page after returning from checkout.
 *
 * Server-only rather than exported from the payment actions file. Every export
 * of a "use server" file is a public endpoint, so this used to answer "what is
 * the status and amount of booking X?" for anyone who sent it an id. The ids
 * are random UUIDs, so it was hard to abuse, but a data-returning lookup has no
 * business being an endpoint at all; the page that needs it calls it directly.
 */
export async function paymentStateFor(
  bookingId: string,
): Promise<{ status: string; reference: string; amount: string } | null> {
  if (!bookingId) return null;
  const [row] = await db
    .select({ b: rentalBookings })
    .from(rentalBookings)
    .where(eq(rentalBookings.id, bookingId))
    .limit(1);
  if (!row) return null;

  const cfg = MARKETS[row.b.marketCode as MarketCode];
  const [paid] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rentalPayments)
    .where(and(eq(rentalPayments.bookingId, bookingId), eq(rentalPayments.status, "paid")));

  return {
    status: (paid?.n ?? 0) > 0 ? "paid" : row.b.status,
    reference: bookingId.slice(0, 8).toUpperCase(),
    amount: formatMoney(money(row.b.totalMinor, cfg.currency), cfg.locale),
  };
}
