import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode, formatDistance } from "@/lib/market";
import { getVehicleBySlug } from "@/lib/repositories/vehicles";
import { PaymentDisplay } from "@/components/PaymentDisplay";
import { requiresBuyersGuide } from "@/lib/compliance/disclosures";
import { formatMoney, money } from "@/lib/money";
import { mediaUrl } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string; slug: string }>;
}): Promise<Metadata> {
  const { market: code, slug } = await params;
  if (!isMarketCode(code)) return {};
  const vehicle = await getVehicleBySlug(code, slug);
  if (!vehicle) return {};

  const market = MARKETS[code];
  const title = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");

  return {
    title: `${title} — Adedayo Aremu Autos`,
    description:
      vehicle.headline ??
      `${vehicle.condition} ${title} available at Adedayo Aremu Autos.`,
    alternates: {
      canonical: `/${code}/inventory/${slug}`,
      // Tells Google these are regional variants, not duplicate content.
      languages: {
        "en-US": `/us/inventory/${slug}`,
        "en-NG": `/ng/inventory/${slug}`,
      },
    },
    openGraph: {
      title,
      images: vehicle.images[0] ? [mediaUrl(vehicle.images[0].storageKey)] : [],
      locale: market.locale,
    },
  };
}

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ market: string; slug: string }>;
}) {
  const { market: code, slug } = await params;
  if (!isMarketCode(code)) notFound();

  const market = MARKETS[code];
  const vehicle = await getVehicleBySlug(code, slug);
  if (!vehicle) notFound();

  const title = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");

  const price =
    vehicle.priceMinor != null
      ? money(vehicle.priceMinor, market.currency)
      : null;

  /* schema.org Vehicle markup — this is what makes a listing eligible for
     Google's vehicle results, and it is the same structured data the
     syndication feeds will be built from. */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    name: title,
    vehicleModelDate: String(vehicle.year),
    brand: { "@type": "Brand", name: vehicle.make },
    model: vehicle.model,
    ...(vehicle.vin ? { vehicleIdentificationNumber: vehicle.vin } : {}),
    ...(vehicle.mileage != null
      ? {
          mileageFromOdometer: {
            "@type": "QuantitativeValue",
            value: vehicle.mileage,
            unitCode: market.distanceUnit === "mi" ? "SMI" : "KMT",
          },
        }
      : {}),
    ...(vehicle.transmission ? { vehicleTransmission: vehicle.transmission } : {}),
    ...(vehicle.fuelType ? { fuelType: vehicle.fuelType } : {}),
    ...(vehicle.exteriorColor ? { color: vehicle.exteriorColor } : {}),
    ...(price
      ? {
          offers: {
            "@type": "Offer",
            price: (price.minor / 100).toFixed(2),
            priceCurrency: market.currency,
            availability:
              vehicle.status === "available"
                ? "https://schema.org/InStock"
                : "https://schema.org/LimitedAvailability",
          },
        }
      : {}),
  };

  const spec: [string, string | null][] = [
    [market.vehicleIdLabel, vehicle.vin ?? vehicle.chassisNo],
    ["Condition", vehicle.condition],
    ["Mileage", vehicle.mileage != null ? formatDistance(vehicle.mileage, market) : null],
    ["Transmission", vehicle.transmission],
    ["Fuel", vehicle.fuelType],
    ["Drivetrain", vehicle.drivetrain],
    ["Engine", vehicle.engine],
    ["Exterior", vehicle.exteriorColor],
    ["Interior", vehicle.interiorColor],
    ["Body", vehicle.bodyStyle],
    ["Stock no.", vehicle.stockNumber],
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className="mb-6 text-sm text-[var(--text-muted)]">
        <Link href={`/${code}/inventory`} className="hover:text-[var(--link)]">
          ← Back to inventory
        </Link>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]">
            {vehicle.images[0] ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={mediaUrl(vehicle.images[0].storageKey)}
                alt={title}
                className="aspect-[4/3] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center text-[var(--text-muted)]">
                Photography coming soon
              </div>
            )}
          </div>

          {vehicle.images.length > 1 && (
            <div className="mt-3 grid grid-cols-5 gap-3">
              {vehicle.images.slice(1, 6).map((img) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={img.id}
                  src={mediaUrl(img.storageKey)}
                  alt={img.alt ?? title}
                  className="aspect-square w-full rounded-lg border border-[var(--border-subtle)] object-cover"
                  loading="lazy"
                />
              ))}
            </div>
          )}

          {vehicle.description && (
            <section className="mt-8">
              <h2 className="mb-3 text-lg font-semibold">About this vehicle</h2>
              <p className="whitespace-pre-line leading-relaxed text-[var(--text-secondary)]">
                {vehicle.description}
              </p>
            </section>
          )}

          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold">Specification</h2>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
              {spec
                .filter(([, v]) => v)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[var(--text-muted)]">{label}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
            </dl>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6">
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--accent-400)]">
              {vehicle.condition}
            </span>
            <h1 className="mt-2 text-2xl font-bold leading-tight">{title}</h1>

            <div className="mt-5 border-t border-[var(--border-subtle)] pt-5">
              {price ? (
                <PaymentDisplay price={price} market={market} size="detail" />
              ) : (
                <span className="text-xl font-semibold text-[var(--text-secondary)]">
                  Price on request
                </span>
              )}
            </div>

            <div className="mt-6 space-y-3">
              <Link
                href={`/${code}/contact?vehicle=${vehicle.slug}`}
                className="block rounded-lg bg-[var(--cta-bg)] py-3 text-center font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)]"
              >
                Enquire about this vehicle
              </Link>
              <Link
                href={`/${code}/contact?vehicle=${vehicle.slug}&type=test_drive`}
                className="block rounded-lg border border-[var(--border-strong)] py-3 text-center font-medium hover:bg-[var(--surface-2)]"
              >
                Book a test drive
              </Link>
            </div>

            {vehicle.historyReportUrl && (
              <a
                href={vehicle.historyReportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 block text-center text-sm text-[var(--link)] hover:underline"
              >
                View vehicle history report
              </a>
            )}

            {requiresBuyersGuide(market, vehicle.condition) && (
              <p className="mt-5 border-t border-[var(--border-subtle)] pt-4 text-[11px] leading-snug text-[var(--text-muted)]">
                An FTC Buyers Guide is displayed on this vehicle at our
                Greensboro location and forms part of the sale contract. It
                overrides any contrary provision in the contract of sale.
              </p>
            )}

            {vehicle.wasPriceMinor != null && price && (
              <p className="mt-4 text-sm text-[var(--text-muted)]">
                Previously{" "}
                <s>
                  {formatMoney(
                    money(vehicle.wasPriceMinor, market.currency),
                    market.locale,
                  )}
                </s>
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
