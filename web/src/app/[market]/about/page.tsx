import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode } from "@/lib/market";
import {
  FOUNDER_STORY,
  EXECUTIVE_BIO,
  MISSION,
  VISION,
  VALUES,
  OBJECTIVES,
  TIMELINE,
  FOUNDED_YEAR,
} from "@/content/site";
import { getSiteStats, formatMilestone } from "@/lib/stats";
import {
  listLocations,
  summariseHours,
  type OpeningHour,
} from "@/lib/repositories/locations";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  if (!isMarketCode(market)) return {};
  return {
    title: "About Adedayo Aremu Autos",
    description:
      "The founder's story, our mission and vision, and how we work — building a legacy of trust and excellence in automotive service.",
    alternates: {
      canonical: `/${market}/about`,
      languages: { "en-US": "/us/about", "en-NG": "/ng/about" },
    },
  };
}

/** Icons matching the original's value tiles. */
const VALUE_ICONS: Record<string, string> = {
  Integrity: "fas fa-gem",
  Excellence: "fas fa-medal",
  Trust: "fas fa-handshake",
  Innovation: "fas fa-lightbulb",
};

export default async function AboutPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();
  const market = MARKETS[code];

  const [stats, sites] = await Promise.all([getSiteStats(code), listLocations(code)]);
  const site = sites[0];
  const hours = summariseHours(site?.hours as OpeningHour[] | null, market.locale);

  // Derived, not typed in, so it does not quietly go stale the way the
  // original's "5+ Years Experience" did.
  const years = new Date().getFullYear() - FOUNDED_YEAR;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    name: "Adedayo Aremu Autos",
    foundingDate: String(FOUNDED_YEAR),
    founder: { "@type": "Person", name: "Adedayo Aremu" },
    areaServed: market.name,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="page-header page-header--about">
        <div className="page-header-content">
          <h1>
            About <span>Adedayo Aremu Autos</span>
          </h1>
          {/* The original said "in Nigeria" on both markets. */}
          <p>
            Building a legacy of trust, excellence, and premium automotive
            service in {code === "us" ? "Greensboro and across the Triad" : "Nigeria"}
          </p>
        </div>
      </div>

      {/* Stats. The original published "50+ Vehicles Sold", "100% Happy
          Clients", "24/7 Customer Support" and "5+ Years Experience". None of
          the first three was true or supportable — 24/7 support directly
          contradicted the opening hours in the footer, and an unsupportable
          satisfaction claim is a liability in the US market. Every figure here
          is either counted live or derived. */}
      <div className="section">
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-number">
              {formatMilestone(stats.vehiclesSold, market.locale)}
            </div>
            <div className="stat-label">Vehicles Sold</div>
          </div>
          <div className="stat-item">
            <div className="stat-number">{stats.available}</div>
            <div className="stat-label">
              Available Now{code === "us" ? " in Greensboro" : " in Nigeria"}
            </div>
          </div>
          {/* Inside the founding year there is no honest "N+ years" to print,
              so it states the year instead of rounding up to a claim. */}
          <div className="stat-item">
            <div className="stat-number">
              {years >= 1 ? `${years}+` : FOUNDED_YEAR}
            </div>
            <div className="stat-label">
              {years >= 1 ? "Years Trading" : "Trading Since"}
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-number">2</div>
            <div className="stat-label">Markets Served</div>
          </div>
        </div>

        {hours && (
          <p className="stats-note">
            <i className="fas fa-clock" /> Open {hours}
            {site ? ` · ${site.city}` : ""}
          </p>
        )}
      </div>

      <div className="section">
        <div className="section-title">
          <h2>
            Meet the <span>Founder</span>
          </h2>
          <p>The vision and leadership behind Adedayo Aremu Autos</p>
        </div>

        <div className="two-column">
          <div className="executive-bio">
            <h3>Adedayo Aremu</h3>
            {EXECUTIVE_BIO.map((p) => (
              <p key={p.slice(0, 40)}>{p}</p>
            ))}
            <span className="position">Founder &amp; CEO, Adedayo Aremu Autos</span>
          </div>

          <div className="full-bio">
            <h3>The Founder&rsquo;s Story</h3>
            {FOUNDER_STORY.map((p) => (
              <p key={p.slice(0, 40)}>{p}</p>
            ))}
          </div>
        </div>
      </div>

      <div className="section">
        <div className="mv-grid">
          <div className="mv-card">
            <div className="icon">
              <i className="fas fa-bullseye" />
            </div>
            <h3>Mission</h3>
            <p>{MISSION}</p>
          </div>

          <div className="mv-card">
            <div className="icon">
              <i className="fas fa-eye" />
            </div>
            <h3>Vision</h3>
            <p>{VISION}</p>
          </div>
        </div>
      </div>

      <div className="section section-light">
        <div className="section-title">
          <h2>
            Strategic <span>Objectives</span>
          </h2>
          <p>Our roadmap for sustainable growth and market leadership</p>
        </div>

        <div className="objectives-grid">
          {OBJECTIVES.map((o, i) => (
            <div
              // The original spanned the last card with an inline style. As a
              // class instead: an inline `grid-column: span 2` survives the
              // media query that collapses the grid to one column and forces
              // an implicit second one back, so the whole section stayed
              // two-up and unreadable on a phone.
              className={
                i === OBJECTIVES.length - 1 && OBJECTIVES.length % 2 === 1
                  ? "objective-card objective-card--wide"
                  : "objective-card"
              }
              key={o.title}
            >
              <h4>
                <i className={o.icon} /> {o.title}
              </h4>
              <ul>
                {o.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-title">
          <h2>
            Our Core <span>Values</span>
          </h2>
          <p>The principles that guide everything we do</p>
        </div>

        <div className="values-grid">
          {VALUES.map((v) => (
            <div className="value-item" key={v.title}>
              <i className={VALUE_ICONS[v.title] ?? "fas fa-check"} />
              <h5>{v.title}</h5>
              <p>{v.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="section section-light">
        <div className="section-title">
          <h2>
            Our <span>Journey</span>
          </h2>
          <p>Milestones in building a trusted automotive brand</p>
        </div>

        <div className="timeline">
          {TIMELINE.map((m) => (
            <div className="timeline-item" key={m.year}>
              <div className="timeline-year">{m.year}</div>
              <div className="timeline-content">
                <h4>{m.title}</h4>
                <p>{m.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
