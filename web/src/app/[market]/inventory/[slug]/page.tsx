import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode, formatDistance } from "@/lib/market";
import { getVehicleBySlug, listInventory } from "@/lib/repositories/vehicles";
import { listLocations, formatPhone } from "@/lib/repositories/locations";
import { formatMoney, money, toMajor, monthlyPayment } from "@/lib/money";
import { mediaUrl } from "@/lib/media";
import { requiresBuyersGuide } from "@/lib/compliance/disclosures";
import { LegacyGallery, LegacyCalculator } from "@/components/LegacyCarDetail";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string; slug: string }>;
}): Promise<Metadata> {
  const { market, slug } = await params;
  if (!isMarketCode(market)) return {};
  const v = await getVehicleBySlug(market, slug);
  if (!v) return {};

  const title = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
  return {
    title: `${title} — Adedayo Aremu Autos`,
    description: v.description ?? `${v.condition} ${title} available now.`,
    alternates: {
      canonical: `/${market}/inventory/${slug}`,
      languages: {
        "en-US": `/us/inventory/${slug}`,
        "en-NG": `/ng/inventory/${slug}`,
      },
    },
    openGraph: {
      title,
      images: v.images[0] ? [mediaUrl(v.images[0].storageKey)] : [],
    },
  };
}

export default async function CarDetailPage({
  params,
}: {
  params: Promise<{ market: string; slug: string }>;
}) {
  const { market: code, slug } = await params;
  if (!isMarketCode(code)) notFound();

  const market = MARKETS[code];
  const v = await getVehicleBySlug(code, slug);
  if (!v) notFound();

  const [{ vehicles: related }, sites] = await Promise.all([
    listInventory(code, { limit: 4 }),
    listLocations(code),
  ]);
  const site = sites[0];

  const title = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
  const price = v.priceMinor != null ? money(v.priceMinor, market.currency) : null;
  const fmt = (m: { minor: number; currency: typeof market.currency }) =>
    formatMoney(m, market.locale);

  // Indicative only, on the market's longest term at zero interest where the
  // market does not quote APR. Never presented as an offer.
  const from =
    price && !market.financing.quotesApr
      ? monthlyPayment(price, 0, market.financing.termMonths.at(-1)!)
      : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    name: title,
    vehicleModelDate: String(v.year),
    brand: { "@type": "Brand", name: v.make },
    model: v.model,
    ...(v.vin ? { vehicleIdentificationNumber: v.vin } : {}),
    ...(v.mileage != null
      ? {
          mileageFromOdometer: {
            "@type": "QuantitativeValue",
            value: v.mileage,
            unitCode: market.distanceUnit === "mi" ? "SMI" : "KMT",
          },
        }
      : {}),
    ...(price
      ? {
          offers: {
            "@type": "Offer",
            price: (price.minor / 100).toFixed(2),
            priceCurrency: market.currency,
            availability:
              v.status === "available"
                ? "https://schema.org/InStock"
                : "https://schema.org/LimitedAvailability",
          },
        }
      : {}),
  };

  const specs: [string, string, string | null][] = [
    ["fa-calendar", "Year", String(v.year)],
    ["fa-tachometer-alt", "Mileage", v.mileage != null ? formatDistance(v.mileage, market) : null],
    ["fa-gas-pump", "Fuel", v.fuelType],
    ["fa-cog", "Transmission", v.transmission],
    ["fa-car-side", "Body", v.bodyStyle],
    ["fa-road", "Drivetrain", v.drivetrain],
    ["fa-palette", "Exterior", v.exteriorColor],
    ["fa-couch", "Interior", v.interiorColor],
    ["fa-fingerprint", market.vehicleIdLabel, v.vin ?? v.chassisNo],
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="breadcrumb">
        <Link href={`/${code}`}>Home</Link> &gt;{" "}
        <Link href={`/${code}/inventory`}>Buy Cars</Link> &gt; <span>{title}</span>
      </div>

      <div className="car-detail-section">
        <div className="car-detail-grid">
          <LegacyGallery
            images={v.images.map((i) => mediaUrl(i.storageKey))}
            alt={title}
          />

          <div className="car-info">
            <h1>
              {v.year} <span>{[v.make, v.model, v.trim].filter(Boolean).join(" ")}</span>
            </h1>

            <div className="key-specs">
              <div className="spec-item">
                <i className="fas fa-calendar" /> {v.year}
              </div>
              {v.mileage != null && (
                <div className="spec-item">
                  <i className="fas fa-tachometer-alt" /> {formatDistance(v.mileage, market)}
                </div>
              )}
              {v.fuelType && (
                <div className="spec-item">
                  <i className="fas fa-gas-pump" /> {v.fuelType}
                </div>
              )}
              {v.transmission && (
                <div className="spec-item">
                  <i className="fas fa-cog" /> {v.transmission}
                </div>
              )}
              {v.seats != null && (
                <div className="spec-item">
                  <i className="fas fa-users" /> {v.seats} Seats
                </div>
              )}
            </div>

            <div className="price-box">
              <div className="cash-price">
                <span className="label">Cash Price</span>
                <span className="value">{price ? fmt(price) : "Price on request"}</span>
              </div>
              {from && (
                <div className="finance-price">
                  <span className="label">Finance from</span>
                  <span className="value">
                    {fmt(from)}/mo
                    <small> over {market.financing.termMonths.at(-1)} months</small>
                  </span>
                </div>
              )}
            </div>

            <div className="inspection-request">
              <Link
                href={`/${code}/contact?vehicle=${v.slug}&type=test_drive`}
                className="btn btn-primary"
              >
                <i className="fas fa-key" /> Book a Test Drive
              </Link>
              <Link
                href={`/${code}/contact?vehicle=${v.slug}`}
                className="btn btn-outline"
              >
                <i className="fas fa-envelope" /> Enquire About This Car
              </Link>
              {site?.phone && (
                <a
                  href={`https://wa.me/${site.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                    `Hello, I'm interested in the ${title}.`,
                  )}`}
                  className="btn btn-outline-light"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <i className="fab fa-whatsapp" /> WhatsApp Us
                </a>
              )}
            </div>

            {v.historyReportUrl && (
              <p style={{ marginTop: 16 }}>
                <a href={v.historyReportUrl} target="_blank" rel="noopener noreferrer">
                  <i className="fas fa-file-contract" /> View vehicle history report
                </a>
              </p>
            )}

            {price && (
              <LegacyCalculator market={market} priceMajor={toMajor(price)} />
            )}
          </div>
        </div>

        {/* ── Overview ─────────────────────────────────────────────────── */}
        {v.description && (
          <div className="section-title" style={{ marginTop: 60 }}>
            <h2>
              Vehicle <span>Overview</span>
            </h2>
          </div>
        )}
        {v.description && (
          <p style={{ maxWidth: 820, margin: "0 auto", textAlign: "center", lineHeight: 1.8 }}>
            {v.description}
          </p>
        )}

        {/* ── Specification ────────────────────────────────────────────── */}
        <div className="section-title" style={{ marginTop: 60 }}>
          <h2>
            Technical <span>Specifications</span>
          </h2>
        </div>
        <div className="features-grid">
          {specs
            .filter(([, , value]) => value)
            .map(([icon, label, value]) => (
              <div className="feature" key={label}>
                <div className="feature-icon">
                  <i className={`fas ${icon}`} />
                </div>
                <h3>{label}</h3>
                <p>{value}</p>
              </div>
            ))}
        </div>

        {requiresBuyersGuide(market, v.condition) && (
          <p
            style={{
              maxWidth: 760,
              margin: "30px auto 0",
              textAlign: "center",
              fontSize: 12,
              lineHeight: 1.6,
              color: "var(--silver-cool)",
            }}
          >
            An FTC Buyers Guide is displayed on this vehicle at our Greensboro
            location and forms part of the sale contract. It overrides any
            contrary provision in the contract of sale.
          </p>
        )}

        {/* ── Related ──────────────────────────────────────────────────── */}
        {related.filter((r) => r.id !== v.id).length > 0 && (
          <div className="related-cars">
            <div className="section-title">
              <h2>
                You May Also <span>Like</span>
              </h2>
            </div>
            <div className="related-grid">
              {related
                .filter((r) => r.id !== v.id)
                .slice(0, 3)
                .map((r) => {
                  const rTitle = [r.year, r.make, r.model, r.trim].filter(Boolean).join(" ");
                  return (
                    <Link
                      href={`/${code}/inventory/${r.slug}`}
                      className="related-card"
                      key={r.id}
                    >
                      <div className="related-image">
                        {r.primaryImage ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={mediaUrl(r.primaryImage)} alt={rTitle} loading="lazy" />
                        ) : (
                          <div className="car-image-placeholder">Photo coming soon</div>
                        )}
                      </div>
                      <div className="related-content">
                        <h4>{rTitle}</h4>
                        <div className="related-price">
                          {r.priceMinor != null
                            ? fmt(money(r.priceMinor, market.currency))
                            : "Price on request"}
                        </div>
                      </div>
                    </Link>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
