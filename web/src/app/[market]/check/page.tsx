import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode } from "@/lib/market";
import { VinCheck } from "@/components/VinCheck";
import "@/styles/vin-check.css";

/**
 * Check any car: a free VIN check from US government data.
 *
 * US only. It decodes a VIN with NHTSA and shows the model's recalls, owner
 * complaints and crash-test stars, with links to check that exact car's open
 * recalls, theft records and title history elsewhere. Nigeria uses chassis
 * numbers, which NHTSA does not decode, so that market gets no page.
 *
 * Every claim on the page says where it comes from and what it can't tell
 * you — model-level recalls are not this car's open recalls, complaints are
 * reports and not proven defects — because this is advice a buyer acts on.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  if (market !== "us") return {};
  return {
    title: "Check Any Car: Free VIN Check",
    description:
      "Free VIN check from US government data: what the car is, and the recalls, owner complaints and crash-test stars for its model. From Adedayo Aremu Autos in Greensboro, NC.",
    alternates: { canonical: "/us/check" },
  };
}

export default async function CheckPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code) || code !== "us") notFound();
  const market = MARKETS[code];

  return (
    <>
      <div className="page-header">
        <div className="page-header-content">
          <h1>
            Check <span>any car</span>
          </h1>
          <p>Free. Type a VIN to see the car, its recalls and its safety stars.</p>
        </div>
      </div>

      <div className="vc-page">
        <VinCheck market={code} locale={market.locale} contactHref={`/${code}/contact`} />
      </div>
    </>
  );
}
