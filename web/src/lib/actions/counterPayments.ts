"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSection, canAccessMarket } from "@/lib/auth";
import { takeCounterPayment } from "@/lib/counterPayment";
import { recordRentalEarning } from "@/lib/partnerEarnings";

// Every car's rental page, whose "taken dates" a confirmed booking changes.
const RENTAL_PAGES = "/[market]/rentals/[slug]";

export interface CounterPaymentResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const schema = z.object({
  bookingId: z.string().uuid({ message: "Missing booking." }),
  // No upper limit here: what is still owed on the booking is the limit, and
  // it is checked against the booking itself.
  amount: z.coerce
    .number({ message: "Enter the amount taken." })
    .positive({ message: "Enter the amount taken." }),
  method: z.enum(["cash", "card", "other"], { message: "Choose how it was paid." }),
  // Generated in the staff member's browser, once per payment, and reused if
  // the same submit is retried — see the unique index on provider_ref.
  clientKey: z.string().uuid({ message: "Please reload the page and try again." }),
});

const METHOD_WORDS = { cash: "cash", card: "by card at the counter", other: "another way" };

/**
 * Records money taken in person for a rental.
 *
 * Every real rental so far has been paid at the counter, and none of it was
 * on file: the only payments the system knew were online ones. That left the
 * business without a record of its own takings, and left referral partners
 * unpaid — their commission is worked out from recorded payments, and the
 * agreement promises it on what the customer pays, however they pay.
 *
 * What is recorded is the amount, how it was taken (cash, a card machine, or
 * "other" — a payment app, say) and who took it. Never a card or account
 * number: there is nowhere to put one.
 *
 * Only the rental charge belongs here, never the refundable deposit, so the
 * total recorded can never exceed what the booking costs. The checks and the
 * write are in takeCounterPayment; this is the endpoint around them.
 */
export async function recordCounterPayment(
  _prev: CounterPaymentResult | null,
  formData: FormData,
): Promise<CounterPaymentResult> {
  const user = await requireSection("/admin/rentals");

  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the amount and method." };
  }
  const v = parsed.data;

  let outcome;
  try {
    outcome = await takeCounterPayment(
      { bookingId: v.bookingId, amountMajor: v.amount, method: v.method, clientKey: v.clientKey },
      { id: user.id, mayTakeFor: (market) => canAccessMarket(user, market) },
    );
  } catch (e) {
    console.error("[counter] could not record payment", e);
    return { ok: false, error: "Could not record that payment. Please try again." };
  }
  if (!outcome.ok) return { ok: false, error: outcome.error };

  if (!outcome.duplicate) {
    console.log(`[counter] ${user.email} recorded ${outcome.amount} on ${outcome.bookingId}`);
  }

  // A referred renter's commission, worked out again from everything paid —
  // on a retried submit too, in case the first one stopped before this line.
  // Never allowed to undo the payment just recorded: a commission can be
  // worked out again; a payment reported as failed when it was saved cannot.
  try {
    await recordRentalEarning(outcome.bookingId);
  } catch (e) {
    console.error("[counter] commission not recorded", e);
  }

  revalidatePath("/admin/rentals");
  revalidatePath("/partner");
  // A reservation it confirmed now blocks those dates on the car's page.
  if (outcome.confirmed) revalidatePath(RENTAL_PAGES, "page");

  if (outcome.duplicate) return { ok: true, message: "That payment is already recorded." };
  return {
    ok: true,
    message:
      `Recorded ${outcome.amount} paid ${METHOD_WORDS[v.method]}.` +
      (outcome.confirmed ? " The reservation is now a confirmed booking." : ""),
  };
}
