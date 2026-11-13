import Link from "next/link";
import type { Metadata } from "next";
import { confirmPriceAlertAction, stopPriceAlertAction } from "@/lib/actions/priceAlerts";
import { carName, priceAlertsEnabled } from "@/lib/alerts/rules";
import { findByToken } from "@/lib/alerts/store";
import { isMarketCode } from "@/lib/market";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Price alerts",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Where the links in a price-alert email land: one car, one button.
 *
 *   /alerts?confirm=<token>   "Yes, tell me if the price drops"
 *   /alerts?stop=<token>      "Stop price alerts"
 *
 * No login. The token is random and names nothing: it finds one row.
 *
 * Opening the link changes nothing. The button does. Mail scanners and link
 * previews open every link in a message, and a link that acted by itself
 * would let one confirm an address its owner never confirmed, or stop an
 * alert the reader still wants.
 *
 * Styled with utilities, like /unsubscribe: this page sits outside the
 * market layout, so the site's own stylesheet is not loaded here.
 */
export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ confirm?: string; stop?: string; done?: string; m?: string; car?: string }>;
}) {
  const sp = await searchParams;

  const carHref =
    sp.m && isMarketCode(sp.m) && sp.car && /^[a-z0-9-]{1,120}$/.test(sp.car)
      ? `/${sp.m}/inventory/${sp.car}`
      : null;

  let title = "This link is not valid";
  let body = "It may have been used already, or cut short when it was copied. Nothing has changed.";
  let form: { action: (formData: FormData) => Promise<void>; token: string; label: string } | null = null;
  let car: string | null = null;

  if (sp.done === "on") {
    title = "Price alert is on";
    body = "We email you once if this car's price drops. Every email has a stop link.";
  } else if (sp.done === "off") {
    title = "Price alerts stopped";
    body = "We removed you from this car's list. You will not hear about it again.";
  } else if (sp.done === "gone") {
    title = "You are not on this list";
    body = "This alert was already stopped. Nothing more will be sent.";
  } else if (sp.confirm && priceAlertsEnabled()) {
    const found = await findByToken("confirm", sp.confirm);
    if (found && !found.confirmed) {
      car = carName(found);
      title = "Turn on your price alert?";
      body = "One email if this car's price drops. Nothing else.";
      form = { action: confirmPriceAlertAction, token: sp.confirm, label: "Yes, tell me" };
    }
  } else if (sp.stop) {
    const found = await findByToken("stop", sp.stop);
    if (found) {
      car = carName(found);
      title = "Stop price alerts for this car?";
      body = "We delete your details for this car. You can ask again any time.";
      form = { action: stopPriceAlertAction, token: sp.stop, label: "Stop price alerts" };
    } else {
      title = "You are not on this list";
      body = "This alert was already stopped. Nothing more will be sent.";
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#070c0a] px-4 py-16 text-[#e8e8e8]">
      <div className="w-full max-w-md rounded-[20px] border border-[#262626] bg-[#101010] p-6 text-center sm:p-8">
        {car && <p className="text-sm font-semibold text-[#b8beba]">{car}</p>}

        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-white">{title}</h1>
        <p className="mt-3 text-base leading-relaxed text-[#b8beba]">{body}</p>

        {form && (
          <form action={form.action} className="mt-6">
            <input type="hidden" name="token" value={form.token} />
            <button
              type="submit"
              className="min-h-[52px] w-full rounded-full bg-[var(--cta-bg)] px-6 text-base font-bold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {form.label}
            </button>
          </form>
        )}

        <Link
          href={carHref ?? "/us/inventory"}
          className="mt-4 inline-flex min-h-[52px] w-full items-center justify-center rounded-full border border-[#4a4a4a] px-6 text-base font-bold text-[#e8e8e8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {carHref ? "See the car" : "See cars for sale"}
        </Link>
      </div>
    </main>
  );
}
