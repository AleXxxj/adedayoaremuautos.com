import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rentalBookings, rentalPayments, vehicles } from "@/db/schema";
import { MARKETS, isMarketCode } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import { parseTstzRange } from "@/lib/pgRange";
import { holdRemaining } from "@/lib/reservation";
import { releaseExpiredHolds } from "@/lib/rentalHolds";
import { providerConfigured, providerFor } from "@/lib/payments/provider";
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
  // Some cars take no deposit; nothing below may promise one for them.
  const dep = b.depositMinor > 0;

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

  /*
   * Past the reservation stage. Said as the good news it is — but only what
   * is true: a booking staff confirmed by phone has not been paid for, so it
   * must not say "nothing more to pay", and a rental already under way or
   * finished is not "confirmed" any more.
   */
  if (b.status !== "quote") {
    // Added up, not counted: a part payment at the counter is a payment, but
    // it doesn't make "nothing more to pay" true.
    const [paid] = await db
      .select({ total: sql<number>`coalesce(sum(${rentalPayments.amountMinor}), 0)::bigint` })
      .from(rentalPayments)
      .where(and(eq(rentalPayments.bookingId, b.id), eq(rentalPayments.status, "paid")));
    const paidMinor = Number(paid?.total ?? 0);
    const owedMinor = Math.max(0, b.totalMinor - paidMinor);
    const owed = formatMoney(money(owedMinor, b.currency), market.locale);
    const what = `${vehicle}${dates ? `, ${dates}` : ""}.`;

    return (
      <Shell>
        <div className="resv-tick">✅</div>
        <h1 className="resv-title">
          {b.status === "active"
            ? "Your rental is under way"
            : b.status === "returned"
              ? "This rental is complete"
              : "This booking is confirmed"}
        </h1>
        <p className="resv-body">
          {what}{" "}
          {b.status === "returned"
            ? "Thank you for renting with us."
            : b.status === "active"
              ? "Call us if you need to keep the vehicle longer."
              : paidMinor > 0 && owedMinor === 0
                ? `The rental is paid.${dep ? " The refundable deposit is taken when you pick up the vehicle." : ""}`
                : paidMinor > 0
                  ? `Pay the rest of the rental, ${owed}${dep ? ", and the refundable deposit," : ","} when you pick up the vehicle.`
                  : `Pay the rental total of ${amount}${dep ? " and the refundable deposit" : ""} when you pick up the vehicle.`}
        </p>
      </Shell>
    );
  }

  const held = b.reservedUntil && b.reservedUntil > new Date();
  // No pay button that cannot work. While the market has no live card key,
  // the page still shows the hold, and says the rental is paid at pickup.
  const payOnline = providerConfigured(providerFor(code));

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
        <Row label={payOnline ? "To pay now" : "Rental total"}>
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
          {payOnline ? (
            <>
              <div className="resv-pay">
                <RentalPayButton bookingId={b.id} amount={amount} deposit={dep} />
              </div>
              <p className="resv-note">
                Come see the vehicle first if you&rsquo;d like. You can pay from this
                page on your phone when you&rsquo;re ready.
              </p>
            </>
          ) : (
            <p className="resv-note">
              Come see the vehicle, and pay when you pick it up.
              {dep && " The refundable deposit is taken then too."}
            </p>
          )}
        </>
      ) : (
        <>
          {/* The hold is gone, but the booking is not. Said plainly, because
              somebody arriving at this page has been told a car was theirs. */}
          <p className="resv-lapsed">
            The hold on this vehicle has run out, so these dates are open to
            other customers again. Your request is still with us —{" "}
            {payOnline
              ? "paying now will confirm it if the dates are still free."
              : "call us and we will check whether the dates are still free."}
          </p>
          {payOnline && (
            <div className="resv-pay">
              <RentalPayButton bookingId={b.id} amount={amount} deposit={dep} />
            </div>
          )}
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
