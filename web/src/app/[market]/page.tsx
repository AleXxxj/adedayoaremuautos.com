import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MARKETS, formatDistance, isMarketCode, type MarketCode } from "@/lib/market";
import { dealerJsonLd, websiteJsonLd } from "@/lib/seo/dealer";
import { listInventory } from "@/lib/repositories/vehicles";
import { listFleet, byWeekCost, fromPrices, weekCost } from "@/lib/repositories/rentals";
import { listLocations, formatPhone, summariseHours, type OpeningHour } from "@/lib/repositories/locations";
import { getSiteStats, formatMilestone } from "@/lib/stats";
import { formatMoney, money } from "@/lib/money";
import { mediaUrl } from "@/lib/media";
import { canResize } from "@/lib/photo";
import { DEFAULT_RENTAL_COMMISSION_BPS, formatBps, weeklyExamples } from "@/lib/referral";
import { CONTACT_EMAIL, mapLinkUrl, whatsappUrl } from "@/lib/contact";
import { HeroSlides } from "@/components/home/HeroSlides";
import { heroDeck, type HeroSlide } from "@/components/home/heroDeck";
import { FindCar, type FindChip } from "@/components/home/FindCar";
import { BudgetFinder, type FinderCar, type FinderSide } from "@/components/home/BudgetFinder";
import { AskAyo } from "@/components/home/AskAyo";
import { HomeCarCard } from "@/components/home/HomeCarCard";
import {
  carsLabel,
  priceCeilings,
  spread,
  topBrands,
  weeklyBudgets,
  type StockCar,
} from "@/components/home/homeData";
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

/**
 * One read of the sale stock serves the whole page: the hero's newest cars,
 * the search chips, the budget finder and the row of cars for sale. A cap,
 * not a page size: the business lists a few dozen cars at most.
 */
const SALE_READ = 120;
/** The hero shows the newest cars that have a photo, from the first twelve. */
const HERO_FROM = 12;
const HERO_SLIDES = 6;
/** Rental cars whose photos the hero's rent-to-own slides use, in turn. */
const HERO_OWN_PHOTOS = 3;
/** Cars in each swipe row; the rest are a tap away on their lists. */
const ROW = 8;
/** Cars handed to the budget finder for display (the counts use them all). */
const FINDER_CARS = 30;

const carName = (v: { year: number; make: string; model: string; trim: string | null }) =>
  [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");

/** Up to FINDER_CARS of them, spread across the prices so any budget finds its top fits. */
const forFinder = (cars: FinderCar[]) =>
  spread([...cars].sort((a, b) => a.minor - b.minor), FINDER_CARS);

type Tint = "rent" | "own" | "buy" | "finance" | "check" | "earn";

interface Tile {
  title: string;
  detail: string;
  href: string;
  icon: string;
  tint: Tint;
  /** Up to three real cars, for Rent and Buy. */
  photos?: string[];
}

/**
 * The home page, built for a phone first and for very little reading.
 *
 * A slideshow of the cars for sale behind three big buttons (Buy, Sell,
 * Rent); a search box with chips; the six tasks as an app-like grid; a
 * budget finder; one swipe row of cars to rent and one of cars to buy; the
 * referral program; why people trust the business; and how to reach it.
 *
 * Every price, count, rate and example is computed from the database and the
 * site's own constants. Nothing is typed by hand, so the home page can't
 * disagree with the page it links to.
 */
export default async function MarketHome({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();

  const market = MARKETS[code];
  const [fleet, sale, stats, sites, dealer] = await Promise.all([
    listFleet(code),
    listInventory(code, { limit: SALE_READ, sort: "newest" }),
    getSiteStats(code),
    listLocations(code),
    dealerJsonLd(code),
  ]);

  const us = code === "us";
  const site = sites[0];
  const assistantOn = Boolean(process.env.ANTHROPIC_API_KEY);
  const fmt = (minor: number) => formatMoney(money(minor, market.currency), market.locale);
  // Naira amounts in the millions read better short on a chip.
  const fmtChip = (minor: number) =>
    formatMoney(money(minor, market.currency), market.locale, { compact: minor >= 100_000_000 });
  const href = (path: string) => `/${code}${path}`;

  // ── Cars for sale ───────────────────────────────────────────────────────
  const forSale = sale.total;
  const saleCars = sale.vehicles;
  const priced = saleCars.filter((v): v is typeof v & { priceMinor: number } => v.priceMinor != null);
  const fromSale = priced.length ? Math.min(...priced.map((v) => v.priceMinor)) : null;
  const saleSlides: HeroSlide[] = saleCars
    .slice(0, HERO_FROM)
    .filter((v) => v.primaryImage)
    .slice(0, HERO_SLIDES)
    .map((v) => ({
      kind: "car",
      src: mediaUrl(v.primaryImage!),
      name: carName(v),
      note: v.priceMinor != null ? fmt(v.priceMinor) : null,
      href: href(`/inventory/${v.slug}`),
    }));

  // ── Cars for rent ───────────────────────────────────────────────────────
  // The rental list's order, so the row's first cars are the list's.
  const rentRows = [...fleet].sort(byWeekCost);
  // Rent to own is offered in the US only. Its hero slides sit over real
  // rental cars, named as cars for rent and with no price: rent to own is
  // priced by category, not by the car in the photo.
  const ownSlides: HeroSlide[] = us
    ? rentRows
        .filter((v) => v.image)
        .slice(0, HERO_OWN_PHOTOS)
        .map((v) => ({
          kind: "own",
          src: v.image!,
          name: carName(v),
          note: "for rent",
          href: href(`/rentals/${v.slug}`),
        }))
    : [];
  const slides = heroDeck(saleSlides, ownSlides);
  const ownSlideShown = slides.some((s) => s.kind === "own");
  const { fromDaily, fromWeekly } = fromPrices(fleet);
  const rentFrom =
    fromWeekly != null ? `${fmt(fromWeekly)}/wk` : fromDaily != null ? `${fmt(fromDaily)}/day` : null;
  // The first example on the referral page, so the two quote the same car.
  const example = weeklyExamples(fleet, 1)[0];

  // ── Hero ────────────────────────────────────────────────────────────────
  const heroLine = [
    forSale > 0 && `${carsLabel(forSale)} for sale`,
    fleet.length > 0 &&
      (fromWeekly != null
        ? `Rentals from ${fmt(fromWeekly)} a week`
        : fromDaily != null && `Rentals from ${fmt(fromDaily)} a day`),
  ]
    .filter(Boolean)
    .join(" · ");
  const phone = formatPhone(site?.phone ?? null);

  // ── Search chips: price ceilings with cars under them, then the top brands ─
  const stock: StockCar[] = saleCars.map((v) => ({
    make: v.make,
    model: v.model,
    trim: v.trim,
    year: v.year,
    priceMinor: v.priceMinor,
  }));
  const findChips: FindChip[] = [
    ...spread(priceCeilings(priced.map((v) => v.priceMinor / 100), false), 3).map((c) => ({
      label: `Up to ${fmtChip(c.major * 100)}`,
      href: href(`/inventory?price=0-${c.major}`),
    })),
    ...topBrands(stock, 3).map((b) => ({
      label: `${b.brand} · ${b.count}`,
      href: href(`/inventory?q=${encodeURIComponent(b.brand)}`),
    })),
  ];

  // ── Tiles ───────────────────────────────────────────────────────────────
  const tiles: Tile[] = [
    fleet.length > 0
      ? {
          title: "Rent a car",
          detail: [carsLabel(fleet.length), rentFrom && `from ${rentFrom}`].filter(Boolean).join(" · "),
          href: href("/rentals"),
          icon: "fa-key",
          tint: "rent",
          photos: rentRows.flatMap((v) => (v.image ? [v.image] : [])).slice(0, 3),
        }
      : { title: "Rent a car", detail: "Ask about a rental", href: href("/contact?type=rental"), icon: "fa-key", tint: "rent" },
    ...(us
      ? [{ title: "Rent to own", detail: "Rent toward owning a car", href: href("/rent-to-own"), icon: "fa-hand-holding-heart", tint: "own" as const }]
      : []),
    forSale > 0
      ? {
          title: "Buy a car",
          detail: [carsLabel(forSale), fromSale != null && `from ${fmt(fromSale)}`].filter(Boolean).join(" · "),
          href: href("/inventory"),
          icon: "fa-car",
          tint: "buy",
          photos: saleCars.flatMap((v) => (v.primaryImage ? [mediaUrl(v.primaryImage)] : [])).slice(0, 3),
        }
      : { title: "Buy a car", detail: "Tell us what you want", href: href("/contact"), icon: "fa-car", tint: "buy" },
    { title: "Financing", detail: "Estimate a payment", href: href("/financing"), icon: "fa-calculator", tint: "finance" },
    ...(us
      ? [{ title: "Check a car", detail: "Free VIN check", href: "/us/check", icon: "fa-clipboard-check", tint: "check" as const }]
      : []),
    { title: "Refer and earn", detail: `${RATE} of each rental`, href: href("/referral"), icon: "fa-hand-holding-dollar", tint: "earn" },
  ];

  // ── Budget finder ───────────────────────────────────────────────────────
  const rentSide: FinderSide | null = fleet.length
    ? {
        amounts: fleet.map(weekCost),
        cars: forFinder(
          rentRows.map((v) => ({
            name: carName(v),
            minor: weekCost(v),
            price:
              v.tariff.weeklyMinor != null
                ? `${fmt(v.tariff.weeklyMinor)} a week`
                : `${fmt(v.tariff.dailyMinor)} a day`,
            photo: v.image,
            href: href(`/rentals/${v.slug}`),
          })),
        ),
        chips: weeklyBudgets(
          fleet.flatMap((v) => (v.tariff.weeklyMinor != null ? [v.tariff.weeklyMinor] : [])),
          fleet.map(weekCost),
          4,
        ),
        href: href("/rentals"),
      }
    : null;
  const buySide: FinderSide | null = priced.length
    ? {
        amounts: priced.map((v) => v.priceMinor),
        cars: forFinder(
          priced.map((v) => ({
            name: carName(v),
            minor: v.priceMinor,
            price: fmt(v.priceMinor),
            photo: v.primaryImage ? mediaUrl(v.primaryImage) : null,
            href: href(`/inventory/${v.slug}`),
          })),
        ),
        chips: spread(priceCeilings(priced.map((v) => v.priceMinor / 100), true), 4).map((c) => c.major * 100),
        href: href("/inventory"),
      }
    : null;

  // ── Visit or call ───────────────────────────────────────────────────────
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

      {/* ── Hero ───────────────────────────────────────────────────────────
          The cars for sale, one after another, above three buttons, with a
          rent-to-own slide after every second car (US only). The slide's
          line is the rent-to-own disclosure, with the facts of the
          `home-terms` paragraph below and no claim it doesn't make. */}
      <HeroSlides
        slides={slides}
        fallback="/img/hero-benz.png"
        head={
          <>
            <p className="home-eyebrow">{us ? "Car dealer in Greensboro, NC" : "Car dealer in Nigeria"}</p>
            <h2 className="hh-title">
              Buy it. Rent it.
              <span>Or sell us yours.</span>
            </h2>
            {heroLine && <p className="hh-line">{heroLine}</p>}
          </>
        }
        ownHead={
          ownSlideShown ? (
            <>
              <p className="home-eyebrow">Rent to own</p>
              <h2 className="hh-title">
                Rent it.
                <span>Then own it.</span>
              </h2>
              <p className="hh-line hh-line--terms">
                Once your rent reaches the total for your car&rsquo;s category, it&rsquo;s yours.
                Deposits don&rsquo;t count. Rent already paid isn&rsquo;t refunded.{" "}
                <Link href={href("/rent-to-own")} className="hh-more">
                  See how it works
                </Link>
              </p>
            </>
          ) : null
        }
      >
        {/* Three cards, each with its own color: the green one is Buy. The
            hidden comma makes a screen reader say "Buy, 16 cars". */}
        <div className="hh-actions">
          <Link href={forSale > 0 ? href("/inventory") : href("/contact")} className="hh-btn" data-tint="buy">
            <span className="hh-btn-chip">
              <i className="fas fa-car" aria-hidden="true" />
            </span>
            <span className="hh-btn-label">
              Buy<span className="home-sr">, </span>
            </span>
            <span className="hh-btn-sub">{forSale > 0 ? carsLabel(forSale) : "Ask us"}</span>
          </Link>
          {/* No offer is promised: the business makes one only for a car it wants. */}
          <Link href={href("/sell")} className="hh-btn" data-tint="sell">
            <span className="hh-btn-chip">
              <i className="fas fa-tag" aria-hidden="true" />
            </span>
            <span className="hh-btn-label">
              Sell<span className="home-sr">, </span>
            </span>
            <span className="hh-btn-sub">Tell us about it</span>
          </Link>
          <Link
            href={fleet.length > 0 ? href("/rentals") : href("/contact?type=rental")}
            className="hh-btn"
            data-tint="rent"
          >
            <span className="hh-btn-chip">
              <i className="fas fa-key" aria-hidden="true" />
            </span>
            <span className="hh-btn-label">
              Rent<span className="home-sr">, </span>
            </span>
            <span className="hh-btn-sub">{rentFrom ? `From ${rentFrom}` : "Ask us"}</span>
          </Link>
        </div>

        <div className="hh-links">
          {assistantOn ? (
            <AskAyo className="hh-link" />
          ) : (
            site?.phone &&
            phone && (
              <a href={`tel:${site.phone}`} className="hh-link">
                <i className="fas fa-phone" aria-hidden="true" />
                <span>
                  Questions? <strong>Call {phone}</strong>
                </span>
              </a>
            )
          )}
          <Link href={href("/referral")} className="hh-link">
            <i className="fas fa-hand-holding-dollar" aria-hidden="true" />
            <span>
              Know someone who needs a car? <strong>Earn {RATE}</strong>
            </span>
          </Link>
        </div>
      </HeroSlides>

      {/* ── Find your car ────────────────────────────────────────────────── */}
      <div className="home-wrap home-find">
        <FindCar
          action={href("/inventory")}
          stock={stock}
          chips={findChips}
          nextYear={new Date().getFullYear() + 1}
        />
      </div>

      {/* ── Tasks ────────────────────────────────────────────────────────
          One tile per thing a visitor came to do, each with a live line. */}
      <section className="home-wrap home-block">
        <h2 className="home-sr">What do you need?</h2>
        <ul className="home-tiles">
          {tiles.map((t, i) => (
            <li key={t.title} style={{ "--i": i } as CSSProperties}>
              <Link href={t.href} className="home-tile" data-tint={t.tint}>
                <span className="home-tile-top">
                  <span className="home-tile-icon">
                    <i className={`fas ${t.icon}`} aria-hidden="true" />
                  </span>
                  {t.photos && t.photos.length > 0 && (
                    <span className="home-tile-photos" aria-hidden="true">
                      {t.photos.map((p, i) => (
                        <span key={`${i}-${p}`} className="home-tile-photo">
                          <Image src={p} alt="" fill sizes="32px" unoptimized={!canResize(p)} />
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span className="home-tile-title">
                  {t.title}
                  <i className="fas fa-chevron-right" aria-hidden="true" />
                </span>
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
            <Link href={href("/rent-to-own")} className="home-link">
              See the terms
            </Link>
          </p>
        )}
      </section>

      {/* ── How much do you have? ──────────────────────────────────────── */}
      {(rentSide || buySide) && (
        <section className="home-wrap home-block home-finder">
          <div className="home-finder-head">
            <p className="home-eyebrow">Your budget</p>
            <h2 className="home-title">How much do you have?</h2>
          </div>
          <BudgetFinder
            currency={market.currency}
            locale={market.locale}
            rent={rentSide}
            buy={buySide}
            start={us ? "rent" : "buy"}
          />
        </section>
      )}

      {/* ── Cars for rent: the rental list's first cars, in its order ───── */}
      {fleet.length > 0 && (
        <section className="home-wrap home-block">
          <div className="home-row-head">
            <h2 className="home-title">Cars for rent</h2>
            <Link href={href("/rentals")} className="home-row-all">
              See all {fleet.length}
              <i className="fas fa-arrow-right" aria-hidden="true" />
            </Link>
          </div>
          <ul className="home-row">
            {rentRows.slice(0, ROW).map((v) => {
              const weekly = v.tariff.weeklyMinor;
              return (
                <HomeCarCard
                  key={v.id}
                  href={href(`/rentals/${v.slug}`)}
                  image={v.image}
                  name={carName(v)}
                  price={fmt(weekly ?? v.tariff.dailyMinor)}
                  unit={weekly != null ? "a week" : "a day"}
                  details={[weekly != null && `or ${fmt(v.tariff.dailyMinor)} a day`, v.transmission]}
                  badge={v.tariff.withDriverAvailable ? "Driver available" : null}
                />
              );
            })}
            <li className="hc hc--more">
              <Link href={href("/rentals")} className="hc-more">
                See all {carsLabel(fleet.length)} for rent
                <i className="fas fa-arrow-right" aria-hidden="true" />
              </Link>
            </li>
          </ul>
        </section>
      )}

      {/* ── Cars for sale: the newest first ──────────────────────────────── */}
      {forSale > 0 && (
        <section className="home-wrap home-block">
          <div className="home-row-head">
            <h2 className="home-title">Cars for sale</h2>
            <Link href={href("/inventory")} className="home-row-all">
              See all {forSale}
              <i className="fas fa-arrow-right" aria-hidden="true" />
            </Link>
          </div>
          <ul className="home-row">
            {saleCars.slice(0, ROW).map((v) => (
              <HomeCarCard
                key={v.id}
                href={href(`/inventory/${v.slug}`)}
                image={v.primaryImage ? mediaUrl(v.primaryImage) : null}
                name={carName(v)}
                price={v.priceMinor != null ? fmt(v.priceMinor) : "Price on request"}
                details={[v.mileage != null && formatDistance(v.mileage, market), v.transmission]}
                badge={v.status === "pending" ? "Sale pending" : null}
              />
            ))}
            <li className="hc hc--more">
              <Link href={href("/inventory")} className="hc-more">
                See all {carsLabel(forSale)} for sale
                <i className="fas fa-arrow-right" aria-hidden="true" />
              </Link>
            </li>
          </ul>
        </section>
      )}

      {/* ── Refer and earn ───────────────────────────────────────────────
          Rentals only. Sale referrals are on hold while a North Carolina
          lawyer looks at G.S. 20-306, which limits paying unlicensed people
          for vehicle-sale referrals. The rate and the example are computed,
          and the example is one week of one real car: the arithmetic, not a
          promise of what anyone will earn. */}
      <div className="home-pair">
      <section className="home-wrap home-block">
        <div className="home-refer">
          <p className="home-eyebrow">Earn with referrals</p>
          <h2 className="home-title">
            Send a renter. <span>Earn {RATE}.</span>
          </h2>
          <p className="home-refer-text">
            You get {RATE} of each rental they pay for, every week they rent.
          </p>
          {example && (
            <p className="home-refer-example">
              {example.car} rents for {fmt(example.weekMinor)} a week ·{" "}
              <strong>you earn {fmt(example.earnMinor)}</strong>
            </p>
          )}
          <p className="home-fine">
            Free to join. Paid after your renter pays and the car is back.{" "}
            <Link href={href("/referral")} className="home-link">
              See the rules
            </Link>
          </p>
          <div className="home-actions">
            <Link href={href("/referral")} className="home-btn home-btn--primary">
              Become a partner
            </Link>
            <Link href="/partner/login" className="home-btn">
              <i className="fas fa-user" aria-hidden="true" />
              Partner log in
            </Link>
          </div>
        </div>
      </section>

      {/* ── Why people trust us ──────────────────────────────────────────
          Each line is something the site does, not a promise in copy:
          estimates and agreements share one calculation, and the database
          refuses overlapping bookings. */}
      <section className="home-wrap home-block">
        <h2 className="home-title">Why people trust us</h2>
        <ul className="home-trust">
          <li>
            <span className="home-trust-icon">
              <i className="fas fa-file-signature" aria-hidden="true" />
            </span>
            The price you see is the price you sign.
          </li>
          <li>
            <span className="home-trust-icon">
              <i className="fas fa-calendar-check" aria-hidden="true" />
            </span>
            No double bookings.
          </li>
          <li>
            <span className="home-trust-icon">
              <i className="fas fa-shield-halved" aria-hidden="true" />
            </span>
            We never ask for your {us ? "SSN" : "BVN"} or bank details online.
          </li>
        </ul>
        <Link href={href("/about")} className="home-founder">
          <Image src="/img/ceo.png" alt="" width={1024} height={1536} sizes="56px" />
          <span>
            <span className="home-founder-name">
              Founded by Adedayo Aremu · {formatMilestone(stats.vehiclesSold, market.locale)} vehicles sold
            </span>
            <span className="home-founder-link">Our story</span>
          </span>
          <i className="fas fa-chevron-right" aria-hidden="true" />
        </Link>
      </section>
      </div>

      {/* ── Visit or call ──────────────────────────────────────────────────
          Every line from the location record, and nothing without one: with
          no showroom on file (Nigeria today) it is the email and the form. */}
      <section className="home-wrap home-block home-visit">
        <h2 className="home-title">{site ? "Visit or call" : "Contact us"}</h2>
        <ul className="home-visit-list">
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
            <a href={`mailto:${CONTACT_EMAIL}`} className="home-link">
              {CONTACT_EMAIL}
            </a>
          </li>
        </ul>
        <div className="home-actions">
          {site?.phone && phone && (
            <a href={`tel:${site.phone}`} className="home-btn home-btn--primary">
              <i className="fas fa-phone" aria-hidden="true" />
              Call {phone}
            </a>
          )}
          <Link
            href={href("/contact")}
            className={`home-btn${site?.phone ? "" : " home-btn--primary"}`}
          >
            Send a message
          </Link>
          {whatsapp && (
            <a href={whatsapp} className="home-btn" target="_blank" rel="noopener noreferrer">
              <i className="fab fa-whatsapp" aria-hidden="true" />
              Chat on WhatsApp
            </a>
          )}
        </div>
      </section>
    </>
  );
}
