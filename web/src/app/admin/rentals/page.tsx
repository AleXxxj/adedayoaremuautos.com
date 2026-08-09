import Link from "next/link";
import { requireStaff, allowedMarkets } from "@/lib/auth";
import { AdminChrome } from "../layout";
import { listBookings } from "@/lib/repositories/rentals";
import { MARKETS } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import { BookingRow } from "@/components/admin/BookingRow";

export const dynamic = "force-dynamic";

export default async function AdminRentalsPage() {
  const user = await requireStaff();
  const rows = await listBookings(allowedMarkets(user));

  const quotes = rows.filter((r) => r.booking.status === "quote").length;
  const active = rows.filter((r) => r.booking.status === "active").length;

  return (
    <AdminChrome email={user.email} role={user.role}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Rentals</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {rows.length} booking{rows.length === 1 ? "" : "s"}
            {quotes > 0 && (
              <>
                {" · "}
                <span className="font-medium text-[var(--warning)]">
                  {quotes} awaiting confirmation
                </span>
              </>
            )}
            {active > 0 && ` · ${active} out now`}
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] px-6 py-16 text-center">
            <p className="font-medium">No rental bookings yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">
              Requests from the public rentals pages land here as quotes.
              Confirming one is what reserves the vehicle — the database refuses
              two confirmed bookings that overlap.
            </p>
            <Link href="/us/rentals" target="_blank" className="mt-6 inline-block text-sm text-[var(--link)] hover:underline">
              Open the public rentals page ↗
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map(({ booking, make, model, year, slug }) => {
              const m = MARKETS[booking.marketCode];
              return (
                <BookingRow
                  key={booking.id}
                  booking={{
                    id: booking.id,
                    marketCode: booking.marketCode,
                    status: booking.status,
                    period: booking.period as unknown as string,
                    customerName: booking.customerName,
                    customerPhone: booking.customerPhone,
                    customerEmail: booking.customerEmail,
                    withDriver: booking.withDriver,
                    licence: booking.driverLicenseNo,
                    notes: booking.notes,
                    total: formatMoney(money(booking.totalMinor, m.currency), m.locale),
                    deposit: booking.depositMinor
                      ? formatMoney(money(booking.depositMinor, m.currency), m.locale)
                      : null,
                    createdAt: booking.createdAt.toISOString(),
                  }}
                  vehicle={make ? { label: `${year} ${make} ${model}`, slug: slug! } : null}
                  locale={m.locale}
                />
              );
            })}
          </ul>
        )}
      </div>
    </AdminChrome>
  );
}
