import "server-only";
import type { MarketCode } from "@/lib/market";

/**
 * Taking money, in two countries.
 *
 * Two providers rather than one because Stripe does not settle to Nigerian
 * bank accounts and Paystack does not serve the United States — this is not a
 * preference that can be simplified away, it is the reason the abstraction
 * exists at all.
 *
 * Both are used the same way and it is the only way either will be used: the
 * customer is sent to a page the provider hosts, pays there, and comes back.
 * No card number, expiry or CVC ever reaches this application, which keeps the
 * entire PCI surface with the people who are equipped for it. A form on this
 * site that collected card details would be a different business with
 * different obligations, and would be built by somebody else.
 */

export type ProviderName = "stripe" | "paystack";

/** Which processor serves a market. Not configurable: it is a fact about them. */
export function providerFor(market: MarketCode): ProviderName {
  return market === "us" ? "stripe" : "paystack";
}

export interface CheckoutRequest {
  /** Our booking, carried through so the webhook can find its way home. */
  bookingId: string;
  market: MarketCode;
  /** Minor units — cents or kobo — as everything in this codebase is. */
  amountMinor: number;
  currency: string;
  /** Shown on the provider's page so the customer knows what they are paying. */
  description: string;
  customerEmail?: string | null;
  /** Where the provider returns them afterwards. */
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  /** Where to send the customer. */
  url: string;
  /** The provider's id for this attempt, stored so a webhook can be matched. */
  reference: string;
}

export class PaymentError extends Error {
  constructor(
    message: string,
    /** True when the customer could reasonably try again. */
    readonly retryable = true,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

/** Whether a provider has been given keys. Used to hide what cannot work. */
export function providerConfigured(name: ProviderName): boolean {
  return name === "stripe"
    ? Boolean(process.env.STRIPE_SECRET_KEY?.trim())
    : Boolean(process.env.PAYSTACK_SECRET_KEY?.trim());
}

/**
 * Paystack takes the customer's email as a required field and will refuse a
 * transaction without one. Stripe does not. Rather than make email mandatory
 * on a Nigerian booking form — which would cost real bookings — this is
 * checked before a session is attempted so the customer is told plainly.
 */
export function checkoutRequirements(
  market: MarketCode,
  email: string | null | undefined,
): string | null {
  if (providerFor(market) === "paystack" && !email?.trim()) {
    return "An email address is needed to pay online. Add one above, or submit the request and we will call you back.";
  }
  return null;
}
