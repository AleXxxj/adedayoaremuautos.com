import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { deals, vehicles } from "@/db/schema";
import { requireStaff, allowedMarkets } from "@/lib/auth";
import { AdminChrome } from "../layout";
import { MARKETS } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";

export const dynamic = "force-dynamic";

const STAGES = [
  "draft",
  "negotiating",
  "agreed",
  "financing",
  "contracted",
  "delivered",
] as const;

const TONE: Record<string, string> = {
  draft: "text-[var(--text-muted)] border-[var(--border-default)]",
  negotiating: "text-[var(--info)] border-[var(--info)]/40",
  agreed: "text-[var(--info)] border-[var(--info)]/40",
  financing: "text-[var(--warning)] border-[var(--warning)]/40",
  contracted: "text-[var(--warning)] border-[var(--warning)]/40",
  delivered: "text-[var(--success)] border-[var(--success)]/40",
  lost: "text-[var(--text-muted)] border-[var(--border-default)]",
};

export default async function DealsPage() {
  const user = await requireStaff();
  const markets = allowedMarkets(user);

  const rows = await db
    .select({ deal: deals, make: vehicles.make, model: vehicles.model, year: vehicles.year })
    .from(deals)
    .leftJoin(vehicles, eq(deals.vehicleId, vehicles.id))
    .where(
      markets.length === 1
        ? eq(deals.marketCode, markets[0])
        : inArray(deals.marketCode, markets),
    )
    .orderBy(desc(deals.updatedAt))
    .limit(200);

  const open = rows.filter((r) => !["delivered", "lost"].includes(r.deal.status));

  // Pipeline value counts only live deals — a delivered deal is revenue, not
  // pipeline, and counting both together flatters the number.
  const pipelineByCurrency = open.reduce<Record<string, number>>((acc, r) => {
    acc[r.deal.currency] = (acc[r.deal.currency] ?? 0) + r.deal.totalMinor;
    return acc;
  }, {});

  return (
    <AdminChrome email={user.email} role={user.role}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Deals</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {open.length} open
              {Object.entries(pipelineByCurrency).map(([cur, minor]) => (
                <span key={cur}>
                  {" · "}
                  {formatMoney(money(minor, cur as "USD" | "NGN"), cur === "USD" ? "en-US" : "en-NG")} in pipeline
                </span>
              ))}
            </p>
          </div>
          <Link
            href="/admin/deals/new"
            className="rounded-lg bg-[var(--cta-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)]"
          >
            New deal
          </Link>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {STAGES.map((s) => (
            <div
              key={s}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-3 text-center"
            >
              <div className="text-xl font-bold">
                {rows.filter((r) => r.deal.status === s).length}
              </div>
              <div className="mt-0.5 text-[11px] capitalize text-[var(--text-muted)]">{s}</div>
            </div>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] px-6 py-16 text-center">
            <p className="font-medium">No deals yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">
              Start one from a lead, or from any vehicle in inventory. The
              worksheet handles trade-in, fees, tax and financing, and delivery
              marks the vehicle sold.
            </p>
            <Link
              href="/admin/deals/new"
              className="mt-6 inline-block rounded-lg bg-[var(--cta-bg)] px-5 py-2.5 text-sm font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)]"
            >
              New deal
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-[var(--surface-2)] text-left text-[var(--text-secondary)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Deal</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Vehicle</th>
                  <th className="px-4 py-3 font-medium">Out the door</th>
                  <th className="px-4 py-3 font-medium">Stage</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ deal, make, model, year }) => {
                  const m = MARKETS[deal.marketCode];
                  return (
                    <tr key={deal.id} className="border-t border-[var(--border-subtle)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)]">
                      <td className="px-4 py-3">
                        <Link href={`/admin/deals/${deal.id}`} className="font-mono text-xs font-medium hover:text-[var(--link)]">
                          {deal.dealNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{deal.customerName}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {make ? `${year} ${make} ${model}` : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatMoney(money(deal.totalMinor, m.currency), m.locale)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${TONE[deal.status]}`}>
                          {deal.status}
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
