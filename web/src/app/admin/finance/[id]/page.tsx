import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { financeAgreements, instalments, financePayments, deals } from "@/db/schema";
import { requireStaff, canAccessMarket } from "@/lib/auth";
import { AdminChrome } from "../../layout";
import { MARKETS } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import { summarise } from "@/lib/ledger";
import { RecordPayment } from "@/components/admin/RecordPayment";

export const dynamic = "force-dynamic";

const STATE_TONE: Record<string, string> = {
  paid: "text-[var(--success)]",
  partial: "text-[var(--warning)]",
  late: "text-[var(--danger)]",
  due: "text-[var(--text-muted)]",
  written_off: "text-[var(--text-muted)] line-through",
};

export default async function AgreementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  const { created } = await searchParams;

  const [a] = await db.select().from(financeAgreements).where(eq(financeAgreements.id, id));
  if (!a) notFound();
  if (!canAccessMarket(user, a.marketCode)) notFound();

  const m = MARKETS[a.marketCode];
  const fmt = (minor: number) => formatMoney(money(minor, m.currency), m.locale, { showDecimals: true });
  const date = (d: Date) =>
    new Intl.DateTimeFormat(m.locale, { dateStyle: "medium", timeZone: "UTC" }).format(d);

  const [rows, payments, dealRow] = await Promise.all([
    db.select().from(instalments).where(eq(instalments.agreementId, id)).orderBy(asc(instalments.number)),
    db.select().from(financePayments).where(eq(financePayments.agreementId, id)).orderBy(desc(financePayments.receivedAt)),
    a.dealId ? db.select().from(deals).where(eq(deals.id, a.dealId)) : Promise.resolve([]),
  ]);

  const s = summarise(
    rows.map((i) => ({
      id: i.id, number: i.number, dueDate: i.dueDate,
      amountMinor: i.amountMinor, paidMinor: i.paidMinor, state: i.state,
    })),
    a.principalMinor,
  );

  return (
    <AdminChrome email={user.email} role={user.role}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <nav className="mb-6 text-sm text-[var(--text-muted)]">
          <Link href="/admin/finance" className="hover:text-[var(--link)]">← Finance</Link>
        </nav>

        {created && (
          <p className="mb-6 rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 px-4 py-3 text-sm text-[var(--success)]">
            Agreement created. The schedule below is the record of what the customer signed.
          </p>
        )}

        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-[var(--text-muted)]">{a.agreementNumber}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{a.customerName}</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {fmt(a.principalMinor)} over {a.termMonths} months
              {a.aprBps > 0 ? ` at ${(a.aprBps / 100).toFixed(2)}% APR` : " interest free"}
              {" · "}
              <span className="capitalize">{a.status.replace("_", " ")}</span>
            </p>
          </div>
          {dealRow[0] && (
            <Link href={`/admin/deals/${dealRow[0].id}`} className="text-sm text-[var(--link)] hover:underline">
              Open deal {dealRow[0].dealNumber} →
            </Link>
          )}
        </div>

        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Outstanding" value={fmt(s.outstandingMinor)} />
          <Stat label="Paid to date" value={fmt(s.paidMinor)} />
          <Stat
            label="Arrears"
            value={s.overdueCount ? `${fmt(s.overdueMinor)} (${s.overdueCount})` : "—"}
            tone={s.overdueCount ? "bad" : undefined}
          />
          <Stat
            label="Next due"
            value={s.nextDueDate ? `${fmt(s.nextDueMinor)} · ${date(s.nextDueDate)}` : "—"}
          />
        </div>

        {a.status === "active" && (
          <div className="mb-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Record a payment
            </h2>
            <RecordPayment agreementId={a.id} currency={a.currency} />
          </div>
        )}

        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Schedule
          </h2>
          <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-[var(--surface-2)] text-left text-[var(--text-secondary)]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">#</th>
                  <th className="px-4 py-2.5 font-medium">Due</th>
                  <th className="px-4 py-2.5 text-right font-medium">Payment</th>
                  <th className="px-4 py-2.5 text-right font-medium">Interest</th>
                  <th className="px-4 py-2.5 text-right font-medium">Principal</th>
                  <th className="px-4 py-2.5 text-right font-medium">Balance</th>
                  <th className="px-4 py-2.5 text-right font-medium">Paid</th>
                  <th className="px-4 py-2.5 font-medium">State</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id} className="border-t border-[var(--border-subtle)] bg-[var(--surface-1)]">
                    <td className="px-4 py-2 text-[var(--text-muted)]">{i.number}</td>
                    <td className="px-4 py-2">{date(i.dueDate)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(i.amountMinor)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-[var(--text-muted)]">{fmt(i.interestMinor)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-[var(--text-muted)]">{fmt(i.principalMinor)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-[var(--text-muted)]">{fmt(i.balanceAfterMinor)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{i.paidMinor ? fmt(i.paidMinor) : "—"}</td>
                    <td className={`px-4 py-2 capitalize ${STATE_TONE[i.state]}`}>{i.state.replace("_", " ")}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border-default)] bg-[var(--surface-2)] font-semibold">
                  <td className="px-4 py-2.5" colSpan={2}>Totals</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {fmt(rows.reduce((t, i) => t + i.amountMinor, 0))}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {fmt(rows.reduce((t, i) => t + i.interestMinor, 0))}
                  </td>
                  {/* This column must equal the principal exactly. */}
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {fmt(rows.reduce((t, i) => t + i.principalMinor, 0))}
                  </td>
                  <td className="px-4 py-2.5" />
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmt(s.paidMinor)}</td>
                  <td className="px-4 py-2.5" />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            The principal column totals {fmt(rows.reduce((t, i) => t + i.principalMinor, 0))},
            which equals the amount financed of {fmt(a.principalMinor)}.
          </p>
        </section>

        {payments.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Payments received
            </h2>
            <ul className="space-y-2 text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 border-b border-[var(--border-subtle)] pb-2">
                  <span className="font-semibold tabular-nums">{fmt(p.amountMinor)}</span>
                  <span className="capitalize text-[var(--text-secondary)]">{p.method.replace("_", " ")}</span>
                  {p.reference && <span className="font-mono text-xs text-[var(--text-muted)]">{p.reference}</span>}
                  <span className="text-[var(--text-muted)]">{p.recordedByEmail}</span>
                  <span className="ml-auto text-[var(--text-muted)]">{date(p.receivedAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AdminChrome>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3">
      <div className={`text-lg font-bold tabular-nums ${tone === "bad" ? "text-[var(--danger)]" : ""}`}>
        {value}
      </div>
      <div className="mt-0.5 text-xs uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
    </div>
  );
}
