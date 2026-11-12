import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MARKETS, isMarketCode, type MarketCode } from "@/lib/market";
import { dealerJsonLd, websiteJsonLd } from "@/lib/seo/dealer";
import { listInventory } from "@/lib/repositories/vehicles";
import {
  listFleet,
  byWeekCost,
  fromPrices,
  type FleetVehicle,
} from "@/lib/repositories/rentals";
import { listLocations, formatPhone, summariseHours, type OpeningHour } from "@/lib/repositories/locations";
import { getSiteStats, formatMilestone } from "@/lib/stats";
import { formatMoney, money } from "@/lib/money";
import { DEFAULT_RENTAL_COMMISSION_BPS, formatBps, weeklyExamples } from "@/lib/referral";
import { CONTACT_EMAIL, mapLinkUrl, whatsappUrl } from "@/lib/contact";
import { CarRow } from "@/components/CarRow";
import "@/styles/car-list.css";
import "@/styles/home.css";

/**
 * The homepage was the only page without a canonical URL, which matters most
 * here: it is the page that will be linked to, and the one a search engine is
 * most likely to reach by more than one address.
 *
 * The title is written out in full rather than left to the site-wide template.
 * This is the result a person sees when they search the business by name, and
 * "Adedayo Aremu Autos" alone tells them nothing they did not already type —
 * what the business does, and where, is the part that earns the click.
 */
const HOME_SEO: Record<
  MarketCode,
  { title: string; description: string }
> = {
  us: {
    title:
      "Adedayo Aremu Autos | Cars for Sale, Rental & Rent-to-Own in Greensboro, NC",
    description:
      "Adedayo Aremu Autos is a vehicle dealership in Greensboro, North Carolina. Buy from our stock, rent by the day, week or month, apply for rent-to-own, or finance with clear figures and no hidden fees.",
  },
  ng: {
    title:
      "Adedayo Aremu Autos | Cars for Sale, Rental & Financing in Nigeria",
    description:
      "Adedayo Aremu Autos sells, rents and finances quality vehicles in Nigeria. Browse available cars, book a rental with or without a driver, or apply for financing.",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  if (!isMarketCode(market)) return {};
  const seo = HOME_SEO[market];
  return {
    // `absolute` opts out of the "%s | Adedayo Aremu Autos" template, which
    // would otherwise print the business name twice in one title.
    title: { absolute: seo.title },
    description: seo.description,
    alternates: {
      canonical: `/${market}`,
      languages: { "en-US": "/us", "en-NG": "/ng" },
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: `/${market}`,
      siteName: "Adedayo Aremu Autos",
      type: "website",
    },
  };
}

/**
 * Rendered once and reused for a minute, rather than rebuilt per visitor.
 *
 * This was `force-dynamic`, which meant every single view of the homepage —
 * including every crawler hit — required a live round trip to the database
 * before a single pixel could be sent. When the backend was briefly
 * unreachable the homepage had nothing to fall back on and simply died, and a
 * search engine crawling during that window sees a broken site rather than a
 * slow one.
 *
 * A minute is well inside what a dealership needs: the admin already calls
 * `revalidatePath` on this route when stock changes, so an edit still appears
 * immediately. The window only governs how long a cached copy keeps serving
 * when nothing has been edited — and, more to the point, it is what the site
 * falls back on when the database cannot be reached at all.
 */
export const revalidate = 60;

/** Read from the default partner rate, never typed: the referral page quotes the same. */
const RATE = formatBps(DEFAULT_RENTAL_COMMISSION_BPS);

/** "1 car", "11 cars". */
const cars = (n: number) => `${n} ${n === 1 ? "car" : "cars"}`;

const carName = (v: FleetVehicle) =>
  [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");

interface Tile {
  title: string;
  detail: string;
  href: string;
  icon: string;
  main?: boolean;
}

/**
 * The home page, built for a phone first: under five screens instead of
 * nineteen.
 *
 * The first screen answers "what can I do here?": the weekly price, and one
 * tile per task with a live count. Then three cars for rent, referrals, what
 * the business promises, and how to reach it. Each topic's detail is on its
 * own page — the tiles and the tab bar lead there — so nothing here repeats
 * a page that already exists.
 *
 * Every price, count and rate is computed from the database and the site's
 * own constants. Nothing is typed by hand, so the home page can't disagree
 * with the page it links to.
 */
export default async function MarketHome({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();

  const market = MARKETS[code];
  const [fleet, { total: forSale }, stats, sites, dealer] = await Promise.all([
    listFleet(code),
    listInventory(code, { limit: 1 }),
    getSiteStats(code),
    listLocations(code),
    dealerJsonLd(code),
  ]);

  const us = code === "us";
  const site = sites[0];
  const fmt = (minor: number) => formatMoney(money(minor, market.currency), market.locale);

  // The same order as the rental list, so these are its first three cars.
  const rows = [...fleet].sort(byWeekCost).slice(0, 3);
  const { fromDaily, fromWeekly } = fromPrices(fleet);
  // The first example on the referral page, so the two quote the same car.
  const example = weeklyExamples(fleet, 1)[0];

  const phone = formatPhone(site?.phone ?? null);
  const hours = summariseHours(site?.hours as OpeningHour[] | null | undefined, market.locale);
  const address = site
    ? [
        site.addressLine1,
        site.addressLine2,
        [site.city, site.region].filter(Boolean).join(", ") +
          (site.postalCode ? ` ${site.postalCode}` : ""),
      ]
        .filter((l): l is string => Boolean(l && l.trim()))
        .join(", ")
    : null;
  // Null until the business confirms a line that someone watches.
  const whatsapp = whatsappUrl(code);

  const tiles: Tile[] = [
    fleet.length > 0
      ? { title: "Rent a car", detail: `${cars(fleet.length)} to rent`, href: `/${code}/rentals`, icon: "fa-key", main: true }
      : { title: "Rent a car", detail: "Ask about a rental", href: `/${code}/contact?type=rental`, icon: "fa-key", main: true },
    ...(us
      ? [{ title: "Rent to own", detail: "Your rent counts toward owning the car", href: `/${code}/rent-to-own`, icon: "fa-hand-holding-heart" }]
      : []),
    forSale > 0
      ? { title: "Buy a car", detail: `${cars(forSale)} for sale`, href: `/${code}/inventory`, icon: "fa-car" }
      : { title: "Buy a car", detail: "Tell us what you want", href: `/${code}/contact`, icon: "fa-car" },
    { title: "Financing", detail: "Estimate a payment, then apply", href: `/${code}/financing`, icon: "fa-calculator" },
    ...(us
      ? [{ title: "Check a car", detail: "Free VIN check", href: `/${code}/check`, icon: "fa-clipboard-check" }]
      : []),
    { title: "Refer and earn", detail: `Earn ${RATE} on renters you send`, href: `/${code}/referral`, icon: "fa-hand-holding-dollar" },
  ];

  return (
    <>
      {/* Who this business is, in machine-readable form. The visible page says
          it in prose, which a person reads and a search engine only guesses
          at; this is the same claim stated unambiguously. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(dealer) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd(code)) }}
      />

      {/* ── Hero ─────────────────────────────────────────────────────────
          Leads with what most people here come for, a car by the week, and
          its real starting price. Short, so the tiles below are on the same
          screen. The photo is the page's only preload. */}
      <section className="home-hero">
        <Image
          className="home-hero-photo"
          src="/img/hero-benz.png"
          alt=""
          fill
          sizes="100vw"
          preload
        />
        <div className="home-hero-inner">
          <h2 className="home-hero-title">
            {us && fleet.length > 0 ? (
              <>
                Rent a car <span>by the week</span> in Greensboro
              </>
            ) : us ? (
              "Buy, rent or finance a car in Greensboro"
            ) : (
              "Buy, rent or finance a car in Nigeria"
            )}
          </h2>
          {/* Both payment modes let a renter pay at pickup. */}
          {fleet.length > 0 && fromDaily != null && (
            <p className="home-hero-text">
              {fromWeekly != null
                ? `From ${fmt(fromWeekly)} a week.`
                : `From ${fmt(fromDaily)} a day.`}{" "}
              Reserve online, then pay when you pick it up.
            </p>
          )}
          {site?.phone && phone && (
            <p className="home-hero-call">
              <a href={`tel:${site.phone}`} className="home-link">
                Questions? Call {phone}
              </a>
            </p>
          )}
        </div>
      </section>

      {/* ── Tasks ────────────────────────────────────────────────────────
          One tile per thing a visitor came to do, each with a live count
          where there is one. */}
      <section className="home-section">
        <h2 className="home-sr">What do you need?</h2>
        <ul className="home-tiles">
          {tiles.map((t) => (
            <li key={t.title}>
              <Link href={t.href} className={`home-tile${t.main ? " home-tile--main" : ""}`}>
                <i className={`fas ${t.icon}`} aria-hidden="true" />
                <span className="home-tile-title">{t.title}</span>
                <span className="home-tile-detail">{t.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
        {/* The rent-to-own disclosure in one line, beside the tile that
            offers it. It says no more than /rent-to-own does: the old "every
            payment counts" left out the deposit and the refund rule. */}
        {us && (
          <p className="home-terms">
            Rent to own: once your rent reaches the total for your car&rsquo;s
            category, the car is yours. Deposits don&rsquo;t count. No balloon
            payment. Stop anytime and owe nothing more, but rent already paid
            isn&rsquo;t refunded.{" "}
            <Link href={`/${code}/rent-to-own`} className="home-link">
              See the terms
            </Link>
          </p>
        )}
      </section>

      {/* ── Cars for rent ────────────────────────────────────────────────
          The rental list's first three cars, in its rows. */}
      {fleet.length > 0 && (
        <section className="home-section home-rent">
          <h2 className="home-h2">Cars for rent</h2>
          <p className="home-sub">Longer rentals get the better rate automatically.</p>
          <ul className="cl-list">
            {rows.map((v) => {
              const weekly = v.tariff.weeklyMinor;
              return (
                <CarRow
                  key={v.id}
                  href={`/${code}/rentals/${v.slug}`}
                  image={v.image}
                  preload={false}
                  title={carName(v)}
                  price={fmt(weekly ?? v.tariff.dailyMinor)}
                  unit={weekly != null ? "a week" : "a day"}
                  details={[
                    weekly != null && `or ${fmt(v.tariff.dailyMinor)} a day`,
                    v.transmission,
                    v.seats != null && `${v.seats} seats`,
                  ]}
                  badge={v.tariff.withDriverAvailable ? "Driver available" : null}
                />
              );
            })}
          </ul>
          <Link href={`/${code}/rentals`} className="btn btn-outline home-more">
            See all {cars(fleet.length)} for rent
          </Link>
        </section>
      )}

      <div className="home-pair">
        {/* ── Refer and earn ─────────────────────────────────────────────
            Rentals only. Sale referrals are on hold while a North Carolina
            lawyer looks at G.S. 20-306, which limits paying unlicensed
            people for vehicle-sale referrals. The rate and the example are
            computed, and the example is one week of one real car: the
            arithmetic, not a promise of what anyone will earn. */}
        <section className="home-section">
          <div className="home-refer-card">
            <p className="home-eyebrow">Earn with referrals</p>
            <h2 className="home-h2">Send a renter. Earn {RATE}.</h2>
            <p>
              Know someone who needs a car? You get {RATE} of each rental they
              pay for, every week they keep renting.
            </p>
            {example && (
              <p>
                Example: {example.car} rents for {fmt(example.weekMinor)} a week ·{" "}
                <strong>you earn {fmt(example.earnMinor)}</strong>
              </p>
            )}
            <p className="home-fine">
              Free to join. No recruiting. Paid once your renter has paid and
              the car is back. Nothing is paid on canceled or refunded rentals,
              and refundable deposits and taxes don&rsquo;t count. Request
              payouts from your partner page.
            </p>
            <div className="home-actions">
              <Link href={`/${code}/referral`} className="btn btn-primary">
                Become a partner
              </Link>
            </div>
            {/* The only public link to partner login. */}
            <Link href="/partner/login" className="home-link">
              Already a partner? Log in
            </Link>
          </div>
        </section>

        {/* ── What you can count on ──────────────────────────────────────
            Each line is something the site does, not a promise in copy:
            estimates and agreements share one calculation, and the database
            refuses overlapping bookings. */}
        <section className="home-section">
          <h2 className="home-h2">What you can count on</h2>
          <ul className="home-checks">
            <li>
              <i className="fas fa-check" aria-hidden="true" />
              <span>
                The figures you see are the figures you sign. Our estimates use
                the same math as the agreement.
              </span>
            </li>
            <li>
              <i className="fas fa-check" aria-hidden="true" />
              <span>
                No double bookings. We check your dates against every other
                booking.
              </span>
            </li>
            <li>
              <i className="fas fa-check" aria-hidden="true" />
              <span>
                We never ask for your {us ? "Social Security number" : "BVN"} or
                bank details on this website. To rent, we ask for a photo of
                your driver&rsquo;s license.
              </span>
            </li>
          </ul>
          <div className="home-founder">
            <Image src="/img/ceo.png" alt="Adedayo Aremu" width={1024} height={1536} sizes="56px" />
            <p>
              Founded by Adedayo Aremu ·{" "}
              {formatMilestone(stats.vehiclesSold, market.locale)} vehicles sold
              <br />
              <Link href={`/${code}/about`} className="home-link">
                Read our story
              </Link>
            </p>
          </div>
        </section>
      </div>

      {/* ── Visit or call ──────────────────────────────────────────────────
          Every line from the location record, and nothing without one: with
          no showroom on file (Nigeria today) it is the email and the form. */}
      <section className="home-section">
        <h2 className="home-h2">{site ? "Visit or call" : "Contact us"}</h2>
        <ul className="home-checks">
          {address && (
            <li>
              <i className="fas fa-location-dot" aria-hidden="true" />
              <span>
                {address}
                <br />
                <a
                  href={mapLinkUrl(address)}
                  className="home-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Get directions<span className="home-sr"> (opens in a new tab)</span>
                </a>
              </span>
            </li>
          )}
          {hours && (
            <li>
              <i className="fas fa-clock" aria-hidden="true" />
              <span>{hours}</span>
            </li>
          )}
          <li>
            <i className="fas fa-envelope" aria-hidden="true" />
            <span>
              <a href={`mailto:${CONTACT_EMAIL}`} className="home-link">
                {CONTACT_EMAIL}
              </a>
            </span>
          </li>
        </ul>
        <div className="home-actions">
          {site?.phone && phone && (
            <a href={`tel:${site.phone}`} className="btn btn-primary">
              Call {phone}
            </a>
          )}
          <Link
            href={`/${code}/contact`}
            className={`btn ${site?.phone ? "btn-outline" : "btn-primary"}`}
          >
            Send a message
          </Link>
          {whatsapp && (
            <a href={whatsapp} className="btn btn-outline" target="_blank" rel="noopener noreferrer">
              Chat on WhatsApp
            </a>
          )}
        </div>
      </section>
    </>
  );
}
