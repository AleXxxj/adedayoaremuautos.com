import "server-only";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { PaymentError, type CheckoutRequest, type CheckoutSession } from "./provider";

/**
 * Paystack, for Nigeria.
 *
 * Stripe does not settle to Nigerian bank accounts, which is the whole reason
 * there are two of these. Paystack is driven over plain REST — there is no
 * dependency to add, and the surface used here is two calls.
 *
 * Same shape as Stripe: the customer leaves for a page Paystack hosts and no
 * card details touch this application.
 */

const API = "https://api.paystack.co";

function secret(): string {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!key) throw new PaymentError("Card payments are not set up yet.", false);
  return key;
}

interface InitialiseResponse {
  status: boolean;
  message?: string;
  data?: { authorization_url: string; reference: string };
}

export async function createPaystackCheckout(
  req: CheckoutRequest,
): Promise<CheckoutSession> {
  // Our own reference rather than one Paystack invents. It means the row can
  // be written before the call, so a reply that never arrives still leaves a
  // record of the attempt instead of a payment nobody can account for.
  const reference = `aaa_${req.bookingId.slice(0, 8)}_${randomUUID().slice(0, 8)}`;

  if (!req.customerEmail?.trim()) {
    // Checked earlier too, but a provider-level requirement belongs with the
    // provider: Paystack refuses a transaction with no email.
    throw new PaymentError("An email address is needed to pay online.", false);
  }

  let body: InitialiseResponse;
  try {
    const res = await fetch(`${API}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: req.customerEmail.trim(),
        // Paystack takes the smallest unit — kobo — which is what we store.
        amount: req.amountMinor,
        currency: req.currency.toUpperCase(),
        reference,
        callback_url: req.successUrl,
        metadata: {
          bookingId: req.bookingId,
          cancel_action: req.cancelUrl,
          custom_fields: [
            {
              display_name: "Rental",
              variable_name: "rental",
              value: req.description,
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(12000),
    });
    body = (await res.json()) as InitialiseResponse;
  } catch (e) {
    console.error("[payments] paystack initialise failed", e);
    throw new PaymentError("We could not start the payment. Please try again.");
  }

  if (!body.status || !body.data?.authorization_url) {
    console.error("[payments] paystack refused", body.message);
    throw new PaymentError("We could not start the payment. Please try again.");
  }

  return { url: body.data.authorization_url, reference: body.data.reference };
}

/**
 * Verifies a Paystack webhook.
 *
 * Paystack signs the raw body with HMAC-SHA512 under the secret key. Compared
 * in constant time: a plain === on a signature leaks, through timing, how much
 * of a guess was correct, which is enough to find the rest.
 */
export function verifyPaystackWebhook(rawBody: string, signature: string): boolean {
  const expected = createHmac("sha512", secret()).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || "");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Asks Paystack what actually happened to a transaction.
 *
 * A webhook says a thing; this confirms it against the source. Worth the extra
 * call because the difference between the two is money.
 */
export async function verifyPaystackTransaction(
  reference: string,
): Promise<{ paid: boolean; amountMinor: number; currency: string }> {
  const res = await fetch(`${API}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret()}` },
    signal: AbortSignal.timeout(12000),
  });
  const body = (await res.json()) as {
    status: boolean;
    data?: { status: string; amount: number; currency: string };
  };
  return {
    paid: Boolean(body.status && body.data?.status === "success"),
    amountMinor: body.data?.amount ?? 0,
    currency: body.data?.currency ?? "NGN",
  };
}
