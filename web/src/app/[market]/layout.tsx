import Link from "next/link";
import { notFound } from "next/navigation";
import { MARKETS, MARKET_CODES, isMarketCode } from "@/lib/market";
import {
  listLocations,
  summariseHours,
  formatPhone,
  type OpeningHour,
} from "@/lib/repositories/locations";
// Order matters. Scoping the original's `*` reset to `.legacy-theme *` raised
// its specificity from 0,0,0 to 0,1,0, which ties with Font Awesome's `.fas`
// — so whichever loads last wins the icon font. Legacy first, icons second.
import "@/styles/legacy.css";
// Self-hosted rather than the CDN the original used: the CDN stylesheet
// loaded but its webfonts did not, so every icon rendered as a fallback box.
import "@fortawesome/fontawesome-free/css/all.min.css";
import { CurrencySwitcher } from "@/components/CurrencySwitcher";

export function generateStaticParams() {
  return MARKET_CODES.map((market) => ({ market }));
}

/**
 * Public chrome, reproducing the original site's header and footer markup and
 * class names exactly so the extracted stylesheet applies unchanged.
 *
 * The differences from the original are only where it was factually wrong:
 * links point at real routes, and the location block comes from the database
 * rather than a hardcoded Lagos placeholder.
 */
export default async function MarketLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ market: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();

  const market = MARKETS[code];
  const other = MARKET_CODES.filter((c) => c !== code);
  const sites = await listLocations(code);
  const site = sites[0];

  const nav = [
    { href: `/${code}`, label: "Home" },
    { href: `/${code}/inventory`, label: "Buy Cars" },
    { href: `/${code}/rentals`, label: "Rentals" },
    { href: `/${code}/financing`, label: "Financing" },
    { href: `/${code}/blog`, label: "Blog" },
    { href: `/${code}/about`, label: "About" },
    { href: `/${code}/contact`, label: "Contact" },
  ];

  return (
    <div className="legacy-theme">
      <div className="header">
        <div className="header-container">
          <div className="logo-container">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/logo.png" alt="Adedayo Aremu Autos Logo" />
            <div className="logo-text">
              <h1>
                ADEDAYO AREMU <span>AUTOS</span>
              </h1>
              <p>PREMIUM CARS • RENTAL • FINANCING</p>
            </div>
          </div>

          <div className="nav-menu" id="navMenu">
            {nav.map((n) => (
              <Link key={n.href} href={n.href}>
                {n.label}
              </Link>
            ))}
          </div>

          <div className="header-actions">
            {other.map((c) => (
              <Link
                key={c}
                href={`/${c}`}
                className="btn btn-outline"
                style={{ padding: "0.55rem 1rem", fontSize: "0.8rem" }}
              >
                <i className="fas fa-globe" /> {MARKETS[c].name}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {children}

      <div className="footer">
        <div className="footer-container">
          {/* .footer-grid is what makes this four columns. Omitting it last
              time is why the whole footer stacked into one column. */}
          <div className="footer-grid">
            <div className="footer-about">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 15 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/img/logo.png" alt="Logo" style={{ height: 45 }} />
                <h3 style={{ color: "var(--silver-classic)", fontSize: 20 }}>
                  ADEDAYO AREMU <span>AUTOS</span>
                </h3>
              </div>
              <p>
                {code === "us"
                  ? "Your trusted partner for premium car sales, rentals, and financing in Greensboro and across the Triad. We deliver excellence with every vehicle."
                  : "Your trusted partner for premium car sales, rentals, and financing in Nigeria. We deliver excellence with every vehicle."}
              </p>
              <div className="social-links">
                <a href="#" aria-label="Facebook"><i className="fab fa-facebook-f" /></a>
                <a href="#" aria-label="Instagram"><i className="fab fa-instagram" /></a>
                <a href="#" aria-label="Twitter"><i className="fab fa-twitter" /></a>
                <a href="#" aria-label="LinkedIn"><i className="fab fa-linkedin-in" /></a>
              </div>
            </div>

            <div className="footer-links">
              <h4>Quick Links</h4>
              <ul>
                {nav.map((n) => (
                  <li key={n.href}>
                    <Link href={n.href}>{n.label}</Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="footer-links">
              <h4>Vehicles</h4>
              <ul>
                {["Toyota", "Lexus", "Honda", "Mercedes-Benz", "BMW"].map((b) => (
                  <li key={b}>
                    <Link href={`/${code}/inventory?make=${encodeURIComponent(b)}`}>{b}</Link>
                  </li>
                ))}
              </ul>
            </div>

            <CurrencySwitcher base={market.currency} />
          </div>
        </div>

        <div className="footer-bottom">
          <p>
            © {new Date().getFullYear()} Adedayo Aremu Autos. All rights reserved.
          </p>
          <div className="footer-bottom-links">
            <Link href={`/${code}/contact`}>Contact</Link>
            {site?.phone && <a href={`tel:${site.phone}`}>{formatPhone(site.phone)}</a>}
          </div>
        </div>
      </div>
    </div>
  );
}
