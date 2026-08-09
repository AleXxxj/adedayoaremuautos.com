import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { financeAgreements, instalments } from "@/db/schema";
import { requireStaff, allowedMarkets } from "@/lib/auth";
import { AdminChrome } from "../layout";
import { MARKETS } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import { summarise } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const user = await requireStaff();
  const markets = allowedMarkets(user);

  const agreements = await db
    .select()
    .from(financeAgreements)
    .where(
      markets.length === 1
        ? eq(financeAgreements.marketCode, markets[0])
        : inArray(financeAgreements.marketCode, markets),
    )
    .orderBy(desc(financeAgreements.createdAt));

  const allInstalments = agreements.length
    ? await db
        .select()
        .from(instalments)
        .where(inArray(instalments.agreementId, agreements.map((a) => a.id)))
        .orderBy(asc(instalments.number))
    : [];

  const rows = agreements.map((a) => {
    const mine = allInstalments.filter((i) => i.agreementId === a.id);
    return {
      agreement: a,
      summary: summarise(
        mine.map((i) => ({
          id: i.id,
          number: i.number,
          dueDate: i.dueDate,
          amountMinor: i.amountMinor,
          paidMinor: i.paidMinor,
          state: i.state,
        })),
        a.principalMinor,
      ),
    };
  });

  // Arrears first — the whole point of a ledger is knowing who is behind.
  rows.sort((x, y) => y.summary.overdueMinor - x.summary.overdueMinor);

  const inArrears = rows.filter((r) => r.summary.overdueCount > 0);

  return (
    <AdminChrome email={user.email} role={user.role}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Finance</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {agreements.filter((a) => a.status === "active").length} active
            {inArrears.length > 0 && (
              <>
                {" · "}
                <span className="font-medium text-[var(--danger)]">
                  {inArrears.length} in arrears
                </span>
              </>
            )}
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] px-6 py-16 text-center">
            <p className="font-medium">No finance agreements yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">
              Contract a financed deal, then create the agreement from it. The
              instalment schedule is generated once and becomes the record of
              what the customer signed.
            </p>
            <Link href="/admin/deals" className="mt-6 inline-block text-sm text-[var(--link)] hover:underline">
              Go to deals →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-[var(--surface-2)] text-left text-[var(--text-secondary)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Agreement</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Outstanding</th>
                  <th className="px-4 py-3 font-medium">Arrears</th>
                  <th className="px-4 py-3 font-medium">Progress</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ agreement: a, summary: s }) => {
                  const m = MARKETS[a.marketCode];
                  const behind = s.overdueCount > 0;
                  return (
                    <tr
                      key={a.id}
                      className={`border-t border-[var(--border-subtle)] hover:bg-[var(--surface-2)] ${
                        behind ? "bg-[var(--danger)]/5" : "bg-[var(--surface-1)]"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <Link href={`/admin/finance/${a.id}`} className="font-mono text-xs font-medium hover:text-[var(--link)]">
                          {a.agreementNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{a.customerName}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatMoney(money(s.outstandingMinor, m.currency), m.locale)}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {behind ? (
                          <span className="font-semibold text-[var(--danger)]">
                            {formatMoney(money(s.overdueMinor, m.currency), m.locale)}
                            <span className="ml-1 text-xs font-normal">({s.overdueCount})</span>
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--surface-3)]">
                            <div
                              className="h-full rounded-full bg-[var(--cta-bg)]"
                              style={{ width: `${s.progressPercent}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-[var(--text-muted)]">
                            {s.progressPercent}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5 text-xs capitalize">
                          {a.status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminChrome>
  );
}
