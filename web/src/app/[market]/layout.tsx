import type { Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MARKETS, MARKET_CODES, isMarketCode } from "@/lib/market";
import {
  listLocations,
  formatPhone,
} from "@/lib/repositories/locations";
// Order matters. Scoping the original's `*` reset to `.legacy-theme *` raised
// its specificity from 0,0,0 to 0,1,0, which ties with Font Awesome's `.fas`
// — so whichever loads last wins the icon font. Legacy first, icons second.
import "@/styles/legacy.css";
// Self-hosted rather than the CDN the original used: the CDN stylesheet
// loaded but its webfonts did not, so every icon rendered as a fallback box.
import "@fortawesome/fontawesome-free/css/all.min.css";
// Refinement layer, last so it can lift the ported sheet from one place.
// Removing this import returns the site to the faithful port.
import "@/styles/refine.css";
import { CurrencySwitcher } from "@/components/CurrencySwitcher";
import { LegacyNav } from "@/components/LegacyNav";
import { ScrollReveal } from "@/components/ScrollReveal";
import { CountryNotice } from "@/components/CountryNotice";
import { NotifyPrompt } from "@/components/NotifyPrompt";
import { Toaster } from "@/components/Toast";
import { TabBar } from "@/components/TabBar";
import { Assistant } from "@/components/Assistant";
import { LegacyNewsletter } from "@/components/LegacyBlog";
import { socialLinks } from "@/lib/contact";
import { legalNav } from "@/content/legal";
import Image from "next/image";

export function generateStaticParams() {
  return MARKET_CODES.map((market) => ({ market }));
}

/**
 * Lets the page run under an iPhone's rounded corners and home indicator, so
 * the tab bar can sit at the very bottom and pad itself clear of the
 * indicator (env(safe-area-inset-bottom), refine.css). The page pads its
 * sides by the insets, which are 0 in portrait and clear the notch in
 * landscape.
 */
export const viewport: Viewport = { viewportFit: "cover" };

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
  const socials = socialLinks(code);
  const site = sites[0];
  const assistantEnabled = Boolean(process.env.ANTHROPIC_API_KEY);

  // No "Home": the logo and the tab bar both go there.
  const nav = [
    { href: `/${code}/inventory`, label: "Buy Cars" },
    { href: `/${code}/sell`, label: "Sell Your Car" },
    { href: `/${code}/rentals`, label: "Rentals" },
    { href: `/${code}/rent-to-own`, label: "Rent to Own" },
    { href: `/${code}/financing`, label: "Financing" },
    // There are no US articles, so the US header has the car check instead.
    code === "us"
      ? { href: "/us/check", label: "Check a Car" }
      : { href: `/${code}/blog`, label: "Blog" },
    { href: `/${code}/about`, label: "About" },
    { href: `/${code}/contact`, label: "Contact" },
  ];
  // In the phone menu and the footer, not the desktop row: that row was
  // measured to the pixel (refine.css) and has no room for another link.
  // The guides are written for Greensboro and exist on the US site only.
  const more = [
    ...(code === "us" ? [{ href: "/us/guides", label: "Guides" }] : []),
    { href: `/${code}/compare`, label: "Compare Cars" },
  ];
  const switches = other.map((c) => ({ href: `/${c}`, market: c, name: MARKETS[c].name }));

  return (
    <div className="legacy-theme">
      <ScrollReveal />
      <CountryNotice currentMarket={code} />
      {/* Form results, pinned to the viewport: every form put its
          answer at its own top, which on a long form is off-screen
          from the button that caused it. */}
      <Toaster />
      {/* Asks in our own words first; only a yes opens the browser's
          permission box, which can effectively be raised once per visitor. */}
      <NotifyPrompt market={code} />
      {/* Rendered only when the API key exists. An assistant button that
          apologises for being unavailable is worse than no button. */}
      {assistantEnabled && (
        <Assistant
          market={code}
          phone={site?.phone ?? null}
          phoneLabel={formatPhone(site?.phone ?? null)}
        />
      )}

      <div className="header">
        <div className="header-container">
          {/* One link home: the mark and the name together. The mark is the
              logo trimmed of its empty border (public/img/logo-mark.png), so
              it is legible at header size; logo.png stays for print and
              email. */}
          <Link href={`/${code}`} className="logo-container" aria-label="Adedayo Aremu Autos home">
            <Image
              className="logo-mark"
              src="/img/logo-mark.png"
              alt=""
              width={431}
              height={160}
              sizes="108px"
              loading="eager"
            />
            <div className="logo-text">
              <h1>
                ADEDAYO AREMU <span>AUTOS</span>
              </h1>
              <p>BUY • SELL • RENT • FINANCE</p>
            </div>
          </Link>

          <LegacyNav
            items={[...nav, ...more.map((m) => ({ ...m, menuOnly: true }))]}
            switches={switches}
          />

          <div className="header-actions">
            {/* Below 900px the switch moves into the menu (LegacyNav). */}
            {switches.map((sw) => (
              <Link
                key={sw.market}
                href={sw.href}
                className="market-switch"
                /* The globe carries the destination country's colour, so the
                   control still says where it goes when the label is hidden. */
                data-market={sw.market}
                /* The label is hidden at narrower widths, so the accessible
                   name has to come from the attribute rather than the text. */
                aria-label={`Switch to ${sw.name}`}
                title={`Switch to ${sw.name}`}
              >
                <i className="fas fa-globe" aria-hidden="true" />
                <span>{sw.name}</span>
              </Link>
            ))}
            {/* The partners' way in, on every page rather than buried in the
                referral page. "Log in" on a phone, "Partner log in" wider. */}
            <Link href="/partner/login" className="partner-pill" aria-label="Partner log in">
              <i className="fas fa-user" aria-hidden="true" />
              <span className="partner-pill-short" aria-hidden="true">
                Log in
              </span>
              <span className="partner-pill-long" aria-hidden="true">
                Partner log in
              </span>
            </Link>
          </div>
        </div>
      </div>

      {children}

      {/* Sitewide, directly above the footer. It used to live only on the blog,
          which most visitors never reach — a mailing list nobody can find
          collects nobody, and the birthday field it carries is the whole point
          of asking. */}
      <LegacyNewsletter market={code} source="footer" variant="compact" />

      <div className="footer">
        <div className="footer-container">
          {/* .footer-grid is what makes this four columns. Omitting it last
              time is why the whole footer stacked into one column. */}
          <div className="footer-grid">
            <div className="footer-about">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 15 }}>
                <Image
                  src="/img/logo-mark.png"
                  alt=""
                  width={431}
                  height={160}
                  sizes="108px"
                  style={{ height: 40, width: "auto" }}
                />
                <h3 style={{ color: "var(--silver-classic)", fontSize: 20 }}>
                  ADEDAYO AREMU <span>AUTOS</span>
                </h3>
              </div>
              {/* Rent to own is named for the United States only. Nigeria has
                  no categories priced yet, and its own page says the programme
                  is opening in the States first — the footer must not promise
                  what that market cannot yet deliver. */}
              <p>
                {code === "us"
                  ? "Car sales, rentals, rent to own and financing in Greensboro, NC."
                  : "Car sales, rentals and financing in Nigeria."}
              </p>
              {/* The original linked every icon to `#`. A dead social icon on
                  a dealership site reads as an abandoned account, so these
                  render only once a handle exists in lib/contact. */}
              {socials.length > 0 && (
                <div className="social-links">
                  {socials.map((s) => (
                    <a
                      key={s.key}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={s.label}
                    >
                      <i className={s.icon} />
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Hidden on a phone, where the tab bar and the menu carry the
                same links. The list of makes that stood beside it is gone:
                three of its five matched no car. */}
            <div className="footer-links">
              <h4>Quick Links</h4>
              <ul>
                {[
                  ...nav,
                  ...more,
                  { href: `/${code}/referral`, label: "Refer a Renter" },
                  { href: "/partner/login", label: "Partner log in" },
                ].map((n) => (
                  <li key={n.href}>
                    <Link href={n.href}>{n.label}</Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Not on the Greensboro site: everything there is priced and paid
                in dollars, and an estimate in naira, pounds or euros helps no
                one renting a car in the Triad. It also took a screen of the
                footer on a phone. Nothing else reads the choice it stores. */}
            {code !== "us" && <CurrencySwitcher base={market.currency} />}
          </div>
        </div>

        <div className="footer-bottom">
          <p>
            © {new Date().getFullYear()} Adedayo Aremu Autos. All rights reserved.
          </p>
          {/* The original listed the three policies here; they were dropped
              when the footer was first ported. */}
          <div className="footer-bottom-links">
            {legalNav(code).map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label.replace(/<[^>]+>/g, "")}
              </Link>
            ))}
            <Link href={`/${code}/contact`}>Contact</Link>
            {site?.phone && <a href={`tel:${site.phone}`}>{formatPhone(site.phone)}</a>}
          </div>
        </div>
      </div>

      {/* Last, so it is the last stop for a keyboard. Phones only. */}
      <TabBar market={code} />
    </div>
  );
}
