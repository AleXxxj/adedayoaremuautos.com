import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MARKETS, isMarketCode } from "@/lib/market";
import { listLocations } from "@/lib/repositories/locations";
import { SellIntro } from "@/components/SellIntro";
import { SellForm } from "@/components/SellForm";
import { maxModelYear } from "@/components/sellSteps";
import "@/styles/sell.css";

/**
 * Cached and revalidated, like the other public pages: the only thing read
 * is the showroom's phone number, for "call us" when sending fails.
 */
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  if (!isMarketCode(market)) return {};
  return {
    title: "Sell Us Your Car",
    description:
      "Tell us about your car in 2 minutes. If it's a car we want, we'll call you with an offer to buy it or take it in trade.",
    alternates: {
      canonical: `/${market}/sell`,
      languages: { "en-US": "/us/sell", "en-NG": "/ng/sell" },
    },
  };
}

/**
 * Sell us your car: the owner tells us about it, we look at the details,
 * and if it is a car the business wants, we call with an offer. Nobody is
 * promised an offer. Filed as a trade_in lead in the staff inbox
 * (lib/actions/sell.ts). There is no instant value: that needs a paid
 * market-data feed, and a number nobody has stood behind is worse than none.
 */
export default async function SellPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();
  const market = MARKETS[code];

  const sites = await listLocations(code);
  const contactPhone = sites.find((s) => s.phone)?.phone ?? null;

  return (
    <div className="sell-page">
      <div className="sell-wrap">
        <SellIntro />
        <SellForm market={market} contactPhone={contactPhone} maxYear={maxModelYear(code)} />
      </div>
    </div>
  );
}
