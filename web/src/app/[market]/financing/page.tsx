import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { MARKETS, isMarketCode } from "@/lib/market";
import { FINANCE_STEPS, ELIGIBILITY, FINANCE_NOTE } from "@/content/site";
import { listInventory } from "@/lib/repositories/vehicles";
import { listLocations, formatPhone } from "@/lib/repositories/locations";
import { toMajor, money } from "@/lib/money";
import {
  LegacyFinanceCalculator,
  LegacyFinanceApplication,
} from "@/components/LegacyFinance";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  return {
    title: "Car Financing — Adedayo Aremu Autos",
    description:
      market === "us"
        ? "In-house vehicle financing in Greensboro, North Carolina. Work out a payment, then apply."
        : "Flexible instalment plans on quality vehicles. Work out a payment, then apply.",
    alternates: {
      canonical: `/${market}/financing`,
      languages: { "en-US": "/us/financing", "en-NG": "/ng/financing" },
    },
  };
}

/** Icons matching the original's requirement cards, keyed by what they cover. */
const REQUIREMENT_ICONS: Record<string, string> = {
  "Valid ID": "fas fa-id-card",
  "Valid driver's licence": "fas fa-id-card",
  "Proof of income": "fas fa-file-invoice",
  "Bank verification": "fas fa-university",
  "Down payment": "fas fa-money-bill",
  "Contact details": "fas fa-phone",
  "Proof of residence": "fas fa-home",
  "Proof of address": "fas fa-home",
};

export default async function FinancingPage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string }>;
  searchParams: Promise<{ vehicle?: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();
  const market = MARKETS[code];
  const { vehicle: vehicleSlug } = await searchParams;

  const [{ vehicles: stock }, sites, vehicleRow] = await Promise.all([
    listInventory(code, { limit: 24 }),
    listLocations(code),
    vehicleSlug
      ? db
          .select()
          .from(vehicles)
          .where(and(eq(vehicles.marketCode, code), eq(vehicles.slug, vehicleSlug)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const vehicle = vehicleRow[0];
  const tel = sites[0]?.phone ? formatPhone(sites[0].phone) : null;

  // The calculator opens on a real number: the vehicle being applied for if
  // there is one, otherwise the median price of what is actually in stock. The
  // original hardcoded ₦5,000,000 whether or not the dealership had ever sold
  // a car at that price.
  const priced = stock
    .map((v) => v.priceMinor)
    .filter((p): p is number => typeof p === "number")
    .sort((a, b) => a - b);

  const defaultPriceMinor =
    vehicle?.priceMinor ??
    (priced.length ? priced[Math.floor(priced.length / 2)] : null);

  const defaultPriceMajor = defaultPriceMinor
    ? toMajor(money(defaultPriceMinor, market.currency))
    : market.code === "us"
      ? 20_000
      : 10_000_000;

  const requirements = ELIGIBILITY[code];

  return (
    <>
      <div className="page-header page-header--financing">
        <div className="page-header-content">
          <h1>
            Car <span>Financing</span>
          </h1>
          <p>Own your dream car with flexible, transparent payment plans</p>
        </div>
      </div>

      <div className="intro-section">
        {/* The original advertised "as low as 30% down payment" in both
            markets. That is the Nigerian policy the owner set; no US deposit
            percentage has been given, so the US copy does not claim one. */}
        <p className="intro-text">
          {code === "ng" ? (
            <>
              We make car ownership easy with transparent financing options.
              Drive your dream car today with as low as{" "}
              <span className="highlight">30% down payment</span> and flexible
              terms that fit your budget.
            </>
          ) : (
            <>
              We arrange financing in-house, so you deal with us directly rather
              than being passed between offices. Terms run from{" "}
              <span className="highlight">
                {market.financing.termMonths[0]} to{" "}
                {market.financing.termMonths.at(-1)} months
              </span>
              , and your down payment is agreed with you against the vehicle and
              the terms.
            </>
          )}
        </p>
      </div>

      <div className="steps-section">
        <div className="section-title">
          <h2>
            How It Works in <span>3 Simple Steps</span>
          </h2>
          <p>Quick, transparent, and hassle-free financing process</p>
        </div>

        <div className="steps-grid">
          {FINANCE_STEPS.map((s, i) => (
            <div className="step-card" key={s.title}>
              <div className="step-number">{i + 1}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="eligibility-section">
        <div className="section-title">
          <h2>
            Eligibility <span>Requirements</span>
          </h2>
          <p>Simple criteria to qualify for financing</p>
        </div>

        <div className="eligibility-grid">
          {requirements.map((r) => (
            <div className="requirement-card" key={r.title}>
              <i className={REQUIREMENT_ICONS[r.title] ?? "fas fa-check"} />
              <div>
                <h4>{r.title}</h4>
                <p>{r.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* The original's plans table published four fixed rates — 5%, 8%, 12%,
          15% — against a ₦5,000,000 car, with monthly figures that did not
          follow from them. No rate card exists, so rather than reprint numbers
          nobody has to honour, the terms on offer are listed and the payment
          comes from the calculator below on a rate you have actually been
          quoted. Give us the rate card and this becomes a table again. */}
      <div className="plans-section">
        <div className="section-title">
          <h2>
            Available <span>Financing Terms</span>
          </h2>
          <p>Choose the term that suits your budget</p>
        </div>

        <div className="plans-table-container">
          <table className="plans-table">
            <thead>
              <tr>
                <th>Duration</th>
                <th>Down Payment</th>
                <th>{market.financing.quotesApr ? "APR" : "Interest Rate"}</th>
                <th>Monthly Payment</th>
              </tr>
            </thead>
            <tbody>
              {market.financing.termMonths.map((t) => (
                <tr key={t}>
                  <td>
                    <strong>{t} Months</strong>
                  </td>
                  <td className="down-payment">
                    {code === "ng" ? "From 30%" : "Agreed on application"}
                  </td>
                  <td>On approval</td>
                  <td className="amount">
                    <Link href="#calculator">Calculate</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="calculator-section" id="calculator">
        <div className="section-title">
          <h2>
            Finance <span>Calculator</span>
          </h2>
          <p>Estimate your monthly payments instantly</p>
        </div>

        <LegacyFinanceCalculator
          market={market}
          defaultPriceMajor={defaultPriceMajor}
          note={FINANCE_NOTE[code]}
        />
      </div>

      <div className="application-section">
        <div className="section-title">
          <h2>
            Apply for <span>Financing</span>
          </h2>
          <p>Fill out the form below and we&rsquo;ll get back to you within 24 hours</p>
        </div>

        {/* Stated where the missing fields were, so it reads as a deliberate
            choice rather than an oversight. */}
        <p className="application-privacy">
          <i className="fas fa-lock" /> We do not ask for your{" "}
          {code === "ng" ? "BVN" : "Social Security Number"}, bank details or ID
          number on this form. Identity is verified in person when the paperwork
          is drawn up. Anyone asking for those numbers by web form or message is
          not us.
        </p>

        <LegacyFinanceApplication
          market={market}
          vehicleSlug={vehicle?.slug}
          vehicleLabel={
            vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : undefined
          }
          phone={tel}
        />
      </div>
    </>
  );
}
