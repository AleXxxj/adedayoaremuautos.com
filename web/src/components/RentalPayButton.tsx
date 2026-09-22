"use client";

import { useActionState, useEffect } from "react";
import { startRentalPayment, type StartPaymentResult } from "@/lib/actions/rentalPayment";

/**
 * "Pay now to confirm."
 *
 * Offered after the request is already recorded, never instead of it. Someone
 * who abandons the checkout has still made an enquiry the business can act on,
 * which is the whole reason paying is a second step rather than part of the
 * form.
 *
 * The amount is the hire charge only. The refundable deposit is taken at
 * pickup, where damage can actually be looked at — and where a disagreement is
 * a conversation rather than a card chargeback.
 */
export function RentalPayButton({
  bookingId,
  amount,
}: {
  bookingId: string;
  amount: string;
}) {
  const [state, action, pending] = useActionState<StartPaymentResult | null, FormData>(
    startRentalPayment,
    null,
  );

  useEffect(() => {
    // The provider's page is not ours, so this is a full navigation rather
    // than a router push.
    if (state?.ok && state.url) window.location.href = state.url;
  }, [state]);

  return (
    <form action={action} className="booking-pay">
      <input type="hidden" name="bookingId" value={bookingId} />

      {state?.error && (
        <p className="booking-pay-error" role="alert">
          {state.error}
        </p>
      )}

      <button type="submit" className="btn btn-primary booking-pay-btn" disabled={pending}>
        <i className="fas fa-lock" aria-hidden="true" />
        {pending ? "Opening secure checkout…" : `Pay ${amount} to confirm`}
      </button>

      <p className="booking-pay-note">
        Paying confirms the dates straight away. Card details are handled by our
        payment provider and never reach this website. The refundable deposit is
        taken at pickup, not now.
      </p>
    </form>
  );
}
