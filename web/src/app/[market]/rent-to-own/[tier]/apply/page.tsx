import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode, formatDistance } from "@/lib/market";
import { findTier, findTierVehicle, toOwnershipTier } from "@/lib/repositories/tiers";
import { listLocations } from "@/lib/repositories/locations";
import { formatMoney, money } from "@/lib/money";
import { pathToOwnership } from "@/lib/rentToOwn";
import { mediaUrl } from "@/lib/media";
import { RentToOwnApplication } from "@/components/RentToOwnApplication";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string; tier: string }>;
}): Promise<Metadata> {
  const { market, tier: slug } = await params;
  if (!isMarketCode(market)) return {};
  const tier = await findTier(market, slug);
  return {
    title: tier
      ? `Apply — ${tier.name} Rent to Own`
      : "Apply — Rent to Own",
    // An application form has nothing to offer a search engine, and indexing
    // it competes with the category page that should rank.
    robots: { index: false, follow: true },
  };
}

/**
 * Applying for one specific car on one specific plan.
 *
 * The form states what is being applied for and what it costs before asking
 * for anything, because a rent-to-own application is a commitment measured in
 * months and the terms should not be a page behind the decision.
 */
export default async function ApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string; tier: string }>;
  searchParams: Promise<{ vehicle?: string }>;
}) {
  const { market: code, tier: slug } = await params;
  const { vehicle: vehicleSlug } = await searchParams;
  if (!isMarketCode(code)) notFound();

  const market = MARKETS[code];
  const tier = await findTier(code, slug);
  if (!tier) notFound();

  // A missing or sold vehicle is not a dead end: the application still stands
  // against the category, and the salesperson can offer the nearest match.
  const car = vehicleSlug ? await findTierVehicle(code, tier.id, vehicleSlug) : null;

  const path = pathToOwnership(toOwnershipTier(tier));
  const sites = await listLocations(code);
  const fmt = (minor: number) => formatMoney(money(minor, tier.currency), market.locale);

  const carName = car
    ? [car.year, car.make, car.model, car.trim].filter(Boolean).join(" ")
    : null;

  return (
    <div className="rto-section page-top">
      <div className="rto-container rto-apply">
        <nav className="rto-crumbs">
          <Link href={`/${code}/rent-to-own/${tier.slug}`}>
            ← Back to {tier.name} vehicles
          </Link>
        </nav>

        <div className="rto-apply-grid">
          <aside className="rto-apply-summary">
            <h2>What you are applying for</h2>

            {car ? (
              <div className="rto-apply-car">
                {car.imageKey ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={mediaUrl(car.imageKey)} alt={carName ?? ""} />
                ) : null}
                <div>
                  <strong>{carName}</strong>
                  <span className="rto-apply-specs">
                    {[
                      car.mileage != null ? formatDistance(car.mileage, market) : null,
                      car.transmission,
                      car.fuelType,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </div>
            ) : (
              <p className="rto-apply-nocar">
                {vehicleSlug
                  ? "That vehicle is no longer available, but your application still stands — we will offer you the closest match in this category."
                  : "No particular vehicle chosen yet. Tell us what you are after and we will match you."}
              </p>
            )}

            <dl className="rto-apply-terms">
              <div>
                <dt>Plan</dt>
                <dd>{tier.name}</dd>
              </div>
              {/* Every rate, not just the headline one. An applicant
                  committing for months should see the monthly figure here
                  rather than discover it on the phone. */}
              <div>
                <dt>Daily</dt>
                <dd>{fmt(tier.dailyMinor)}</dd>
              </div>
              {tier.weeklyMinor != null && (
                <div>
                  <dt>Weekly</dt>
                  <dd>{fmt(tier.weeklyMinor)}</dd>
                </div>
              )}
              {tier.monthlyMinor != null && (
                <div>
                  <dt>Monthly</dt>
                  <dd>{fmt(tier.monthlyMinor)}</dd>
                </div>
              )}
              {tier.depositMinor > 0 && (
                <div>
                  <dt>Deposit</dt>
                  <dd>{fmt(tier.depositMinor)}</dd>
                </div>
              )}
              {tier.ownershipThresholdMinor != null && (
                <div>
                  <dt>Yours after</dt>
                  <dd>
                    {fmt(tier.ownershipThresholdMinor)} in rent
                    {path ? ` — about ${path.days} days` : ""}
                  </dd>
                </div>
              )}
            </dl>

            <p className="rto-apply-note">
              Applying costs nothing and commits you to nothing. We confirm the
              vehicle is still available, agree a start date, and only then is
              there anything to sign.
            </p>
          </aside>

          <RentToOwnApplication
            market={market}
            tierSlug={tier.slug}
            tierName={tier.name}
            vehicleSlug={car?.slug}
            vehicleLabel={carName}
            phone={sites[0]?.phone ?? null}
          />
        </div>
      </div>
    </div>
  );
}
