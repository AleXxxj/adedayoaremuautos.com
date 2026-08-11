import Link from "next/link";
import { HeroSlider } from "@/components/HeroSlider";
import { notFound } from "next/navigation";
import { MARKETS, isMarketCode, formatDistance } from "@/lib/market";
import { listInventory } from "@/lib/repositories/vehicles";
import { listLocations, formatPhone, summariseHours, type OpeningHour } from "@/lib/repositories/locations";
import { getSiteStats, formatMilestone } from "@/lib/stats";
import { articlesFor } from "@/content/articles";
import { formatMoney, money } from "@/lib/money";
import { mediaUrl } from "@/lib/media";
import { LegacyContactForm } from "@/components/LegacyContactForm";

export const dynamic = "force-dynamic";

/**
 * The original homepage, reproduced.
 *
 * Same sections in the same order, same class names, same markup shape — so
 * the extracted stylesheet renders it as it renders the live legacy site. The
 * difference is underneath: vehicles, figures, guides and the location block
 * come from the database instead of being hardcoded in the file.
 *
 * Deliberate corrections to the original, all factual rather than stylistic:
 *   - prices are not FX-converted (the legacy rate was frozen in the markup)
 *   - the sold figure is the owner's real number plus live sales
 *   - links point at routes that exist
 */
export default async function MarketHome({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();

  const market = MARKETS[code];
  const [{ vehicles, total }, stats, sites] = await Promise.all([
    listInventory(code, { limit: 4 }),
    getSiteStats(code),
    listLocations(code),
  ]);

  const site = sites[0];
  const articles = articlesFor(code).slice(0, 4);
  const CONTACT_EMAIL = "info@adedayoaremuautos.com";
  const fmt = (m: number) => formatMoney(money(m, market.currency), market.locale);

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      {/* The hero leads with rent to own, because that is what the business
          now leads with. The first slide is server-rendered, so the marketing
          message is the first thing painted and the first thing a crawler
          reads — "opens on first load" without an interstitial to dismiss. */}
      <HeroSlider
        market={{
          code,
          label: code === "us" ? "Greensboro, North Carolina" : "Nigeria",
          currency: market.currency,
        }}
        slides={[
          {
            key: "rent-to-own",
            eyebrow: { icon: "fas fa-key", text: "New — Rent to Own" },
            title: ["Rent it. Then ", "own it.", ""],
            body:
              "Hire by the day or the week, and every payment counts towards keeping the car. Reach the total for your category and it is yours.",
            image: "/img/hero-benz.png",
            actions: [
              { href: `/${code}/rent-to-own`, label: "HOW IT WORKS", icon: "fas fa-key", primary: true },
              { href: `/${code}/rent-to-own#calculator`, label: "WHEN WOULD IT BE MINE?", icon: "fas fa-calculator" },
            ],
          },
          {
            key: "buy",
            title: ["Buy, Rent & ", "Finance Cars", " with Confidence"],
            body:
              code === "us"
                ? "Premium vehicles, verified quality, and flexible payment plans tailored for you. Serving Greensboro and the Triad."
                : "Premium vehicles, verified quality, and flexible payment plans tailored for you. Experience luxury and reliability with every ride.",
            image: "/img/hero-nissan.png",
            actions: [
              { href: `/${code}/inventory`, label: "VIEW CARS", icon: "fas fa-car", primary: true },
              { href: `/${code}/rentals`, label: "RENT A CAR", icon: "fas fa-key" },
            ],
          },
          {
            key: "finance",
            title: ["Figures you see are the ", "figures you sign", ""],
            body:
              "Payment estimates run the same arithmetic as the agreement itself. Work out what a vehicle costs before you speak to anyone.",
            image: "/img/hero-wide.png",
            actions: [
              { href: `/${code}/financing`, label: "APPLY FOR FINANCING", icon: "fas fa-hand-holding-usd", primary: true },
              { href: `/${code}/financing#calculator`, label: "USE THE CALCULATOR", icon: "fas fa-calculator" },
            ],
          },
        ]}
      />

      {/* ── Services ─────────────────────────────────────────────────────── */}
      <div className="services">
        <div className="services-container">
          <div className="section-title">
            <h2>
              Our <span>Services</span>
            </h2>
            <p>Comprehensive automotive solutions tailored to your needs</p>
          </div>
          <div className="services-grid">
            <div className="service-card">
              <div className="service-icon">
                <i className="fas fa-car" />
              </div>
              <h3>Buy a Car</h3>
              <p>
                {code === "us"
                  ? "Explore our curated collection of inspected vehicles. Each car comes with its history report and a full breakdown of price, tax and fees."
                  : "Explore our curated collection of premium, verified vehicles from top brands. Each car comes with a comprehensive inspection report."}
              </p>
              <Link href={`/${code}/inventory`} className="service-link">
                Browse Collection <i className="fas fa-arrow-right" />
              </Link>
            </div>

            <div className="service-card">
              <div className="service-icon">
                <i className="fas fa-key" />
              </div>
              <h3>Rent a Car</h3>
              <p>
                Flexible daily, weekly, or monthly rentals. Longer hires are
                priced on the better rate automatically, so you are never
                charged more than the days you take.
              </p>
              <Link href={`/${code}/rentals`} className="service-link">
                View Rentals <i className="fas fa-arrow-right" />
              </Link>
            </div>

            <div className="service-card">
              <div className="service-icon">
                <i className="fas fa-hand-holding-usd" />
              </div>
              <h3>Finance a Car</h3>
              <p>
                {code === "us"
                  ? "Financing arranged in-house over 24 to 72 months. Work out a payment before you speak to anyone."
                  : "Flexible payment plans from 6 to 24 months. Drive your dream car today with our easy financing options."}
              </p>
              <Link href={`/${code}/financing`} className="service-link">
                Learn More <i className="fas fa-arrow-right" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Featured vehicles ────────────────────────────────────────────── */}
      <div className="featured">
        <div className="featured-container">
          <div className="section-header">
            <div>
              <h2>
                Featured <span>Vehicles</span>
              </h2>
              <p>Hand-picked premium cars for you</p>
            </div>
            {total > 0 && (
              <Link href={`/${code}/inventory`} className="view-all">
                View All <i className="fas fa-arrow-right" />
              </Link>
            )}
          </div>

          {vehicles.length === 0 ? (
            <div className="no-results">
              <h3>No vehicles listed yet</h3>
              <p>
                Tell us what you are looking for and we will source it before it
                reaches the site.
              </p>
            </div>
          ) : (
            <div className="cars-grid">
              {vehicles.map((v) => {
                const name = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
                return (
                  <div className="car-card" key={v.id}>
                    <div className="car-image">
                      {v.primaryImage ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={mediaUrl(v.primaryImage)} alt={name} />
                      ) : (
                        <div className="car-image-placeholder">Photography coming soon</div>
                      )}
                      <span className="car-badge">{v.condition}</span>
                    </div>
                    <div className="car-details">
                      <h3 className="car-title">{name}</h3>
                      <div className="car-specs">
                        <span>
                          <i className="fas fa-calendar" /> {v.year}
                        </span>
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
                      </div>
                      <div className="car-price">
                        {v.priceMinor != null ? fmt(v.priceMinor) : "Price on request"}
                      </div>
                      <div className="car-actions">
                        <Link
                          href={`/${code}/inventory/${v.slug}`}
                          className="btn btn-primary"
                        >
                          View
                        </Link>
                        <Link
                          href={`/${code}/contact?vehicle=${v.slug}`}
                          className="btn btn-outline"
                        >
                          <i className="fas fa-envelope" /> Enquire
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Rent to own ──────────────────────────────────────────────────
          The business now leads with this, so it sits directly under the
          vehicles rather than further down: the first thing after the stock
          is what to do about it. */}
      <div className="rto-banner">
        <div className="rto-banner-inner">
          <div className="rto-banner-copy">
            <span className="rto-banner-eyebrow">
              <i className="fas fa-key" aria-hidden="true" /> New
            </span>
            <h2>
              Rent it. Then <span>own it.</span>
            </h2>
            <p>
              Hire by the day or the week and every payment counts towards
              keeping the car. Reach the total for your category and it is
              yours — no balloon payment, no obligation to continue.
            </p>
            <div className="rto-banner-actions">
              <Link href={`/${code}/rent-to-own`} className="btn btn-primary">
                <i className="fas fa-key" /> How Rent to Own works
              </Link>
              <Link href={`/${code}/rent-to-own#calculator`} className="btn btn-outline">
                <i className="fas fa-calculator" /> When would it be mine?
              </Link>
            </div>
          </div>

          <div className="rto-banner-figure" aria-hidden="true">
            <div className="rto-banner-track">
              <span className="rto-banner-fill" />
            </div>
            <div className="rto-banner-marks">
              <span>Week 1</span>
              <span>Halfway</span>
              <span className="is-end">Yours</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── How we work ──────────────────────────────────────────────────
          Every claim here is one the platform actually enforces, not a
          promise. Written for a buyer, but each line is a thing the site does
          rather than a thing the copy says. */}
      <div className="how-we-work">
        <div className="how-we-work-container">
          <div className="section-title">
            <h2>
              How We <span>Work</span>
            </h2>
            <p>
              The part most dealerships leave to a phone call and a promise.
            </p>
          </div>

          <div className="work-grid">
            <div className="work-step">
              <span className="work-step-index">01</span>
              <i className="fas fa-inbox" aria-hidden="true" />
              <h3>Your enquiry is recorded, not just sent</h3>
              <p>
                Every message is written down the moment you send it and lands
                with a named person. Nothing depends on someone noticing an
                email.
              </p>
            </div>

            <div className="work-step">
              <span className="work-step-index">02</span>
              <i className="fas fa-calculator" aria-hidden="true" />
              <h3>The figures you see are the figures you sign</h3>
              <p>
                Payment estimates run the same arithmetic as the agreement
                itself — not a separate calculator that happens to sit on the
                website.
              </p>
            </div>

            <div className="work-step">
              <span className="work-step-index">03</span>
              <i className="fas fa-calendar-check" aria-hidden="true" />
              <h3>A reserved vehicle is reserved</h3>
              <p>
                Hire dates are checked against live bookings before they are
                confirmed. Two customers cannot be given the same vehicle for
                the same days.
              </p>
            </div>

            <div className="work-step">
              <span className="work-step-index">04</span>
              <i className="fas fa-shield-halved" aria-hidden="true" />
              <h3>We do not ask for what we do not need</h3>
              <p>
                No {code === "ng" ? "BVN" : "Social Security Number"}, bank
                details or ID number through this website. Identity is verified
                in person, with the paperwork.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── About / founder ──────────────────────────────────────────────── */}
      <div className="about-section">
        <div className="about-container">
          <div className="about-grid">
            <div className="about-content">
              <h2>
                Meet <span>Adedayo Aremu</span>
              </h2>
              <h3>Founder &amp; CEO</h3>
              <p>
                Adedayo Aremu is an entrepreneurial professional and founder of
                Adedayo Aremu Autos, a growing automotive enterprise committed
                to excellence, transparency, and customer-centered service. With
                a strategic mindset and strong business acumen, he has
                positioned his brand to deliver reliable vehicle sourcing,
                quality assurance, and value-driven automotive solutions.
              </p>
              <p>
                Focused on sustainable growth, Adedayo is building a dealership
                model that prioritises professionalism, financial intelligence,
                and scalable systems. His long-term vision is to establish
                Adedayo Aremu Autos as a recognised and respected name in the
                automotive marketplace.
              </p>

              <div className="about-stats">
                <div className="about-stat">
                  <h4>{formatMilestone(stats.vehiclesSold, market.locale)}</h4>
                  <p>Vehicles Sold</p>
                </div>
                <div className="about-stat">
                  <h4>{stats.available}</h4>
                  <p>Available Now</p>
                </div>
                <div className="about-stat">
                  <h4>{code === "us" ? "Greensboro" : "Nigeria"}</h4>
                  <p>Where We Are</p>
                </div>
              </div>

              <Link href={`/${code}/about`} className="btn btn-primary">
                READ FULL STORY <i className="fas fa-arrow-right" />
              </Link>
            </div>

            <div className="about-image">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/img/ceo.png" alt="Adedayo Aremu, Founder and CEO" />
            </div>
          </div>
        </div>
      </div>


      {/* ── Referral programme ───────────────────────────────────────────── */}
      <div className="referral-section">
        <div className="referral-container">
          <div className="referral-grid">
            <div className="referral-content">
              <h2>
                Earn with <span>Our Referral Program</span>
              </h2>
              <p>
                Know someone looking for a quality vehicle? Refer them to us and
                earn a commission on every successful purchase.
              </p>
              <div className="highlight">
                1.5% <small>commission</small>
              </div>
              <ul className="referral-features">
                <li><i className="fas fa-check-circle" /> Earn on every successful vehicle purchase</li>
                <li><i className="fas fa-check-circle" /> No limits - refer as many buyers as you want</li>
                <li><i className="fas fa-check-circle" /> Fast payout after transaction completion</li>
                <li><i className="fas fa-check-circle" /> Track your referrals easily</li>
              </ul>
              <Link href={`/${code}/contact?type=referral`} className="btn btn-primary">
                Become a Partner
              </Link>
            </div>
            <div className="referral-card">
              <i className="fas fa-hand-holding-usd" />
              <h3>Refer &amp; Earn</h3>
              <div className="percent">
                1.5% <small>per sale</small>
              </div>
              <p>On every successful vehicle purchase through your referral</p>
              <p style={{ color: "var(--illustration-gold)", fontWeight: 600, marginTop: 20 }}>
                {code === "us"
                  ? "Example: Refer a $30,000 car = $450"
                  : "Example: Refer a ₦10M car = ₦150,000"}
              </p>
              <Link href={`/${code}/contact?type=referral`} className="btn btn-primary">
                Start Referring
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Blog / insights ──────────────────────────────────────────────── */}
      {articles.length > 0 && (
        <div className="blog-section">
          <div className="blog-container">
            <div className="section-title">
              <h2>
                Automotive <span>Insights</span>
              </h2>
              <p>Expert advice and tips for car buyers and enthusiasts</p>
            </div>
            <div className="blog-grid">
              {articles.map((a) => (
                <div className="blog-card" key={a.slug}>
                  {a.image && (
                    <div className="blog-image">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.image} alt={a.title} loading="lazy" />
                    </div>
                  )}
                  <div className="blog-content">
                    <span className="blog-category">{a.category}</span>
                    <h3 className="blog-title">
                      <Link href={`/${code}/blog/${a.slug}`}>{a.title}</Link>
                    </h3>
                    <div className="blog-meta">
                      <span>
                        <i className="fas fa-clock" /> {a.readMinutes} min read
                      </span>
                    </div>
                    <p className="blog-excerpt">{a.excerpt}</p>
                    <Link href={`/${code}/blog/${a.slug}`} className="service-link">
                      Read Article <i className="fas fa-arrow-right" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Why choose us ────────────────────────────────────────────────── */}
      <div className="features">
        <div className="features-container">
          <div className="section-title">
            <h2>
              Why <span>Choose Us</span>
            </h2>
            <p>Experience the difference of dealing with a trusted, professional dealer</p>
          </div>
          <div className="features-grid">
            {[
              { icon: "fa-shield-alt", t: "Trusted Dealer", b: code === "us" ? "Dealing face to face in Greensboro with integrity and transparency." : "Years of experience serving satisfied customers across Nigeria with integrity and transparency." },
              { icon: "fa-check-circle", t: "Verified Vehicles", b: "Every car undergoes rigorous inspection before listing to ensure quality and reliability." },
              { icon: "fa-hand-holding-usd", t: "Flexible Payment", b: "Cash or financing options to suit your budget, with the full breakdown shown before you commit." },
              { icon: "fa-truck", t: code === "us" ? "Serving the Triad" : "Nationwide Delivery", b: code === "us" ? "Greensboro based, delivering across the Triad." : "We deliver your car anywhere in Nigeria with full insurance during transit." },
              { icon: "fa-file-contract", t: "Paperwork Done", b: code === "us" ? "Title, registration and transfer handled for you." : "Full documentation, customs clearance, and transfer processed for you hassle-free." },
              { icon: "fa-headset", t: "After-Sales Support", b: "Comprehensive after-sales service including maintenance support and warranty options." },
            ].map((f) => (
              <div className="feature" key={f.t}>
                <div className="feature-icon">
                  <i className={`fas ${f.icon}`} />
                </div>
                <h3>{f.t}</h3>
                <p>{f.b}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Contact ──────────────────────────────────────────────────────── */}
      <div className="contact-section" id="contact">
        <div className="contact-container">
          <div className="contact-info">
            {/* h3, not h2 — the stylesheet styles `.contact-info h3`, so an h2
                here rendered as unstyled small text. */}
            <h3>
              Get in <span>Touch</span>
            </h3>
            <p>Ready to find your perfect vehicle? Contact us today for personalised assistance.</p>

            <div className="contact-details">
              {site?.phone && (
                <div className="contact-item">
                  <i className="fas fa-phone-alt" />
                  <a href={`tel:${site.phone}`}>{formatPhone(site.phone)}</a>
                </div>
              )}
              <div className="contact-item">
                <i className="fas fa-envelope" />
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              </div>
              {site && (
                <div className="contact-item">
                  <i className="fas fa-map-marker-alt" />
                  <span>
                    {site.addressLine1}, {site.city}
                    {site.region ? `, ${site.region}` : ""} {site.postalCode}
                  </span>
                </div>
              )}
              {site && summariseHours(site.hours as OpeningHour[] | null, market.locale) && (
                <div className="contact-item">
                  <i className="fas fa-clock" />
                  <span>{summariseHours(site.hours as OpeningHour[] | null, market.locale)}</span>
                </div>
              )}
            </div>

            {/* WhatsApp is driven by the location's real number. The legacy site
                hardcoded wa.me/2348012345678, which is not a number the
                business owns — so it is rendered only where we have a real one
                rather than pointing customers at a stranger. */}
            {site?.phone ? (
              <a
                href={`https://wa.me/${site.phone.replace(/[^0-9]/g, "")}`}
                className="btn btn-primary"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="fab fa-whatsapp" /> CHAT ON WHATSAPP
              </a>
            ) : (
              <Link href={`/${code}/contact`} className="btn btn-primary">
                <i className="fas fa-paper-plane" /> SEND US A MESSAGE
              </Link>
            )}
          </div>

          <LegacyContactForm market={code} />
        </div>
      </div>

    </>
  );
}
