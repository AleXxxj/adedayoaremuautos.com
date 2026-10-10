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
import {
  PartnerApplication,
  type Application,
} from "@/components/admin/PartnerApplication";

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

  const everyone = await db
    .select()
    .from(referralPartners)
    .where(inArray(referralPartners.marketCode, markets))
    .orderBy(desc(referralPartners.createdAt));

  /*
   * Three queues, not one list.
   *
   * An application waiting on a decision and a partner owed £400 need
   * completely different things done to them, and a single list sorted by date
   * buries the first among the second. Pending comes first and in the order it
   * arrived — oldest at the top, because everyone who applies has been told to
   * expect an answer within one working day and the one who has waited longest
   * is the one closest to being let down.
   */
  const pending = everyone
    .filter((p) => p.status === "pending")
    .sort(
      (a, b) =>
        (a.appliedAt?.getTime() ?? 0) - (b.appliedAt?.getTime() ?? 0),
    );
  const awaitingSignature = everyone.filter((p) => p.status === "approved");
  const settled = everyone.filter((p) =>
    ["active", "suspended", "declined"].includes(p.status),
  );
  const partners = settled.filter((p) => p.status !== "declined");
  const declined = settled.filter((p) => p.status === "declined");

  const toApplication = (p: (typeof everyone)[number]): Application => ({
    id: p.id,
    code: p.code,
    fullName: p.fullName,
    businessName: p.businessName,
    city: p.city,
    marketCode: p.marketCode,
    phone: p.phone,
    email: p.email,
    whatsapp: p.whatsapp,
    website: p.website,
    proposal: p.proposal,
    status: p.status,
    commissionBps: p.commissionBps,
    appliedAt: p.appliedAt?.toISOString() ?? null,
    reviewedAt: p.reviewedAt?.toISOString() ?? null,
    reviewedByEmail: p.reviewedByEmail,
    declineReason: p.declineReason,
    agreementSentAt: p.agreementSentAt?.toISOString() ?? null,
  });

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
            {active} active
            {pending.length > 0 && ` · ${pending.length} awaiting a decision`}
            {awaitingSignature.length > 0 &&
              ` · ${awaitingSignature.length} not yet signed`}
          </p>
        </div>

        {pending.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Awaiting a decision
            </h2>
            <p className="mb-3 text-sm text-[var(--text-muted)]">
              Each of these people was told to expect an answer within one
              working day. Approving sends them the agreement to read and
              accept; their code does nothing until they have.
            </p>
            <ul className="space-y-3">
              {pending.map((p) => (
                <PartnerApplication key={p.id} app={toApplication(p)} />
              ))}
            </ul>
          </section>
        )}

        {awaitingSignature.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Approved, waiting on their signature
            </h2>
            <p className="mb-3 text-sm text-[var(--text-muted)]">
              The agreement has been emailed and not yet accepted. Re-sending
              issues a fresh link — worth doing if the first one was never
              opened.
            </p>
            <ul className="space-y-3">
              {awaitingSignature.map((p) => (
                <PartnerApplication key={p.id} app={toApplication(p)} />
              ))}
            </ul>
          </section>
        )}

        {partners.length > 0 && (
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Partners
          </h2>
        )}

        {partners.length === 0 && pending.length === 0 && awaitingSignature.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] px-6 py-16 text-center">
            <p className="font-medium">Nobody has applied yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">
              The referral panels on the homepage lead to an application form.
              Applications arrive here for a decision, and once a partner has
              accepted the agreement their enquiries and bookings appear against
              their name.
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

        {/* Kept rather than hidden. A decline is reversible — "we are only
            taking on partners in Greensboro at the moment" stops being true —
            and Approve on one of these re-opens it with a fresh agreement. */}
        {declined.length > 0 && (
          <details className="mt-8">
            <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Declined ({declined.length})
            </summary>
            <ul className="mt-3 space-y-3">
              {declined.map((p) => (
                <PartnerApplication key={p.id} app={toApplication(p)} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </AdminChrome>
  );
}
