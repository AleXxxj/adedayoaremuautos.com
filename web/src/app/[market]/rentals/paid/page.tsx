import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isMarketCode } from "@/lib/market";
import { paymentStateFor } from "@/lib/actions/rentalPayment";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payment received",
  // Nothing here should be indexed: it is one person's booking.
  robots: { index: false, follow: false },
};

/**
 * Where the payment provider returns the customer.
 *
 * This page reports; it never decides. Landing here proves only that a browser
 * followed a URL — the customer could type it, or come back after abandoning
 * the checkout — so the confirmation shown is read from what the webhook has
 * already recorded, and the webhook is the only thing that may mark a booking
 * paid.
 *
 * That gap is why the wording below is careful when the payment is not yet
 * recorded. A provider's webhook can arrive seconds after the customer does,
 * and telling somebody their payment failed when it is merely a moment behind
 * would be both wrong and alarming.
 */
export default async function RentalPaidPage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string }>;
  searchParams: Promise<{ booking?: string }>;
}) {
  const { market } = await params;
  if (!isMarketCode(market)) notFound();

  const { booking } = await searchParams;
  const state = await paymentStateFor(booking ?? "");

  const confirmed = state?.status === "paid" || state?.status === "confirmed";

  return (
    <div className="page-header page-header--rentals">
      <div className="page-header-content">
        <h1>{confirmed ? <>Payment <span>received</span></> : <>Nearly <span>there</span></>}</h1>
      </div>

      <div className="booking-result">
        {!state ? (
          <p className="booking-result-body">
            We could not find that booking. If you have paid, the confirmation
            is on its way by email — please do not pay again.
          </p>
        ) : confirmed ? (
          <>
            <p className="booking-result-body">
              Thank you. Your booking{" "}
              <strong className="booking-ref">{state.reference}</strong> is
              confirmed and the vehicle is reserved for your dates.
            </p>
            <p className="booking-result-note">
              Bring your driving licence to collection. The refundable security
              deposit is taken at pickup, not online.
            </p>
          </>
        ) : (
          <>
            <p className="booking-result-body">
              Your booking reference is{" "}
              <strong className="booking-ref">{state.reference}</strong>.
            </p>
            <p className="booking-result-note">
              If you have just paid, it can take a moment to come through —
              refresh in a few seconds. You will get an email either way, and
              nothing is charged twice.
            </p>
          </>
        )}

        <Link href={`/${market}/rentals`} className="btn btn-outline">
          Back to rentals
        </Link>
      </div>
    </div>
  );
}
