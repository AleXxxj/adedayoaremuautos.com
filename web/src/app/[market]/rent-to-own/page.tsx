import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode } from "@/lib/market";
import { listTiers } from "@/lib/repositories/tiers";
import { listLocations, formatPhone } from "@/lib/repositories/locations";
import { formatMoney, money, toMajor } from "@/lib/money";
import { pathToOwnership } from "@/lib/rentToOwn";
import { RentToOwnCalculator } from "@/components/RentToOwnCalculator";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  if (!isMarketCode(market)) return {};
  return {
    title: "Rent to Own — Adedayo Aremu Autos",
    description:
      "Hire a vehicle by the day or the week. Every payment counts towards owning it. When your rent reaches the agreed total, the car is yours.",
    alternates: {
      canonical: `/${market}/rent-to-own`,
      languages: { "en-US": "/us/rent-to-own", "en-NG": "/ng/rent-to-own" },
    },
  };
}

const STEPS = [
  {
    icon: "fas fa-car-side",
    title: "Choose a category",
    body: "Pick the class of vehicle that suits you. Each one has its own daily and weekly rate, and its own total to own.",
  },
  {
    icon: "fas fa-calendar-days",
    title: "Drive it as a rental",
    body: "Hire by the day or the week, exactly as you would any hire car. Insured, maintained, and yours to use.",
  },
  {
    icon: "fas fa-arrow-trend-up",
    title: "Every payment counts",
    body: "Your rent accumulates against the total for that category. Nothing is wasted, and nothing is separate.",
  },
  {
    icon: "fas fa-key",
    title: "Then it is yours",
    body: "Reach the total and ownership transfers. No balloon payment, no final purchase price, no obligation to continue before then.",
  },
];

export default async function RentToOwnPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();
  const market = MARKETS[code];

  const [tiers, sites] = await Promise.all([listTiers(code), listLocations(code)]);
  const tel = sites[0]?.phone ? formatPhone(sites[0].phone) : null;

  const fmt = (minor: number) => formatMoney(money(minor, market.currency), market.locale);

  const owning = tiers.filter((t) => t.ownershipThresholdMinor != null);
  const cheapest = owning.length
    ? owning.reduce((a, b) => (a.dailyMinor <= b.dailyMinor ? a : b))
    : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: "Rent to own vehicle",
    provider: { "@type": "AutoDealer", name: "Adedayo Aremu Autos" },
    areaServed: market.name,
    ...(cheapest
      ? {
          offers: {
            "@type": "Offer",
            price: toMajor(money(cheapest.dailyMinor, cheapest.currency)),
            priceCurrency: cheapest.currency,
            description: `From ${fmt(cheapest.dailyMinor)} per day, ownership at ${fmt(cheapest.ownershipThresholdMinor!)}`,
          },
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="page-header page-header--rentals">
        <div className="page-header-content">
          <h1>
            Rent to <span>Own</span>
          </h1>
          <p>
            Drive it first. Every payment counts towards owning it.
          </p>
        </div>
      </div>

      {tiers.length === 0 ? (
        /* Nigeria has no tiers, because a threshold in naira is not something
           the business has agreed to. Say that plainly rather than converting
           a dollar figure and presenting it as an offer. */
        <div className="rto-section">
          <EmptyState
            icon="fas fa-key"
            eyebrow={`${market.name}`}
            title="Rent to Own is opening in the United States first"
            body="We are running the programme from Greensboro to begin with. Daily and weekly hire is available here now, and we will tell you the moment rent to own reaches this market."
            actions={[
              { href: `/${code}/rentals`, label: "See hire options", icon: "fas fa-car", primary: true },
              { href: "/us/rent-to-own", label: "View the US programme", icon: "fas fa-arrow-right" },
            ]}
          />
        </div>
      ) : (
        <>
          <div className="rto-intro">
            <p className="intro-text">
              {cheapest ? (
                <>
                  Hire from{" "}
                  <span className="highlight">{fmt(cheapest.dailyMinor)} a day</span>. When
                  your rent reaches{" "}
                  <span className="highlight">
                    {fmt(cheapest.ownershipThresholdMinor!)}
                  </span>
                  , the vehicle is yours to keep.
                </>
              ) : (
                <>
                  Hire by the day or the week, and every payment counts towards
                  owning the vehicle outright.
                </>
              )}
            </p>
          </div>

          <div className="rto-section">
            <div className="section-title">
              <h2>
                How It <span>Works</span>
              </h2>
              <p>No credit application, no balloon payment, no obligation to continue.</p>
            </div>

            <div className="rto-steps">
              {STEPS.map((s, i) => (
                <div className="rto-step" key={s.title}>
                  <span className="rto-step-index">{String(i + 1).padStart(2, "0")}</span>
                  <i className={s.icon} aria-hidden="true" />
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rto-section rto-section--tiers">
            <div className="section-title">
              <h2>
                Choose Your <span>Category</span>
              </h2>
              <p>Each category has its own rates and its own total to own.</p>
            </div>

            <div className="rto-tiers">
              {tiers.map((t) => {
                const path = pathToOwnership(t);
                return (
                  <div className="rto-tier" key={t.slug}>
                    <div className="rto-tier-head">
                      <h3>{t.name}</h3>
                      {t.tagline && <p>{t.tagline}</p>}
                    </div>

                    <div className="rto-tier-rates">
                      <div>
                        <span className="rto-rate">{fmt(t.dailyMinor)}</span>
                        <span className="rto-per">per day</span>
                      </div>
                      {t.weeklyMinor != null && (
                        <div>
                          <span className="rto-rate">{fmt(t.weeklyMinor)}</span>
                          <span className="rto-per">per week</span>
                        </div>
                      )}
                    </div>

                    {t.ownershipThresholdMinor != null && path ? (
                      <div className="rto-tier-own">
                        <span className="rto-own-label">Yours once you have paid</span>
                        <span className="rto-own-amount">
                          {fmt(t.ownershipThresholdMinor)}
                        </span>
                        {/* The honest figure, not the daily rate multiplied
                            out. The weekly rate is cheaper, so the engine
                            charges it — which means more days of use for the
                            same money, and a longer path than a naive
                            division suggests. */}
                        <span className="rto-own-time">
                          about {Math.round(path.days / 7)} weeks of continuous
                          hire ({path.days} days)
                        </span>
                      </div>
                    ) : (
                      <div className="rto-tier-own rto-tier-own--hire">
                        <span className="rto-own-label">Hire only</span>
                        <span className="rto-own-time">
                          This category is not on the ownership programme.
                        </span>
                      </div>
                    )}

                    {/* Leads to the cars in this category, not to a blank
                        message box. The choice of vehicle is the decision. */}
                    <Link
                      href={`/${code}/rent-to-own/${t.slug}`}
                      className="btn btn-primary"
                    >
                      <i className="fas fa-key" /> See {t.name} vehicles
                    </Link>
                  </div>
                );
              })}
            </div>

            {/* Said out loud rather than left as a gap: the owner is still
                setting the remaining categories, and an incomplete price list
                with no explanation reads as a broken page. */}
            {tiers.length < 4 && (
              <p className="rto-more">
                <i className="fas fa-circle-info" /> More categories — Comfort,
                Premium and First Class — are being priced now. Ask us and we
                will tell you where they will land.
              </p>
            )}
          </div>

          {owning.length > 0 && (
            <div className="rto-section rto-section--calc" id="calculator">
              <div className="section-title">
                <h2>
                  When Is It <span>Mine?</span>
                </h2>
                <p>The same arithmetic we invoice with. Change the pattern and see.</p>
              </div>

              <RentToOwnCalculator tiers={tiers} locale={market.locale} />
            </div>
          )}

          {/* Required by state rental-purchase law in the US, and simply
              honest everywhere else. The total is derived from the tier, so
              the page and the agreement cannot state different figures. */}
          <div className="rto-section rto-disclosure">
            <h3>
              <i className="fas fa-scale-balanced" /> What you are agreeing to
            </h3>
            <ul>
              <li>
                This is a rental-purchase arrangement. You are hiring the
                vehicle, and ownership transfers only when the total rent for
                your category has been paid in full.
              </li>
              {owning.map((t) => (
                <li key={t.slug}>
                  <strong>{t.name}:</strong> {fmt(t.dailyMinor)} per day
                  {t.weeklyMinor != null && <> or {fmt(t.weeklyMinor)} per week</>}.
                  Total of all payments to acquire ownership:{" "}
                  <strong>{fmt(t.ownershipThresholdMinor!)}</strong>.
                </li>
              ))}
              <li>
                You may stop at any time. If you do, you have hired a vehicle
                and owe nothing further — but rent already paid is not
                refunded.
              </li>
              <li>
                Deposits are separate from rent and do not count towards
                ownership. They are returned when the vehicle is.
              </li>
              <li>
                The vehicle remains ours, insured and maintained under the hire
                agreement, until ownership transfers.
              </li>
            </ul>
            <p className="rto-disclosure-note">
              Full terms are set out in the{" "}
              <Link href={`/${code}/rental-policy`}>rental policy</Link> and in
              the agreement you sign. Figures on this page are the current
              published rates.
            </p>
          </div>

          <div className="rto-cta">
            <h2>
              Ready to <span>Start Driving?</span>
            </h2>
            <p>
              Tell us which category suits you and we will confirm availability
              and the paperwork.
            </p>
            <div className="rto-cta-actions">
              <Link href={`/${code}/contact?type=rent_to_own`} className="btn btn-primary">
                <i className="fas fa-paper-plane" /> Enquire about Rent to Own
              </Link>
              {tel && (
                <a href={`tel:${sites[0].phone}`} className="btn btn-outline">
                  <i className="fas fa-phone-alt" /> {tel}
                </a>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
