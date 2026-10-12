import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { rentalBookings, vehicles } from "@/db/schema";
import { MARKETS, isMarketCode } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import { parseTstzRange } from "@/lib/pgRange";
import { holdRemaining } from "@/lib/reservation";
import { releaseExpiredHolds } from "@/lib/rentalHolds";
import { RentalPayButton } from "@/components/RentalPayButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your reservation",
  // Never indexed. Reached by a private token, and about one person's booking.
  robots: { index: false, follow: false },
};

/**
 * The page a reserved car can be paid for from.
 *
 * Without this, the only way to pay was the button on the confirmation panel
 * — so closing the tab meant the reservation could never be completed online,
 * which made "reserve now, pay when you see it" impossible to actually do.
 * The link goes in the reservation email, which is the thing the customer
 * still has when they are standing on the forecourt.
 *
 * Deliberately sparse. It shows the vehicle, the dates, the amount and the
 * time left, and nothing about the renter: no name, no phone, no licence. The
 * token may be forwarded or left open on a phone somebody else picks up, and
 * none of that detail is needed to pay.
 */
export default async function ReservedPage({
  params,
}: {
  params: Promise<{ market: string; token: string }>;
}) {
  const { market: code, token } = await params;
  if (!isMarketCode(code)) notFound();
  const market = MARKETS[code];

  // So a hold that ran out while the email sat unread is reported honestly
  // rather than shown as live.
  await releaseExpiredHolds();

  if (!token || token.length < 20 || /[^A-Za-z0-9_-]/.test(token)) {
    return <Shell>{invalid()}</Shell>;
  }

  const [row] = await db
    .select({ b: rentalBookings, v: vehicles })
    .from(rentalBookings)
    .leftJoin(vehicles, eq(vehicles.id, rentalBookings.vehicleId))
    .where(
      and(
        eq(rentalBookings.reservationToken, token),
        eq(rentalBookings.marketCode, code),
      ),
    )
    .limit(1);

  if (!row) return <Shell>{invalid()}</Shell>;

  const b = row.b;
  const vehicle = row.v
    ? [row.v.year, row.v.make, row.v.model].filter(Boolean).join(" ")
    : "Your vehicle";
  const range = parseTstzRange(b.period as unknown as string);
  const dates = range
    ? `${fmtDate(range.start, market.locale)} → ${fmtDate(range.end, market.locale)}`
    : null;
  const amount = formatMoney(money(b.totalMinor, b.currency), market.locale);

  if (b.status === "cancelled") {
    return (
      <Shell>
        <h1 className="resv-title">This booking was cancelled</h1>
        <p className="resv-body">
          Please call us if that is not what you expected.
        </p>
      </Shell>
    );
  }

  // Already paid. Said as the good news it is, rather than as an error.
  if (b.status !== "quote") {
    return (
      <Shell>
        <div className="resv-tick">✅</div>
        <h1 className="resv-title">
          This booking is confirmed
        </h1>
        <p className="resv-body">
          {vehicle}
          {dates ? `, ${dates}` : ""}. Nothing more to pay today — the
          refundable deposit is taken when you collect.
        </p>
      </Shell>
    );
  }

  const held = b.reservedUntil && b.reservedUntil > new Date();

  return (
    <Shell>
      <div className="resv-eyebrow">
        Adedayo Aremu Autos
      </div>
      <h1 className="resv-title">Your reservation</h1>

      <dl className="resv-details">
        <Row label="Vehicle">{vehicle}</Row>
        {dates && <Row label="Dates">{dates}</Row>}
        <Row label="Reference">
          <code className="resv-row-value">{b.id.slice(0, 8).toUpperCase()}</code>
        </Row>
        <Row label="To pay now">
          <strong className="resv-amount">{amount}</strong>
        </Row>
        {b.depositMinor > 0 && (
          <Row label="Deposit at pickup">
            {formatMoney(money(b.depositMinor, b.currency), market.locale)}{" "}
            <span className="resv-muted">refundable</span>
          </Row>
        )}
      </dl>

      {held ? (
        <>
          <p className="resv-held">
            This vehicle is held for you for another{" "}
            <strong>{holdRemaining(b.reservedUntil!)}</strong>. Nobody else can
            book these dates in that time.
          </p>
          <div className="resv-pay">
            <RentalPayButton bookingId={b.id} amount={amount} />
          </div>
          <p className="resv-note">
            Come and see the vehicle first if you would rather — you can pay
            from this page on your phone when you are happy with it. The
            deposit is taken at pickup, not now.
          </p>
        </>
      ) : (
        <>
          {/* The hold is gone, but the booking is not. Said plainly, because
              somebody arriving at this page has been told a car was theirs. */}
          <p className="resv-lapsed">
            The hold on this vehicle has run out, so these dates are open to
            other customers again. Your request is still with us — paying now
            will confirm it if the dates are still free.
          </p>
          <div className="resv-pay">
            <RentalPayButton bookingId={b.id} amount={amount} />
          </div>
        </>
      )}

      <p className="resv-note">
        Questions?{" "}
        <Link href={`/${code}/contact`} className="resv-link">
          Get in touch
        </Link>{" "}
        and quote your reference.
      </p>
    </Shell>
  );
}

function invalid() {
  return (
    <>
      <h1 className="resv-title">This link is not valid</h1>
      <p className="resv-body">
        It may have been cut short when it was copied. Email{" "}
        <a
          href="mailto:info@adedayoaremuautos.com"
          className="resv-link"
        >
          info@adedayoaremuautos.com
        </a>{" "}
        with your reference and we will send a fresh one.
      </p>
    </>
  );
}

function fmtDate(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="resv-row">
      <dt className="resv-row-label">
        {label}
      </dt>
      <dd className="resv-row-value">{children}</dd>
    </div>
  );
}

/**
 * Inside the market layout, so the site header, footer and brand are all
 * here — which is right for a page somebody opens on a forecourt. That also
 * means the legacy stylesheet is loaded and its reset strips utility spacing,
 * so the layout below is done in `.legacy-theme .resv-*` rules alongside the
 * booking form's, rather than in Tailwind classes it would flatten.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="resv-page">
      <div className="resv-card">
        {children}
      </div>
    </main>
  );
}
