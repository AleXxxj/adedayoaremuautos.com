import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { deals, dealEvents, vehicles } from "@/db/schema";
import { requireStaff, canAccessMarket } from "@/lib/auth";
import { AdminChrome } from "../../layout";
import { DealWorksheet } from "@/components/admin/DealWorksheet";
import { DealStage } from "@/components/admin/DealStage";
import { CreateAgreement } from "@/components/admin/CreateAgreement";
import { financeAgreements } from "@/db/schema";
import { MARKETS } from "@/lib/market";
import { toMajor, money } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;

  const [deal] = await db.select().from(deals).where(eq(deals.id, id));
  if (!deal) notFound();
  if (!canAccessMarket(user, deal.marketCode)) notFound();

  const market = MARKETS[deal.marketCode];
  const cur = market.currency;

  const [vehicle] = deal.vehicleId
    ? await db.select().from(vehicles).where(eq(vehicles.id, deal.vehicleId))
    : [undefined];

  const [history, agreementRows] = await Promise.all([
    db
      .select()
      .from(dealEvents)
      .where(eq(dealEvents.dealId, id))
      .orderBy(desc(dealEvents.at)),
    db
      .select({ id: financeAgreements.id, number: financeAgreements.agreementNumber })
      .from(financeAgreements)
      .where(eq(financeAgreements.dealId, id))
      .limit(1),
  ]);
  const agreement = agreementRows[0];

  const major = (minor: number | null) =>
    minor == null ? 0 : toMajor(money(minor, cur));

  const readOnly = deal.status === "delivered";

  return (
    <AdminChrome email={user.email} role={user.role}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <nav className="mb-6 text-sm text-[var(--text-muted)]">
          <Link href="/admin/deals" className="hover:text-[var(--link)]">← Deals</Link>
        </nav>

        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-[var(--text-muted)]">{deal.dealNumber}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{deal.customerName}</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {vehicle
                ? `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? " " + vehicle.trim : ""}`
                : "No vehicle attached"}
              {" · "}
              <span className="uppercase">{deal.marketCode}</span>
            </p>
          </div>
          {vehicle && (
            <Link
              href={`/admin/vehicles/${vehicle.id}`}
              className="text-sm text-[var(--link)] hover:underline"
            >
              Open vehicle →
            </Link>
          )}
        </div>

        <div className="mb-8 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Stage — <span className="capitalize text-[var(--text-primary)]">{deal.status}</span>
          </h2>
          <DealStage dealId={deal.id} status={deal.status} />
        </div>

        {/* Financed deals become a ledger once contracted. */}
        {deal.isFinanced &&
          (deal.status === "contracted" || deal.status === "delivered") && (
            <div className="mb-8 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Finance
              </h2>
              {agreement ? (
                <p className="text-sm">
                  Agreement{" "}
                  <Link
                    href={`/admin/finance/${agreement.id}`}
                    className="font-mono text-[var(--link)] hover:underline"
                  >
                    {agreement.number}
                  </Link>{" "}
                  is live for this deal.
                </p>
              ) : (
                <CreateAgreement dealId={deal.id} />
              )}
            </div>
          )}

        <DealWorksheet
          dealId={deal.id}
          market={market}
          readOnly={readOnly}
          initial={{
            customerName: deal.customerName,
            customerPhone: deal.customerPhone,
            customerEmail: deal.customerEmail ?? "",
            vehiclePrice: major(deal.vehiclePriceMinor),
            tradeInDescription: deal.tradeInDescription ?? "",
            tradeInAllowance: major(deal.tradeInAllowanceMinor),
            tradeInPayoff: major(deal.tradeInPayoffMinor),
            downPayment: major(deal.downPaymentMinor),
            taxRatePercent: deal.taxRateBps / 100,
            isFinanced: deal.isFinanced,
            aprPercent: (deal.aprBps ?? 0) / 100,
            termMonths: deal.termMonths ?? market.financing.termMonths[0],
            fees: (deal.fees ?? []).map((f) => ({
              label: f.label,
              amount: toMajor(money(f.amountMinor, cur)),
              taxable: f.taxable,
            })),
          }}
        />

        {history.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              History
            </h2>
            <ul className="space-y-2 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap gap-x-3 border-b border-[var(--border-subtle)] pb-2 text-[var(--text-secondary)]">
                  <span className="font-medium capitalize">
                    {h.fromStatus ? `${h.fromStatus} → ${h.toStatus}` : h.toStatus}
                  </span>
                  {h.note && <span className="text-[var(--text-muted)]">{h.note}</span>}
                  <span className="text-[var(--text-muted)]">{h.actorEmail}</span>
                  <span className="ml-auto text-[var(--text-muted)]">
                    {new Intl.DateTimeFormat(market.locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: market.timezone,
                    }).format(h.at)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AdminChrome>
  );
}
