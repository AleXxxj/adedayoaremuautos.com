import type { Metadata } from "next";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  partnerEarnings,
  partnerPayouts,
  leads,
  rentalBookings,
  deals,
  vehicles,
} from "@/db/schema";
import { requirePartner } from "@/lib/auth";
import { partnerTotals } from "@/lib/partnerEarnings";
import { MARKETS } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import {
  formatBps,
  referralLink,
  rentalReferralLink,
  rentalShareMessage,
  commissionOn,
  governingLaw,
  saleCommissionsOn,
  PAID_REFERRAL_DISCLOSURE,
} from "@/lib/referral";
import { siteUrl } from "@/lib/feeds/inventory";
import { listFleet } from "@/lib/repositories/rentals";
import { listLocations } from "@/lib/repositories/locations";
import { numberedPartnerClauses, PARTNER_TERMS_VERSION } from "@/content/partnerTerms";
import { DashboardView } from "@/components/partner/DashboardView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Partner dashboard",
  robots: { index: false, follow: false },
};

/**
 * What a partner came here to see.
 *
 * The homepage has advertised "track your referrals easily" since the original
 * build with nothing at all behind it, so the bar is not high — but the thing
 * a partner actually wants is a short list: what have I earned, what can I
 * ask for, and how do I share. Those come first (components/partner/
 * DashboardView.tsx lays the page out; this file only gathers it).
 *
 * Every figure comes from the earnings rows rather than being recomputed from
 * current rates, so what this page says a partner earned last month is what
 * they were actually told at the time.
 *
 * Live stock is here because it is the thing a partner needs in order to do
 * the job: somebody being asked "what have you got?" on the phone should not
 * have to browse the public site and guess what has sold.
 */
export default async function PartnerDashboard() {
  const partner = await requirePartner();
  const market = MARKETS[partner.marketCode];
  const fmt = (minor: number) =>
    formatMoney(money(minor, market.currency), market.locale);
  const day = (d: Date) =>
    d.toLocaleDateString(market.locale, { day: "numeric", month: "short", year: "numeric" });

  const [totals, earned, earnings, payouts, introduced, bookings, sales, fleet, sites] =
    await Promise.all([
      partnerTotals(partner.id),

      /*
       * Everything earned so far: commissions on finished rentals, paid out
       * or not. "Earned" as the agreement uses it (clause 3) — money cleared
       * and the rental completed — so a rental still running ("Still to
       * come") and anything canceled are not in it.
       */
      db
        .select({
          minor: sql<number>`coalesce(sum(${partnerEarnings.amountMinor}) filter (where ${partnerEarnings.state} in ('confirmed','paid')), 0)::bigint`,
        })
        .from(partnerEarnings)
        .where(eq(partnerEarnings.partnerId, partner.id)),

      db
        .select()
        .from(partnerEarnings)
        .where(eq(partnerEarnings.partnerId, partner.id))
        .orderBy(desc(partnerEarnings.createdAt))
        .limit(50),

      db
        .select()
        .from(partnerPayouts)
        .where(eq(partnerPayouts.partnerId, partner.id))
        .orderBy(desc(partnerPayouts.requestedAt))
        .limit(20),

      /*
       * Enquiries introduced.
       *
       * Deliberately counts and statuses only — no customer names, no phone
       * numbers, no email addresses. The partner introduced these people to
       * the dealership; that does not make the dealership's customer list
       * theirs to read, and the agreement they signed says as much.
       */
      db
        .select({
          total: sql<number>`count(*)::int`,
          open: sql<number>`count(*) filter (where ${leads.status} in ('new','contacted','qualified'))::int`,
          won: sql<number>`count(*) filter (where ${leads.status} = 'won')::int`,
        })
        .from(leads)
        .where(eq(leads.referralPartnerId, partner.id)),

      db
        .select({
          id: rentalBookings.id,
          status: rentalBookings.status,
          totalMinor: rentalBookings.totalMinor,
          currency: rentalBookings.currency,
          createdAt: rentalBookings.createdAt,
          make: vehicles.make,
          model: vehicles.model,
          year: vehicles.year,
        })
        .from(rentalBookings)
        .leftJoin(vehicles, eq(rentalBookings.vehicleId, vehicles.id))
        .where(eq(rentalBookings.referralPartnerId, partner.id))
        .orderBy(desc(rentalBookings.createdAt))
        .limit(25),

      db
        .select({
          id: deals.id,
          status: deals.status,
          priceMinor: deals.vehiclePriceMinor,
          createdAt: deals.createdAt,
        })
        .from(deals)
        .leftJoin(leads, eq(deals.leadId, leads.id))
        .where(eq(leads.referralPartnerId, partner.id))
        .orderBy(desc(deals.createdAt))
        .limit(25),

      // The cars a partner can actually send someone to rent, with rates.
      listFleet(partner.marketCode),
      listLocations(partner.marketCode),
    ]);

  const counts = introduced[0] ?? { total: 0, open: 0, won: 0 };
  const base = siteUrl();
  const link = referralLink(base, partner.code);
  const site = sites[0];
  const place = site ? [site.city, site.region].filter(Boolean).join(", ") : market.name;

  return (
    <DashboardView
      partner={{
        name: partner.fullName,
        code: partner.code,
        rentalRate: formatBps(partner.rentalCommissionBps),
        saleRate: saleCommissionsOn(partner.marketCode)
          ? formatBps(partner.commissionBps)
          : null,
        market: market.name,
        home: `/${partner.marketCode}`,
      }}
      termsUpdate={
        partner.agreementVersion !== PARTNER_TERMS_VERSION
          ? numberedPartnerClauses(governingLaw(partner.marketCode))
          : null
      }
      share={{
        link,
        // What the Share button sends with the plain link: who it is from
        // and where, the link, and the line saying the partner is paid —
        // the same line every car's message carries.
        message: `Rent a car from Adedayo Aremu Autos in ${place}: ${link}\n\n${PAID_REFERRAL_DISCLOSURE}`,
      }}
      money={{
        earned: fmt(Number(earned[0]?.minor ?? 0)),
        available: fmt(totals.availableMinor),
        availableMinor: totals.availableMinor,
        pending: fmt(totals.pendingMinor),
        requested: fmt(totals.requestedMinor),
        requestedMinor: totals.requestedMinor,
        paid: fmt(totals.paidMinor),
        currencySymbol: market.currency === "USD" ? "$" : "₦",
      }}
      /*
       * Each car with its share message and what one rental earns.
       *
       * By the week where the car has a weekly rate — that is how the renters
       * worth referring rent, and how the partner keeps earning — and by the day
       * otherwise. The math, never a promise of income: what one week (or day)
       * of this car pays them, at their own rate.
       */
      cars={fleet.map((v) => {
        const car = [v.year, v.make, v.model].filter(Boolean).join(" ");
        const weekly = v.tariff.weeklyMinor;
        const unitMinor = weekly ?? v.tariff.dailyMinor;
        const unit = weekly != null ? "week" : "day";
        const price = `${fmt(unitMinor)} a ${unit}`;
        return {
          id: v.id,
          car,
          image: v.image,
          price,
          earn: fmt(commissionOn(unitMinor, partner.rentalCommissionBps)),
          unit,
          message: rentalShareMessage(car, price, place, rentalReferralLink(base, partner.code, v.slug)),
        };
      })}
      inquiries={counts}
      rentals={bookings.map((b) => ({
        id: b.id,
        car: [b.year, b.make, b.model].filter(Boolean).join(" ") || "Car rental",
        amount: formatMoney(money(b.totalMinor, b.currency), market.locale),
        status: b.status,
        date: day(b.createdAt),
      }))}
      sales={sales.map((d) => ({
        id: d.id,
        amount: fmt(Number(d.priceMinor ?? 0)),
        status: d.status,
        date: day(d.createdAt),
      }))}
      earnings={earnings.map((e) => ({
        id: e.id,
        title: e.source === "rental" ? "Car rental" : "Vehicle sale",
        basis: `${formatBps(e.commissionBps)} of ${formatMoney(money(e.basisMinor, e.currency), market.locale)}`,
        amount: formatMoney(money(e.amountMinor, e.currency), market.locale),
        state: e.state,
        date: day(e.createdAt),
        note: e.note,
      }))}
      payouts={payouts.map((p) => ({
        id: p.id,
        amount: formatMoney(money(p.amountMinor, p.currency), market.locale),
        state: p.state,
        date: day(p.requestedAt),
        reference: p.reference,
        rejectReason: p.rejectReason,
      }))}
    />
  );
}
