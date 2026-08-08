import Link from "next/link";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { vehicles, leads } from "@/db/schema";
import { requireStaff, allowedMarkets } from "@/lib/auth";
import { AdminChrome } from "../../layout";
import { createDeal } from "@/lib/actions/deals";
import { MARKETS } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import { NewDealForm } from "@/components/admin/NewDealForm";

export const dynamic = "force-dynamic";

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string; vehicle?: string }>;
}) {
  const user = await requireStaff();
  const markets = allowedMarkets(user);
  const { lead: leadId, vehicle: vehicleId } = await searchParams;

  const available = await db
    .select()
    .from(vehicles)
    .where(
      and(
        markets.length === 1
          ? eq(vehicles.marketCode, markets[0])
          : inArray(vehicles.marketCode, markets),
        or(eq(vehicles.status, "available"), eq(vehicles.status, "pending")),
      ),
    );

  const lead = leadId
    ? (await db.select().from(leads).where(eq(leads.id, leadId)))[0]
    : undefined;

  return (
    <AdminChrome email={user.email} role={user.role}>
      <div className="mx-auto max-w-3xl px-6 py-8">
        <nav className="mb-6 text-sm text-[var(--text-muted)]">
          <Link href="/admin/deals" className="hover:text-[var(--link)]">← Deals</Link>
        </nav>
        <h1 className="mb-2 text-2xl font-bold tracking-tight">New deal</h1>
        <p className="mb-8 text-sm text-[var(--text-muted)]">
          Only vehicles that are available or already pending can be sold.
        </p>

        {available.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] px-6 py-12 text-center">
            <p className="font-medium">No sellable vehicles</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--text-muted)]">
              Add a vehicle and set it to Available before starting a deal.
            </p>
            <Link href="/admin/vehicles/new" className="mt-6 inline-block rounded-lg bg-[var(--cta-bg)] px-5 py-2.5 text-sm font-semibold text-[var(--cta-fg)]">
              Add vehicle
            </Link>
          </div>
        ) : (
          <NewDealForm
            action={createDeal}
            leadId={leadId}
            defaultVehicleId={vehicleId}
            defaults={{
              customerName: lead?.name ?? "",
              customerPhone: lead?.phone ?? "",
              customerEmail: lead?.email ?? "",
            }}
            vehicles={available.map((v) => ({
              id: v.id,
              label:
                `${v.year} ${v.make} ${v.model}${v.trim ? " " + v.trim : ""}` +
                ` — ${v.priceMinor != null ? formatMoney(money(v.priceMinor, MARKETS[v.marketCode].currency), MARKETS[v.marketCode].locale) : "no price"}` +
                ` [${v.marketCode.toUpperCase()}]`,
            }))}
          />
        )}
      </div>
    </AdminChrome>
  );
}
