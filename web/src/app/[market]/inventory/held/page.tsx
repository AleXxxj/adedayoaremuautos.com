import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import { notifyStaffOfLead } from "@/lib/notify";
import { listLocations, formatPhone } from "@/lib/repositories/locations";
import { dropUnpaidCheckout, getSaleHold, sweepSaleHolds } from "@/lib/saleHolds/core";
import { formatHoldEnd, holdReference } from "@/lib/saleHolds/settings";
import { holdStripe } from "@/lib/saleHolds/stripe";
import { recordPaidHold } from "@/lib/saleHolds/webhook";
import "@/styles/sale-hold.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your hold",
  // One person's deposit: nothing here should be indexed.
  robots: { index: false, follow: false },
};

/**
 * Where Stripe returns a buyer after the deposit's checkout.
 *
 * Like the rental's "paid" page, this reports and never decides on a
 * browser's word. Landing here proves only that somebody followed a link.
 * What it shows is what has been recorded from Stripe.
 *
 * It does one thing the rental page does not. If the hold is still unpaid on
 * our side, it asks Stripe directly about that one checkout, with the
 * server's own key. Stripe's answer is as good as its webhook, so a buyer
 * who paid sees their hold even when the webhook is a few seconds behind,
 * and a checkout the buyer backed out of is closed so it cannot be paid
 * later by mistake.
 */
export default async function SaleHeldPage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string }>;
  searchParams: Promise<{ hold?: string; canceled?: string }>;
}) {
  const { market } = await params;
  if (!isMarketCode(market)) notFound();
  const cfg = MARKETS[market];

  const { hold: id = "", canceled } = await searchParams;
  let found = await getSaleHold(id);
  if (found && found.hold.marketCode !== market) found = null;

  const carHref = found?.car ? `/${market}/inventory/${found.car.slug}` : `/${market}/inventory`;
  const carName = found?.car ? `${found.car.year} ${found.car.make} ${found.car.model}` : "car";
  let backedOut = false;

  if (found) {
    const unpaid = found.hold.status === "checkout" || found.hold.status === "abandoned";
    const ref = found.hold.providerRef;
    if (unpaid && ref) {
      try {
        const checkout = await holdStripe.retrieve(ref);
        if (checkout?.paid && checkout.holdId === found.hold.id) {
          // No revalidate here: a page may not refresh other pages while it
          // renders. The webhook does, and the car's page ends holds itself.
          await recordPaidHold(checkout, { notify: notifyStaffOfLead, stripe: holdStripe });
        } else if (canceled) {
          // Close it at Stripe first. If that fails the checkout may still
          // be payable, so the record stays until Stripe says it expired.
          await holdStripe.expire(ref);
          await dropUnpaidCheckout(found.hold.id, ref);
          backedOut = true;
        }
      } catch (e) {
        console.error(`[sale-hold] could not check ${holdReference(found.hold.id)} with Stripe`, e);
      }
    }
    if (!backedOut) {
      await sweepSaleHolds();
      found = await getSaleHold(id);
    }
  }

  const hold = backedOut ? null : found?.hold;
  const status = hold?.status;
  const amount = hold ? formatMoney(money(hold.amountMinor, cfg.currency), cfg.locale) : null;
  const reference = hold ? holdReference(hold.id) : null;
  const until =
    hold?.heldUntil ? formatHoldEnd(hold.heldUntil, cfg.locale, cfg.timezone) : null;

  const site = (await listLocations(market))[0];
  const phone = site?.phone ?? null;

  const heading =
    backedOut || (canceled && !hold) ? (
      <>Checkout <span>canceled</span></>
    ) : status === "active" ? (
      <>Car <span>held</span></>
    ) : status === "conflict" ? (
      <>Deposit <span>received</span></>
    ) : status === "expired" || status === "released" || status === "completed" ? (
      <>Hold <span>ended</span></>
    ) : hold ? (
      <>Nearly <span>there</span></>
    ) : (
      <>Hold not <span>found</span></>
    );

  return (
    <div className="page-header page-header--rentals">
      <div className="page-header-content">
        <h1>{heading}</h1>
      </div>

      <div className="sh-result">
        {backedOut || (canceled && !hold) ? (
          <p>
            <strong>Nothing was charged.</strong> The car is not held.
          </p>
        ) : !hold ? (
          <p>
            We could not find that hold. If you paid, call us with your receipt.{" "}
            <strong>Please do not pay again.</strong>
          </p>
        ) : status === "active" ? (
          <>
            <p>
              The <strong>{carName}</strong> is held for you.
            </p>
            <dl className="sh-result-card">
              <div>
                <dt>Held until</dt>
                <dd>{until}</dd>
              </div>
              <div>
                <dt>Reference</dt>
                <dd className="sh-ref">{reference}</dd>
              </div>
              <div>
                <dt>Deposit paid</dt>
                <dd>{amount}</dd>
              </div>
            </dl>
            <p>We will call you to set a time. Save your reference.</p>
            <p>
              Buy the car and the {amount} comes off the price. Change your mind and you get it
              back.
            </p>
          </>
        ) : status === "conflict" ? (
          <>
            <p>
              We received your {amount}, but <strong>the car could not be held</strong>. Someone
              else&rsquo;s hold was confirmed first.
            </p>
            <dl className="sh-result-card">
              <div>
                <dt>Reference</dt>
                <dd className="sh-ref">{reference}</dd>
              </div>
            </dl>
            <p>
              We will refund your {amount} in full and call you. Please do not pay again.
            </p>
          </>
        ) : status === "checkout" || status === "abandoned" ? (
          <>
            <dl className="sh-result-card">
              <div>
                <dt>Reference</dt>
                <dd className="sh-ref">{reference}</dd>
              </div>
            </dl>
            <p>
              If you just paid, it can take a moment to come through. Refresh in a few seconds.
              Nothing is charged twice.
            </p>
            <p>If you did not pay, the car is not held.</p>
          </>
        ) : (
          <>
            <p>This hold on the {carName} has ended.</p>
            <dl className="sh-result-card">
              <div>
                <dt>Reference</dt>
                <dd className="sh-ref">{reference}</dd>
              </div>
            </dl>
            <p>Questions about your deposit? Call us with your reference.</p>
          </>
        )}

        <div className="sh-result-actions">
          {phone && hold && (
            <a href={`tel:${phone}`} className="sh-primary">
              <i className="fas fa-phone" aria-hidden="true" />
              Call {formatPhone(phone)}
            </a>
          )}
          <Link href={carHref}>{found?.car ? "Back to the car" : "See cars for sale"}</Link>
        </div>
      </div>
    </div>
  );
}
