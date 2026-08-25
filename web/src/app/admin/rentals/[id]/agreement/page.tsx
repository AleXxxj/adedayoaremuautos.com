import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rentalBookings, vehicles, rentalRates } from "@/db/schema";
import { requireStaff, canAccessMarket } from "@/lib/auth";
import { MARKETS } from "@/lib/market";
import { formatMoney, money, toMajor } from "@/lib/money";
import { parseTstzRange } from "@/lib/pgRange";
import { quoteRental, rentalDays } from "@/lib/rental";
import { toTariff } from "@/lib/repositories/rentals";
import { listLocations, formatPhone } from "@/lib/repositories/locations";
import { displayPhone } from "@/lib/phoneDisplay";
import { RentalAgreement, type AgreementData } from "@/components/admin/RentalAgreement";
import { AgreementTerms } from "@/components/admin/AgreementTerms";

export const dynamic = "force-dynamic";

/** "daily" reads as "dai" if you strip the suffix; spell them out. */
const UNIT: Record<string, string> = { daily: "day", weekly: "week", monthly: "month" };

export const metadata: Metadata = {
  title: "Rental agreement",
  robots: { index: false, follow: false },
};

/**
 * The rental agreement for one booking.
 *
 * Printed from the browser rather than generated as a PDF server-side: the
 * output is identical, every machine already has a "Save as PDF" in its print
 * dialog, and it avoids carrying a PDF toolchain into the deployment for a
 * document that is produced a handful of times a week.
 */
export default async function AgreementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;

  const [row] = await db
    .select({ b: rentalBookings, v: vehicles, r: rentalRates })
    .from(rentalBookings)
    .leftJoin(vehicles, eq(vehicles.id, rentalBookings.vehicleId))
    .leftJoin(rentalRates, eq(rentalRates.vehicleId, rentalBookings.vehicleId))
    .where(eq(rentalBookings.id, id))
    .limit(1);

  if (!row) notFound();
  if (!canAccessMarket(user, row.b.marketCode)) notFound();

  const { b, v, r } = row;
  const market = MARKETS[b.marketCode];
  const fmt = (minor: number) => formatMoney(money(minor, market.currency), market.locale);

  const range = parseTstzRange(b.period as unknown as string);
  const dateFmt = new Intl.DateTimeFormat(market.locale, {
    dateStyle: "long",
    timeZone: "UTC",
  });
  const startLabel = range ? dateFmt.format(range.start) : "—";
  const endLabel = range ? dateFmt.format(range.end) : "—";
  const days = range ? rentalDays(range.start, range.end) : 0;

  // The rate lines the customer was actually charged on, not a total divided
  // by the number of days: a week priced at the weekly rate is one line, and
  // showing "$57.14 per day" for it would be a figure nobody agreed to.
  let rateLines: { label: string; value: string }[] = [];
  if (r && days > 0) {
    try {
      const quote = quoteRental(toTariff(r), days, { withDriver: b.withDriver });
      rateLines = quote.lines.map((l) => ({
        label: `${l.quantity} × ${UNIT[l.tier] ?? l.tier}${l.quantity === 1 ? "" : "s"}`,
        value: fmt(l.subtotalMinor),
      }));
    } catch {
      // A tariff that has changed since the booking cannot reprice it. The
      // agreed total below is the number that matters and is stored on the row.
      rateLines = [];
    }
  }

  const sites = await listLocations(b.marketCode);
  const site = sites[0];
  const address = site
    ? [site.addressLine1, site.city, site.region, site.postalCode]
        .filter(Boolean)
        .join(", ")
    : "";

  const data: AgreementData = {
    renterName: b.renterLegalName || b.customerName,
    phone: displayPhone(b.customerPhone, b.marketCode),
    email: b.customerEmail,
    licenceNo: b.driverLicenseNo,
    vehicle: v ? [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ") : "—",
    vin: v?.vin ?? null,
    periodLabel: `${startLabel} – ${endLabel}`,
    startLabel,
    endLabel,
    days,
    rateLines,
    total: fmt(b.totalMinor),
    deposit: b.depositMinor > 0 ? fmt(b.depositMinor) : null,
    authorizedUse: b.authorizedUse || "Personal use",
    mileageAllowancePerDay: b.mileageAllowancePerDay,
    excessMileRate: b.excessMileRateMinor != null ? fmt(b.excessMileRateMinor) : null,
    mileageUnit: market.distanceUnit === "mi" ? "miles" : "km",
    pickupLocation: b.pickupLocation || address || null,
    startOdometer: b.startOdometer,
    endOdometer: b.endOdometer,
    businessName: "Adedayo Aremu Autos",
    businessAddress: address,
    businessPhone: site?.phone ? formatPhone(site.phone) : null,
    governingLaw: b.marketCode === "us" ? "North Carolina" : "Nigerian",
    todayLabel: dateFmt.format(new Date()),
    signedAt: b.agreementSignedAt ? dateFmt.format(b.agreementSignedAt) : null,
  };

  return (
    <div className="agreement-page">
      {/* Everything in here is hidden when printing. */}
      <div className="agreement-controls no-print">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <nav className="mb-4 text-sm text-[var(--text-muted)]">
            <Link href="/admin/rentals" className="hover:text-[var(--link)]">
              ← All rentals
            </Link>
          </nav>

          <AgreementTerms
            booking={{
              id: b.id,
              renterLegalName: b.renterLegalName,
              customerName: b.customerName,
              authorizedUse: b.authorizedUse,
              pickupLocation: b.pickupLocation,
              suggestedLocation: address,
              mileageAllowancePerDay: b.mileageAllowancePerDay,
              excessMileRate:
                b.excessMileRateMinor != null
                  ? toMajor(money(b.excessMileRateMinor, market.currency))
                  : null,
              startOdometer: b.startOdometer,
              endOdometer: b.endOdometer,
              currency: market.currency,
              mileageUnit: data.mileageUnit,
              signedAt: b.agreementSignedAt ? b.agreementSignedAt.toISOString() : null,
            }}
          />
        </div>
      </div>

      <div className="agreement-sheet">
        <RentalAgreement d={data} />
      </div>
    </div>
  );
}
