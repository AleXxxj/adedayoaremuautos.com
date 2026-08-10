import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { MARKETS, isMarketCode } from "@/lib/market";
import {
  listLocations,
  summariseHours,
  formatPhone,
  type OpeningHour,
} from "@/lib/repositories/locations";
import {
  CONTACT_EMAIL,
  SALES_EMAIL,
  socialLinks,
  whatsappUrl,
  mapEmbedUrl,
} from "@/lib/contact";
import { LegacyMessageForm } from "@/components/LegacyMessageForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  if (!isMarketCode(market)) return {};
  return {
    title: "Contact Us — Adedayo Aremu Autos",
    description:
      "Talk to us about buying, renting or financing a vehicle. Call, message or send the form and we will reply within 24 hours.",
    alternates: {
      canonical: `/${market}/contact`,
      languages: { "en-US": "/us/contact", "en-NG": "/ng/contact" },
    },
  };
}

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string }>;
  searchParams: Promise<{ vehicle?: string; type?: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();
  const market = MARKETS[code];

  const { vehicle: vehicleSlug, type } = await searchParams;

  const [sites, vehicleRow] = await Promise.all([
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
  const site = sites[0];
  const tel = site?.phone ? formatPhone(site.phone) : null;
  const hours = summariseHours(site?.hours as OpeningHour[] | null, market.locale);
  const wa = whatsappUrl(code);
  const socials = socialLinks(code);

  const addressLines = site
    ? [
        site.addressLine1,
        site.addressLine2,
        [site.city, site.region].filter(Boolean).join(", ") +
          (site.postalCode ? ` ${site.postalCode}` : ""),
      ].filter((l): l is string => Boolean(l && l.trim()))
    : [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    name: "Adedayo Aremu Autos",
    email: CONTACT_EMAIL,
    ...(site
      ? {
          telephone: site.phone ?? undefined,
          address: {
            "@type": "PostalAddress",
            streetAddress: site.addressLine1,
            addressLocality: site.city,
            addressRegion: site.region ?? undefined,
            postalCode: site.postalCode ?? undefined,
            addressCountry: site.country,
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

      <div className="page-header page-header--contact">
        <div className="page-header-content">
          <h1>
            Contact <span>Us</span>
          </h1>
          <p>We&rsquo;re here to help with all your automotive needs</p>
        </div>
      </div>

      <div className="contact-section">
        <div className="contact-grid">
          <div className="contact-info">
            <h2>
              Get in <span>Touch</span>
            </h2>
            <p>
              Have questions? Ready to find your perfect vehicle? Reach out to
              us through any of these channels.
            </p>

            <div className="info-items">
              {/* Every card below is rendered from a real record. The original
                  printed a Lagos address and two phone numbers the business
                  does not hold; a card with nothing behind it is left out
                  rather than filled with a placeholder. */}
              {tel && (
                <div className="info-card">
                  <div className="info-icon">
                    <i className="fas fa-phone-alt" />
                  </div>
                  <div className="info-content">
                    <h3>Phone</h3>
                    <p>
                      <a href={`tel:${site.phone}`}>{tel}</a>
                    </p>
                    {hours && <p>{hours}</p>}
                  </div>
                </div>
              )}

              {wa && (
                <div className="info-card">
                  <div className="info-icon">
                    <i className="fab fa-whatsapp" />
                  </div>
                  <div className="info-content">
                    <h3>WhatsApp</h3>
                    <p>
                      <a href={wa} target="_blank" rel="noopener noreferrer">
                        Message us on WhatsApp
                      </a>
                    </p>
                    <p>Quickest response time</p>
                  </div>
                </div>
              )}

              <div className="info-card">
                <div className="info-icon">
                  <i className="fas fa-envelope" />
                </div>
                <div className="info-content">
                  <h3>Email</h3>
                  <p>
                    <a href={`mailto:${site?.email ?? CONTACT_EMAIL}`}>
                      {site?.email ?? CONTACT_EMAIL}
                    </a>
                  </p>
                  <p>
                    <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>
                  </p>
                </div>
              </div>

              {site && (
                <div className="info-card">
                  <div className="info-icon">
                    <i className="fas fa-map-marker-alt" />
                  </div>
                  <div className="info-content">
                    <h3>Address</h3>
                    {addressLines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                </div>
              )}

              {hours && (
                <div className="info-card">
                  <div className="info-icon">
                    <i className="fas fa-clock" />
                  </div>
                  <div className="info-content">
                    <h3>Business Hours</h3>
                    <p>{hours}</p>
                    <p>Sunday: by appointment only</p>
                  </div>
                </div>
              )}

              {/* Nigeria has no showroom record yet, so the cards above thin
                  out to email alone. Say what happens next instead of leaving
                  the column looking broken. */}
              {!site && (
                <div className="info-card">
                  <div className="info-icon">
                    <i className="fas fa-headset" />
                  </div>
                  <div className="info-content">
                    <h3>Call Back</h3>
                    <p>
                      Send the form and we will call you back the same working
                      day.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <LegacyMessageForm
            market={market}
            defaultType={type ?? "contact"}
            vehicleSlug={vehicle?.slug}
            vehicleLabel={
              vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : undefined
            }
            phone={tel}
          />
        </div>
      </div>

      {site && (
        <div className="map-section">
          <div className="map-container">
            <h2>
              Visit Our <span>Showroom</span>
            </h2>
            <div className="map-embed">
              <iframe
                title={`Map to ${site.name}`}
                src={mapEmbedUrl(
                  [site.addressLine1, site.city, site.region, site.postalCode, site.country]
                    .filter(Boolean)
                    .join(", "),
                )}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </div>
      )}

      {socials.length > 0 && (
        <div className="social-section">
          <h2>
            Connect With <span>Us</span>
          </h2>
          <div className="social-grid">
            {socials.map((s) => (
              <a
                key={s.key}
                href={s.url}
                className="social-icon"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
              >
                <i className={s.icon} />
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
