import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { partnerPayouts, referralPartners } from "@/db/schema";
import { requireStaff, allowedMarkets } from "@/lib/auth";
import { assertSection } from "@/lib/adminNav";
import { AdminChrome } from "../layout";
import { MARKETS } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import { PayoutRow } from "@/components/admin/PayoutRow";

export const dynamic = "force-dynamic";

/**
 * Money going out.
 *
 * Open requests first and oldest at the top: a partner who asked a fortnight
 * ago and has heard nothing is the one who stops referring people.
 *
 * Marking one paid is the step that settles the underlying commissions, and
 * it asks for a reference — "we paid you" with nothing to check it against is
 * how a payment gets chased twice.
 */
export default async function AdminPayoutsPage() {
  const user = await requireStaff();
  assertSection(user.role, "/admin/payouts");
  const markets = allowedMarkets(user);

  const rows = await db
    .select({
      id: partnerPayouts.id,
      amountMinor: partnerPayouts.amountMinor,
      currency: partnerPayouts.currency,
      state: partnerPayouts.state,
      note: partnerPayouts.note,
      requestedAt: partnerPayouts.requestedAt,
      decidedAt: partnerPayouts.decidedAt,
      decidedByEmail: partnerPayouts.decidedByEmail,
      paidAt: partnerPayouts.paidAt,
      reference: partnerPayouts.reference,
      rejectReason: partnerPayouts.rejectReason,
      marketCode: partnerPayouts.marketCode,
      partnerName: referralPartners.fullName,
      partnerCode: referralPartners.code,
      partnerPhone: referralPartners.phone,
      partnerEmail: referralPartners.email,
    })
    .from(partnerPayouts)
    .innerJoin(
      referralPartners,
      eq(partnerPayouts.partnerId, referralPartners.id),
    )
    .where(inArray(partnerPayouts.marketCode, markets))
    .orderBy(desc(partnerPayouts.requestedAt));

  const open = rows
    .filter((r) => r.state === "requested" || r.state === "approved")
    .reverse();
  const settled = rows.filter(
    (r) => r.state === "paid" || r.state === "rejected",
  );

  const owed = open.reduce((sum, r) => sum + r.amountMinor, 0);
  const openMarket = open[0] ? MARKETS[open[0].marketCode] : MARKETS.us;

  const toRow = (r: (typeof rows)[number]) => {
    const m = MARKETS[r.marketCode];
    return {
      id: r.id,
      amount: formatMoney(money(r.amountMinor, r.currency), m.locale),
      state: r.state,
      note: r.note,
      requestedAt: r.requestedAt.toISOString(),
      decidedByEmail: r.decidedByEmail,
      paidAt: r.paidAt?.toISOString() ?? null,
      reference: r.reference,
      rejectReason: r.rejectReason,
      marketCode: r.marketCode,
      partnerName: r.partnerName,
      partnerCode: r.partnerCode,
      partnerPhone: r.partnerPhone,
      partnerEmail: r.partnerEmail,
    };
  };

  return (
    <AdminChrome email={user.email} role={user.role}>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Partner payouts</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {open.length === 0
              ? "Nothing waiting"
              : `${open.length} waiting · ${formatMoney(
                  money(owed, openMarket.currency),
                  openMarket.locale,
                )} requested`}
          </p>
        </div>

        {/* How the money actually moves is not on this site by design — there
            are no bank details anywhere in the system, so paying someone means
            contacting them. Their number is on the row for that reason. */}
        <p className="mb-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--text-muted)]">
          This site holds no bank details for anybody. Arrange the transfer with
          the partner directly, then mark it paid here with your reference —
          that is what settles the commissions behind it and emails them.
        </p>

        {open.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Waiting on you
            </h2>
            <ul className="space-y-3">
              {open.map((r) => (
                <PayoutRow key={r.id} payout={toRow(r)} />
              ))}
            </ul>
          </section>
        )}

        {settled.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Settled
            </h2>
            <ul className="space-y-3">
              {settled.map((r) => (
                <PayoutRow key={r.id} payout={toRow(r)} />
              ))}
            </ul>
          </section>
        )}

        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] px-6 py-16 text-center">
            <p className="font-medium">No payout requests yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">
              Partners request payouts from their own dashboard once a hire or
              sale they introduced has completed. Requests arrive here, and the
              figure they can ask for is already net of anything outstanding.
            </p>
          </div>
        )}
      </div>
    </AdminChrome>
  );
}
