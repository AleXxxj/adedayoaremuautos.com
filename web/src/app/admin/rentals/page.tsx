import Link from "next/link";
import { requireStaff, allowedMarkets } from "@/lib/auth";
import { AdminChrome } from "../layout";
import { listBookings } from "@/lib/repositories/rentals";
import { MARKETS, type MarketCode } from "@/lib/market";
import { holdRemaining } from "@/lib/reservation";
import { formatMoney, money, toMajor } from "@/lib/money";
import { BookingRow } from "@/components/admin/BookingRow";
import { bookingTiming, timingLabel, urgencyOf } from "@/lib/bookingTiming";
import { PaymentCheck } from "@/components/admin/PaymentCheck";
import { pendingExtensions, type ExtensionRequestSummary } from "@/lib/extensions/store";
import { dayLabel } from "@/lib/extensions/present";

/** The time zone a booking's dates are counted in: its own market's. */
const zoneOf = (market: string) => MARKETS[market as MarketCode]?.timezone ?? "America/New_York";

export const dynamic = "force-dynamic";

export default async function AdminRentalsPage() {
  const user = await requireStaff();
  const rows = await listBookings(allowedMarkets(user));

  // Requests to keep a car longer. Empty when the feature is switched off
  // or its tables are not there yet, and never allowed to break this screen.
  let extensions = new Map<string, ExtensionRequestSummary>();
  try {
    extensions = await pendingExtensions(rows.map((r) => r.booking.id));
  } catch (e) {
    console.error("[extensions] requests not listed", e);
  }

  const quotes = rows.filter((r) => r.booking.status === "quote").length;
  const active = rows.filter((r) => r.booking.status === "active").length;

  // Sorted by what needs attention rather than by date. An overdue vehicle is
  // the most expensive thing on this screen and should never be below the fold.
  const sorted = [...rows].sort(
    (a, b) =>
      urgencyOf(a.booking.period as unknown as string, a.booking.status, zoneOf(a.booking.marketCode)) -
      urgencyOf(b.booking.period as unknown as string, b.booking.status, zoneOf(b.booking.marketCode)),
  );

  const needsAttention = rows.filter((r) => {
    const l = timingLabel(
      bookingTiming(r.booking.period as unknown as string, r.booking.status, zoneOf(r.booking.marketCode)),
    );
    return l != null && l.urgency === 0;
  }).length;

  return (
    <AdminChrome email={user.email} role={user.role}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Said here because this is where people look for it. Rates live on
            the vehicle, not on this screen, and that was not discoverable —
            the first person to need it could not find it at all. */}
        <p className="mb-6 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--text-muted)]">
          <i className="fas fa-circle-info mr-2" aria-hidden="true" />
          This screen is bookings. To change <strong>rental prices</strong>, open{" "}
          <Link href="/admin/vehicles" className="text-[var(--link)] hover:underline">
            Inventory
          </Link>
          , choose the vehicle, and scroll to <strong>Rental tariff</strong> — that
          is also where you tick whether it appears on the rentals page at all.
        </p>

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
            {needsAttention > 0 && (
              <>
                {" · "}
                <span className="font-medium text-[var(--danger)]">
                  {needsAttention} need{needsAttention === 1 ? "s" : ""} chasing
                </span>
              </>
            )}
          </p>
        </div>

        <PaymentCheck />

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
            {sorted.map(({ booking, make, model, year, slug, paidMinor }) => {
              const m = MARKETS[booking.marketCode];
              const paid = Number(paidMinor ?? 0);
              const owedMinor = Math.max(0, booking.totalMinor - paid);
              const ext = extensions.get(booking.id);
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
                    hasLicenceFile: Boolean(booking.licenceStorageKey),
                    reservedUntil: booking.reservedUntil?.toISOString() ?? null,
                    heldFor:
                      booking.reservedUntil && booking.reservedUntil > new Date()
                        ? holdRemaining(booking.reservedUntil)
                        : null,
                    hasInsuranceFile: Boolean(booking.insuranceStorageKey),
                    insuranceChoice: booking.insuranceChoice,
                    insurer: booking.insuranceProvider,
                    policyNo: booking.insurancePolicyNo,
                    injuryCoverCharge: booking.injuryCoverTotalMinor
                      ? formatMoney(money(booking.injuryCoverTotalMinor, m.currency), m.locale)
                      : null,
                    documentsVerifiedAt:
                      booking.documentsVerifiedAt?.toISOString() ?? null,
                    documentsVerifiedByEmail: booking.documentsVerifiedByEmail,
                    documentsRejectedReason: booking.documentsRejectedReason,
                    total: formatMoney(money(booking.totalMinor, m.currency), m.locale),
                    deposit: booking.depositMinor
                      ? formatMoney(money(booking.depositMinor, m.currency), m.locale)
                      : null,
                    createdAt: booking.createdAt.toISOString(),
                    paid: formatMoney(money(paid, m.currency), m.locale),
                    owedMajor: toMajor(money(owedMinor, m.currency)),
                    currencySymbol: m.currency === "USD" ? "$" : "₦",
                    extension: ext
                      ? {
                          id: ext.id,
                          addedDays: ext.addedDays,
                          newEnd: dayLabel(ext.newEnd, m.locale),
                          added: formatMoney(money(ext.addedMinor, m.currency), m.locale),
                          newTotal: formatMoney(money(ext.newTotalMinor, m.currency), m.locale),
                        }
                      : null,
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
