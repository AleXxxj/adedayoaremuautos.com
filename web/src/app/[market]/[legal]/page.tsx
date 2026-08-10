import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, MARKET_CODES, isMarketCode } from "@/lib/market";
import { LEGAL_PAGES, LEGAL_SLUGS, LEGAL_LAST_UPDATED } from "@/content/legal";
import {
  listLocations,
  summariseHours,
  formatPhone,
  type OpeningHour,
} from "@/lib/repositories/locations";
import { CONTACT_EMAIL, whatsappUrl } from "@/lib/contact";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return MARKET_CODES.flatMap((market) =>
    LEGAL_SLUGS.map((legal) => ({ market, legal })),
  );
}

/** Plain text title, for metadata and the breadcrumb. */
const plain = (html: string) => html.replace(/<[^>]+>/g, "");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string; legal: string }>;
}): Promise<Metadata> {
  const { market, legal } = await params;
  const page = LEGAL_PAGES[legal];
  if (!isMarketCode(market) || !page) return {};
  return {
    title: `${plain(page.title)} — Adedayo Aremu Autos`,
    description: page.subtitle,
    alternates: {
      canonical: `/${market}/${legal}`,
      languages: {
        "en-US": `/us/${legal}`,
        "en-NG": `/ng/${legal}`,
      },
    },
  };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ market: string; legal: string }>;
}) {
  const { market: code, legal } = await params;
  if (!isMarketCode(code)) notFound();

  const page = LEGAL_PAGES[legal];
  // Any other single segment under /[market] belongs to a real route, so an
  // unknown one here is genuinely not found rather than a legal page.
  if (!page) notFound();

  const market = MARKETS[code];
  const sites = await listLocations(code);
  const site = sites[0];
  const hours = summariseHours(site?.hours as OpeningHour[] | null, market.locale);
  const tel = site?.phone ? formatPhone(site.phone) : null;
  const wa = whatsappUrl(code);

  const updated = new Intl.DateTimeFormat(market.locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(LEGAL_LAST_UPDATED));

  return (
    // Scoped: `.breadcrumb`, `.info-box` and `.requirement-card` exist
    // elsewhere on the site with different geometry.
    <div className="legal-page">
      {/* The breadcrumb and last-updated line sit inside the hero, as they do
          on the original pages. */}
      <div className="page-hero">
        <h1 dangerouslySetInnerHTML={{ __html: page.title }} />
        <p>{page.subtitle}</p>
        <div className="breadcrumb">
          <Link href={`/${code}`}>Home</Link>
          <i className="fas fa-chevron-right" />
          <span>{plain(page.title)}</span>
        </div>
        <div className="last-updated">
          <i className="fas fa-calendar-alt" /> Last updated: {updated}
        </div>
      </div>

      {/* The body is the business's own legal text, reproduced verbatim. */}
      <div
        className="policy-content"
        dangerouslySetInnerHTML={{ __html: page.body }}
      />

      {/* Rebuilt from the location record. The original's card linked to
          `wa.me/2348012345678`, a number the business does not own, and stated
          "Monday – Saturday, 9:00 AM – 6:00 PM" regardless of the real hours. */}
      <div className="legal-page-contact">
        <div className="contact-card">
          <h3>Questions about this page?</h3>
          <p>
            {hours
              ? `Our team is available ${hours} to help.`
              : "Send us a message and we will come back to you."}
          </p>
          <div className="contact-links">
            <a href={`mailto:${site?.email ?? CONTACT_EMAIL}`} className="btn btn-primary">
              <i className="fas fa-envelope" /> Email Us
            </a>
            {tel && (
              <a href={`tel:${site!.phone}`} className="btn btn-outline">
                <i className="fas fa-phone-alt" /> {tel}
              </a>
            )}
            {wa && (
              <a
                href={wa}
                className="btn btn-outline"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="fab fa-whatsapp" /> WhatsApp
              </a>
            )}
            <Link href={`/${code}/contact`} className="btn btn-outline">
              <i className="fas fa-comments" /> Contact Page
            </Link>
          </div>
        </div>

        <nav className="legal-cross-links" aria-label="Other policies">
          {LEGAL_SLUGS.filter((s) => s !== legal).map((s) => (
            <Link key={s} href={`/${code}/${s}`}>
              {plain(LEGAL_PAGES[s].title)}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
