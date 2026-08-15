import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { referralPartners, leads, deals } from "@/db/schema";
import { requireStaff, allowedMarkets } from "@/lib/auth";
import { assertSection } from "@/lib/adminNav";
import { AdminChrome } from "../layout";
import { MARKETS } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import { commissionOn } from "@/lib/referral";
import { siteUrl } from "@/lib/feeds/inventory";
import { PartnerRow } from "@/components/admin/PartnerRow";

export const dynamic = "force-dynamic";

/**
 * Referral partners and what they are owed.
 *
 * The counts are the point. "Track your referrals easily" was advertised on
 * the homepage for years with nothing behind it, so commission could only be
 * settled from memory and whoever argued hardest. Enquiries and completed
 * sales are both shown because a partner sending traffic that never converts
 * is a different conversation from one who is genuinely owed money.
 */
export default async function AdminReferralsPage() {
  const user = await requireStaff();
  assertSection(user.role, "/admin/referrals");
  const markets = allowedMarkets(user);

  const partners = await db
    .select()
    .from(referralPartners)
    .where(inArray(referralPartners.marketCode, markets))
    .orderBy(desc(referralPartners.createdAt));

  const ids = partners.map((p) => p.id);

  // Enquiries introduced, per partner.
  const leadCounts = ids.length
    ? await db
        .select({
          partnerId: leads.referralPartnerId,
          total: sql<number>`count(*)::int`,
        })
        .from(leads)
        .where(inArray(leads.referralPartnerId, ids))
        .groupBy(leads.referralPartnerId)
    : [];

  // Completed sales, and what they were worth. Joined through the lead rather
  // than read from deals.referral_partner_id alone, so deals created before a
  // partner id was ever stamped on them still count.
  const sales = ids.length
    ? await db
        .select({
          partnerId: leads.referralPartnerId,
          closed: sql<number>`count(*) filter (where ${deals.status} = 'delivered')::int`,
          soldMinor: sql<number>`coalesce(sum(${deals.vehiclePriceMinor}) filter (where ${deals.status} = 'delivered'), 0)::bigint`,
        })
        .from(deals)
        .innerJoin(leads, eq(deals.leadId, leads.id))
        .where(inArray(leads.referralPartnerId, ids))
        .groupBy(leads.referralPartnerId)
    : [];

  const leadsBy = new Map(leadCounts.map((r) => [r.partnerId, r.total]));
  const salesBy = new Map(sales.map((r) => [r.partnerId, r]));
  const base = siteUrl();

  const active = partners.filter((p) => p.status === "active").length;

  return (
    <AdminChrome email={user.email} role={user.role}>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Referral partners</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {partners.length} registered
            {partners.length > 0 && ` · ${active} active`}
          </p>
        </div>

        {partners.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] px-6 py-16 text-center">
            <p className="font-medium">Nobody has signed up yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">
              The referral panels on the homepage now lead to a real signup
              form. Anyone who joins gets a link, and enquiries that arrive
              through it appear here against their name.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {partners.map((p) => {
              const m = MARKETS[p.marketCode];
              const sale = salesBy.get(p.id);
              const soldMinor = Number(sale?.soldMinor ?? 0);
              return (
                <PartnerRow
                  key={p.id}
                  partner={{
                    id: p.id,
                    code: p.code,
                    fullName: p.fullName,
                    marketCode: p.marketCode,
                    phone: p.phone,
                    email: p.email,
                    whatsapp: p.whatsapp,
                    status: p.status,
                    commissionBps: p.commissionBps,
                    createdAt: p.createdAt.toISOString(),
                    link: `${base}/r/${p.code}`,
                    enquiries: leadsBy.get(p.id) ?? 0,
                    sales: sale?.closed ?? 0,
                    soldValue: formatMoney(money(soldMinor, m.currency), m.locale),
                    owed: formatMoney(
                      money(commissionOn(soldMinor, p.commissionBps), m.currency),
                      m.locale,
                    ),
                  }}
                />
              );
            })}
          </ul>
        )}
      </div>
    </AdminChrome>
  );
}
