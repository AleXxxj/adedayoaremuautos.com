import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode, formatDistance } from "@/lib/market";
import { findTier, listTierVehicles, toOwnershipTier } from "@/lib/repositories/tiers";
import { formatMoney, money } from "@/lib/money";
import { pathToOwnership } from "@/lib/rentToOwn";
import { mediaUrl } from "@/lib/media";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string; tier: string }>;
}): Promise<Metadata> {
  const { market, tier: slug } = await params;
  if (!isMarketCode(market)) return {};
  const tier = await findTier(market, slug);
  if (!tier) return {};

  return {
    title: `${tier.name} Rent to Own — Adedayo Aremu Autos`,
    description:
      tier.tagline ??
      `Vehicles available on our ${tier.name} rent-to-own plan. Every payment counts towards owning the car.`,
    alternates: { canonical: `/${market}/rent-to-own/${tier.slug}` },
  };
}

/**
 * Vehicles inside one rent-to-own category.
 *
 * This page exists because "Start with Economy" used to lead to a blank
 * contact form. Rent to own is a commitment to one specific car for months on
 * end, so which car it is *is* the decision — sending someone to a general
 * message box threw away the only thing they had come to say, and left the
 * salesperson starting the conversation from nothing.
 */
export default async function TierPage({
  params,
}: {
  params: Promise<{ market: string; tier: string }>;
}) {
  const { market: code, tier: slug } = await params;
  if (!isMarketCode(code)) notFound();

  const market = MARKETS[code];
  const tier = await findTier(code, slug);
  if (!tier) notFound();

  const cars = await listTierVehicles(code, tier.id);
  const path = pathToOwnership(toOwnershipTier(tier));
  const fmt = (minor: number) => formatMoney(money(minor, tier.currency), market.locale);

  return (
    <>
      <div className="page-header page-header--rent-to-own">
        <div className="page-header-content">
          <h1>
            {tier.name} <span>Rent to Own</span>
          </h1>
          <p>{tier.tagline ?? "Drive it now. Every payment counts towards owning it."}</p>
        </div>
      </div>

      <div className="rto-section">
        <div className="rto-container">
          <nav className="rto-crumbs">
            <Link href={`/${code}/rent-to-own`}>← All rent-to-own plans</Link>
          </nav>

          {/* The terms restated on the page where the choice is made, so nobody
              has to hold them in their head from the previous screen. */}
          <div className="tier-terms">
            <div className="tier-term">
              <span className="tier-term-value">{fmt(tier.dailyMinor)}</span>
              <span className="tier-term-label">per day</span>
            </div>
            {tier.weeklyMinor != null && (
              <div className="tier-term">
                <span className="tier-term-value">{fmt(tier.weeklyMinor)}</span>
                <span className="tier-term-label">per week</span>
              </div>
            )}
            {tier.ownershipThresholdMinor != null && (
              <div className="tier-term tier-term--own">
                <span className="tier-term-value">{fmt(tier.ownershipThresholdMinor)}</span>
                <span className="tier-term-label">
                  and the car is yours
                  {path ? ` — about ${path.days} days` : ""}
                </span>
              </div>
            )}
          </div>

          {cars.length === 0 ? (
            <EmptyState
              icon="fas fa-car-side"
              title={`No ${tier.name} vehicles listed right now`}
              body="Stock in this category moves quickly. Tell us what you are looking for and we will call you the moment something lands."
              points={[
                `${tier.name} terms are already set, so a car listed here can be applied for the same day.`,
                "We buy to order as well — tell us the make and model you want.",
              ]}
              actions={[
                {
                  href: `/${code}/contact?type=rent_to_own`,
                  label: "Tell us what you want",
                  icon: "fas fa-paper-plane",
                  primary: true,
                },
                {
                  href: `/${code}/rent-to-own`,
                  label: "See the other plans",
                  icon: "fas fa-key",
                },
              ]}
            />
          ) : (
            <>
              <p className="tier-count">
                {cars.length} vehicle{cars.length === 1 ? "" : "s"} available on
                the {tier.name} plan
              </p>

              <div className="cars-grid">
                {cars.map((v) => {
                  const name = [v.year, v.make, v.model, v.trim]
                    .filter(Boolean)
                    .join(" ");
                  const features = Array.isArray(v.features)
                    ? (v.features as string[]).slice(0, 3)
                    : [];

                  return (
                    <div className="car-card" key={v.id}>
                      <div className="car-image">
                        {v.imageKey ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={mediaUrl(v.imageKey)} alt={name} loading="lazy" />
                        ) : (
                          <div className="car-image-placeholder">
                            Photography coming soon
                          </div>
                        )}
                        <span className="car-badge">{v.condition}</span>
                      </div>

                      <div className="car-details">
                        <h3 className="car-title">{name}</h3>

                        <div className="car-specs">
                          {v.mileage != null && (
                            <span>
                              <i className="fas fa-tachometer-alt" />{" "}
                              {formatDistance(v.mileage, market)}
                            </span>
                          )}
                          {v.transmission && (
                            <span>
                              <i className="fas fa-cog" /> {v.transmission}
                            </span>
                          )}
                          {v.fuelType && (
                            <span>
                              <i className="fas fa-gas-pump" /> {v.fuelType}
                            </span>
                          )}
                        </div>

                        {/* The features the customer said they choose a car on. */}
                        {features.length > 0 && (
                          <ul className="car-features">
                            {features.map((f) => (
                              <li key={f}>
                                <i className="fas fa-check" /> {f}
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="car-price car-price--rto">
                          {fmt(tier.weeklyMinor ?? tier.dailyMinor)}
                          <small>
                            {tier.weeklyMinor != null ? " per week" : " per day"}
                          </small>
                        </div>

                        <div className="car-actions">
                          <Link
                            href={`/${code}/rent-to-own/${tier.slug}/apply?vehicle=${v.slug}`}
                            className="btn btn-primary"
                          >
                            <i className="fas fa-key" /> Apply for this car
                          </Link>
                          <Link
                            href={`/${code}/inventory/${v.slug}`}
                            className="btn btn-outline"
                          >
                            Full details
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
