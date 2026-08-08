import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { requireStaff, allowedMarkets } from "@/lib/auth";
import { AdminChrome } from "../layout";
import { MARKETS } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  draft: "text-[var(--text-muted)] border-[var(--border-default)]",
  available: "text-[var(--success)] border-[var(--success)]/40",
  pending: "text-[var(--warning)] border-[var(--warning)]/40",
  sold: "text-[var(--text-muted)] border-[var(--border-default)]",
  unlisted: "text-[var(--text-muted)] border-[var(--border-default)]",
};

export default async function AdminVehiclesPage() {
  const user = await requireStaff();
  const markets = allowedMarkets(user);

  const rows = await db
    .select()
    .from(vehicles)
    .where(
      markets.length === 1
        ? eq(vehicles.marketCode, markets[0])
        : inArray(vehicles.marketCode, markets),
    )
    .orderBy(desc(vehicles.updatedAt))
    .limit(200);

  return (
    <AdminChrome email={user.email} role={user.role}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {rows.length} vehicle{rows.length === 1 ? "" : "s"}
              {user.marketScope && ` · ${MARKETS[user.marketScope].name} only`}
            </p>
          </div>
          <Link
            href="/admin/vehicles/new"
            className="rounded-lg bg-[var(--cta-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)]"
          >
            Add vehicle
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] px-6 py-16 text-center">
            <p className="font-medium">No vehicles yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--text-muted)]">
              Add your first vehicle and it appears on the public site
              immediately once its status is set to Available.
            </p>
            <Link
              href="/admin/vehicles/new"
              className="mt-6 inline-block rounded-lg bg-[var(--cta-bg)] px-5 py-2.5 text-sm font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)]"
            >
              Add vehicle
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-[var(--surface-2)] text-left text-[var(--text-secondary)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Vehicle</th>
                  <th className="px-4 py-3 font-medium">Market</th>
                  <th className="px-4 py-3 font-medium">Condition</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => {
                  const market = MARKETS[v.marketCode];
                  return (
                    <tr
                      key={v.id}
                      className="border-t border-[var(--border-subtle)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)]"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/vehicles/${v.id}`}
                          className="font-medium hover:text-[var(--link)]"
                        >
                          {v.year} {v.make} {v.model} {v.trim ?? ""}
                        </Link>
                        <div className="text-xs text-[var(--text-muted)]">
                          {v.vin ?? v.chassisNo ?? "no identifier"}
                        </div>
                      </td>
                      <td className="px-4 py-3 uppercase text-[var(--text-muted)]">
                        {v.marketCode}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {v.condition}
                      </td>
                      <td className="px-4 py-3">
                        {v.priceMinor != null
                          ? formatMoney(
                              money(v.priceMinor, market.currency),
                              market.locale,
                            )
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[v.status]}`}
                        >
                          {v.status}
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
