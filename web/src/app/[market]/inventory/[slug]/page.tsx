import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode, formatDistance } from "@/lib/market";
import { getVehicleBySlug, listInventory } from "@/lib/repositories/vehicles";
import { getFleetVehicle } from "@/lib/repositories/rentals";
import { listTiers } from "@/lib/repositories/tiers";
import { listLocations, formatPhone } from "@/lib/repositories/locations";
import { formatMoney, money, toMajor, monthlyPayment } from "@/lib/money";
import { mediaUrl } from "@/lib/media";
import { siteUrl } from "@/lib/siteUrl";
import { CarCard } from "@/components/cars/CarCard";
import { ContactBar } from "@/components/cars/ContactBar";
import { FinanceEstimate } from "@/components/cars/FinanceEstimate";
import { Gallery } from "@/components/cars/Gallery";
import { ReadMore } from "@/components/cars/ReadMore";
import { RecentlyViewed } from "@/components/cars/RecentlyViewed";
import { SaveButton } from "@/components/cars/SaveButton";
import {
  bodyLabel,
  bodyTypeOf,
  cardFor,
  compareHref,
  isJustIn,
  shortDrive,
  shortFuel,
  shortTransmission,
  similarCars,
  splitName,
} from "@/components/cars/carData";
import "@/styles/cars.css";
import { GuideLinks } from "@/components/guides/GuideLinks";
import { SaleHoldCard } from "@/components/cars/SaleHoldCard";
import { refreshSaleHolds, saleHoldOffer } from "@/lib/saleHolds/offer";

/**
 * Cached and revalidated, not rebuilt per visitor.
 *
 * Every public page was `force-dynamic`, so each view needed a live database
 * round trip and a brief backend problem produced a dead site rather than a
 * slightly stale one. The admin calls `revalidatePath` when the underlying
 * records change, so edits still appear immediately; this window only governs
 * how long a cached copy keeps serving when nothing has changed — and what
 * the page falls back on when the database cannot be reached at all.
 */
export const revalidate = 300;

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
    title: `${title}`,
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

/**
 * One car for sale.
 *
 * Photos first and very little to read. On a phone, top to bottom: the name,
 * three facts and the price; the photos; then specifications, features, the
 * description, ways to pay, the recall check, similar cars and the cars
 * looked at before. Call, the assistant and "I'm interested" stay pinned to
 * the bottom of the screen the whole way down (ContactBar). On a wide screen
 * the name, price and buttons stay beside the photos instead.
 */
export default async function CarDetailPage({
  params,
}: {
  params: Promise<{ market: string; slug: string }>;
}) {
  const { market: code, slug } = await params;
  if (!isMarketCode(code)) notFound();

  const market = MARKETS[code];
  // A hold whose time is up ends here, so the car reads as available again.
  // Nothing happens while SALE_HOLD_ENABLED is off.
  await refreshSaleHolds();
  const v = await getVehicleBySlug(code, slug);
  if (!v) notFound();
  // "Hold this car", in "Paying for it". Null unless the switch is on.
  const holdOffer = saleHoldOffer(code, v);

  const alsoRented = v.listingKind === "both" || v.listingKind === "rental";
  const [{ vehicles: others }, sites, rental, tiers] = await Promise.all([
    listInventory(code, { limit: 60 }),
    listLocations(code),
    alsoRented ? getFleetVehicle(code, slug) : null,
    v.rentalTierId ? listTiers(code) : [],
  ]);
  const site = sites[0];
  const assistantOn = Boolean(process.env.ANTHROPIC_API_KEY);

  const title = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
  const name = splitName(v);
  const price = v.priceMinor != null ? money(v.priceMinor, market.currency) : null;
  const fmt = (m: { minor: number; currency: typeof market.currency }) =>
    formatMoney(m, market.locale);
  const fmtMinor = (minor: number) => fmt(money(minor, market.currency));

  // Indicative only, on the market's longest term at zero interest where the
  // market does not quote APR. Never presented as an offer.
  const from =
    price && !market.financing.quotesApr
      ? monthlyPayment(price, 0, market.financing.termMonths.at(-1)!)
      : null;

  /*
   * The listing, in the vocabulary Google reads.
   *
   * Typed Car rather than Vehicle. Car is a subtype of both Vehicle and
   * Product, and the moment an `offers` block is present Google applies its
   * product rules — so the more specific type is what makes those rules fit
   * rather than merely apply.
   *
   * Search Console reported a critical "missing field image", which is the
   * whole reason a listing never earned a rich result: no photograph, no card.
   * Absolute URLs, because a site-relative path in structured data resolves
   * against whatever host the crawler happens to be on.
   *
   * Two fields Google also asks for are deliberately absent. `review` and
   * `aggregateRating` would have to be invented — this business has no
   * collected reviews — and publishing ratings nobody gave is both a
   * misrepresentation and against Google's own policy. A non-critical warning
   * is the correct price for not making them up.
   */
  const base = siteUrl();
  const absolute = (u: string) =>
    /^https?:\/\//.test(u) ? u : `${base}${u.startsWith("/") ? "" : "/"}${u}`;

  const condition = /new/i.test(v.condition)
    ? "https://schema.org/NewCondition"
    : "https://schema.org/UsedCondition";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Car",
    name: title,
    ...(v.images.length > 0
      ? { image: v.images.map((i) => absolute(mediaUrl(i.storageKey))) }
      : {}),
    description:
      v.description?.trim() ||
      `${v.condition} ${title} for sale at Adedayo Aremu Autos, ${market.name}.`,
    url: `${base}/${code}/inventory/${v.slug}`,
    vehicleModelDate: String(v.year),
    brand: { "@type": "Brand", name: v.make },
    model: v.model,
    itemCondition: condition,
    ...(v.bodyStyle ? { bodyType: v.bodyStyle } : {}),
    ...(v.exteriorColor ? { color: v.exteriorColor } : {}),
    ...(v.fuelType ? { fuelType: v.fuelType } : {}),
    ...(v.transmission ? { vehicleTransmission: v.transmission } : {}),
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
            itemCondition: condition,
            url: `${base}/${code}/inventory/${v.slug}`,
            availability:
              v.status === "available"
                ? "https://schema.org/InStock"
                : v.status === "sold"
                  ? "https://schema.org/SoldOut"
                  : "https://schema.org/LimitedAvailability",
            // Ties the listing to the dealership described on the homepage,
            // so the two are one entity to a search engine rather than a
            // business and an unrelated car that happens to share a site.
            seller: { "@id": `${base}/${code}#dealer` },
          },
        }
      : {}),
  };

  // ── The top: three facts, from whatever the record has ──────────────────
  const body = bodyTypeOf(v);
  const drive = shortDrive(v.drivetrain);
  const facts = (
    [
      v.mileage != null && { icon: "fa-gauge-high", text: formatDistance(v.mileage, market) },
      shortTransmission(v.transmission) && { icon: "fa-gears", text: shortTransmission(v.transmission)! },
      drive && { icon: "fa-road", text: drive },
      shortFuel(v.fuelType, market) && { icon: "fa-gas-pump", text: shortFuel(v.fuelType, market)! },
      body && { icon: "fa-car-side", text: bodyLabel(body) },
      v.seats != null && { icon: "fa-user-group", text: `${v.seats} seats` },
    ] as (false | null | { icon: string; text: string })[]
  )
    .filter((f): f is { icon: string; text: string } => Boolean(f))
    .slice(0, 3);

  // ── Specifications: only the rows this record has ───────────────────────
  const specs = (
    [
      ["Year", String(v.year)],
      ["Mileage", v.mileage != null ? formatDistance(v.mileage, market) : null],
      ["Body", v.bodyStyle],
      ["Engine", v.engine],
      ["Transmission", v.transmission],
      ["Drive", v.drivetrain],
      ["Fuel", v.fuelType],
      ["Seats", v.seats != null ? String(v.seats) : null],
      ["Color", v.exteriorColor],
      ["Interior", v.interiorColor],
      ["Condition", v.condition],
      [market.vehicleIdLabel, v.vin ?? v.chassisNo],
      ["Stock number", v.stockNumber],
    ] as [string, string | null][]
  ).filter((r): r is [string, string] => Boolean(r[1]?.trim()));
  const features = ((v.features ?? []) as string[]).filter((f) => f?.trim());
  const description = v.description?.trim() ?? "";

  // ── Renting it instead ──────────────────────────────────────────────────
  const sold = v.status === "sold";
  const rentFrom = rental?.bookable
    ? rental.tariff.weeklyMinor != null
      ? `${fmtMinor(rental.tariff.weeklyMinor)} a week`
      : `${fmtMinor(rental.tariff.dailyMinor)} a day`
    : null;

  // ── Rent to own, where this car is in an open category ──────────────────
  // The category pages list only available cars, and so does this.
  const tier =
    v.status === "available" && v.rentalTierId
      ? (tiers.find((t) => t.id === v.rentalTierId && t.ownershipThresholdMinor != null) ?? null)
      : null;
  const tierMoney = (minor: number) => formatMoney(money(minor, tier!.currency), market.locale);

  // ── Similar cars: the same body type first, then the nearest price ──────
  const similar = similarCars(v, v.priceMinor, others, (car) => car.priceMinor, 3);
  const now = new Date();

  const whatsapp =
    code === "ng" && site?.phone
      ? `https://wa.me/${site.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
          `Hello, I'm interested in the ${title}.`,
        )}`
      : null;

  return (
    <div className="cd-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="cd-wrap">
        <nav className="cd-back" aria-label="Back">
          <Link href={`/${code}/inventory`}>
            <i className="fas fa-arrow-left" aria-hidden="true" />
            All cars for sale
          </Link>
        </nav>

        <div className="cd-grid">
          {/* 1. Name, three facts, price */}
          <section className="cd-top" aria-label="This car">
            <div className="cd-head">
              <h1 className="cd-title">
                <span className="cd-kicker">{name.kicker}</span> {name.name}
                {name.detail && <span className="cd-title-detail"> {name.detail}</span>}
              </h1>
              <SaveButton market={code} slug={v.slug} name={title} variant="pill" />
            </div>

            {/* A sold car keeps its page (people arrive from old links and
                search results), but says so first and offers nothing to buy. */}
            {sold && (
              <p className="cd-sold">
                <i className="fas fa-circle-check" aria-hidden="true" />
                Sold. This car has found its owner.
              </p>
            )}

            {(facts.length > 0 || v.status === "pending") && (
              <ul className="cd-facts">
                {v.status === "pending" && (
                  <li>
                    <i className="fas fa-clock" aria-hidden="true" />
                    Sale pending
                  </li>
                )}
                {facts.map((f) => (
                  <li key={f.icon}>
                    <i className={`fas ${f.icon}`} aria-hidden="true" />
                    {f.text}
                  </li>
                ))}
              </ul>
            )}

            <p className="cd-price">
              <span className="cd-price-label">{sold ? "Was listed at" : "Price"}</span>
              <strong>{price ? fmt(price) : "Price on request"}</strong>
              {from && !sold && (
                <span className="cd-price-sub">
                  Finance from {fmt(from)}/mo over {market.financing.termMonths.at(-1)} months
                </span>
              )}
            </p>

            {rentFrom && !sold && (
              <Link href={`/${code}/rentals/${v.slug}`} className="cd-also">
                Or rent it from {rentFrom}
                <i className="fas fa-chevron-right" aria-hidden="true" />
              </Link>
            )}

            {/* 3. Call · Ask · I'm interested: pinned to the bottom on a phone */}
            {sold ? (
              <Link href={`/${code}/inventory`} className="btn btn-primary cd-sold-next">
                See cars for sale now
              </Link>
            ) : (
            <ContactBar
              market={code}
              slug={v.slug}
              // The whole name, trim included, as the assistant's own list of
              // cars has it: with hand-typed records the model is sometimes
              // in the trim ("Mercedes" "Benz" "Glk").
              carName={title}
              phone={site?.phone ?? null}
              phoneLabel={formatPhone(site?.phone ?? null)}
              assistant={assistantOn}
              whatsapp={whatsapp}
            />
            )}
          </section>

          {/* 2. Photos */}
          <div className="cd-gallery">
            <Gallery images={v.images.map((i) => mediaUrl(i.storageKey))} name={title} />
          </div>

          <div className="cd-body">
            {/* 5. Specifications and features */}
            <section className="cd-section" aria-labelledby="cd-specs">
              <h2 className="cd-h" id="cd-specs">
                Specifications
              </h2>
              <dl className="cd-specs">
                {specs.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              {v.historyReportUrl && (
                <a
                  className="cd-text-link"
                  href={v.historyReportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <i className="fas fa-file-lines" aria-hidden="true" />
                  Vehicle history report
                </a>
              )}
            </section>

            {features.length > 0 && (
              <section className="cd-section" aria-labelledby="cd-features">
                <h2 className="cd-h" id="cd-features">
                  Features
                </h2>
                <ul className="cd-features">
                  {features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* 6. The description, four lines until "Read more" */}
            {description && (
              <section className="cd-section" aria-labelledby="cd-about">
                <h2 className="cd-h" id="cd-about">
                  About this car
                </h2>
                <ReadMore text={description} />
              </section>
            )}

            {/* 7. Paying for it: cards that open, instead of tabs of forms */}
            {!sold && (
            <section className="cd-section" aria-labelledby="cd-pay">
              <h2 className="cd-h" id="cd-pay">
                Paying for it
              </h2>
              <div className="cd-pay-list">
                <details className="cd-pay">
                  <summary>
                    <span className="cd-pay-icon">
                      <i className="fas fa-calculator" aria-hidden="true" />
                    </span>
                    <span className="cd-pay-words">
                      <strong>Finance it</strong>
                      <span>{price ? "Estimate a monthly payment" : "Apply online"}</span>
                    </span>
                    <i className="fas fa-chevron-down cd-pay-turn" aria-hidden="true" />
                  </summary>
                  <div className="cd-pay-body">
                    {price && <FinanceEstimate market={code} priceMajor={toMajor(price)} />}
                    <Link href={`/${code}/financing?vehicle=${v.slug}`} className="cd-btn">
                      Apply for financing
                    </Link>
                  </div>
                </details>

                {tier && (
                  <details className="cd-pay">
                    <summary>
                      <span className="cd-pay-icon">
                        <i className="fas fa-key" aria-hidden="true" />
                      </span>
                      <span className="cd-pay-words">
                        <strong>Rent to own</strong>
                        <span>{tier.name} plan</span>
                      </span>
                      <i className="fas fa-chevron-down cd-pay-turn" aria-hidden="true" />
                    </summary>
                    <div className="cd-pay-body">
                      <dl className="cd-pay-rows">
                        <div>
                          <dt>A day</dt>
                          <dd>{tierMoney(tier.dailyMinor)}</dd>
                        </div>
                        {tier.weeklyMinor != null && (
                          <div>
                            <dt>A week</dt>
                            <dd>{tierMoney(tier.weeklyMinor)}</dd>
                          </div>
                        )}
                        {tier.monthlyMinor != null && (
                          <div>
                            <dt>A month</dt>
                            <dd>{tierMoney(tier.monthlyMinor)}</dd>
                          </div>
                        )}
                        {tier.depositMinor > 0 && (
                          <div>
                            <dt>Deposit</dt>
                            <dd>{tierMoney(tier.depositMinor)}</dd>
                          </div>
                        )}
                        <div className="cd-pay-own">
                          <dt>Total rent to own it</dt>
                          <dd>{tierMoney(tier.ownershipThresholdMinor!)}</dd>
                        </div>
                      </dl>
                      {/* The disclosure, beside the offer. It says no more
                          than /rent-to-own does, in the home page's words. */}
                      <p className="cd-fine">
                        Once your rent reaches the total for your car&rsquo;s category, the car
                        is yours. Deposits don&rsquo;t count. No balloon payment. Stop anytime and
                        owe nothing more, but rent already paid isn&rsquo;t refunded.
                      </p>
                      <Link href={`/${code}/rent-to-own`} className="cd-text-link cd-text-link--tight">
                        See the terms
                      </Link>
                      <Link
                        href={`/${code}/rent-to-own/${tier.slug}/apply?vehicle=${v.slug}`}
                        className="cd-btn"
                      >
                        Apply for rent to own
                      </Link>
                    </div>
                  </details>
                )}

                {holdOffer && (
                  <SaleHoldCard
                    market={code}
                    slug={v.slug}
                    amount={holdOffer.amount}
                    hours={holdOffer.hours}
                    terms={holdOffer.terms}
                    testMode={holdOffer.testMode}
                  />
                )}
              </div>
            </section>
            )}

            {/* 8. Never the VIN in the link: the check page asks for it. */}
            {code === "us" && (
              <Link href="/us/check" className="cd-linkcard">
                <span className="cd-pay-icon">
                  <i className="fas fa-clipboard-check" aria-hidden="true" />
                </span>
                <span className="cd-pay-words">
                  <strong>Check this car&rsquo;s recalls and safety stars</strong>
                  <span>{v.vin ? "Free. The VIN is in the list above." : "Free. Ask us for the VIN."}</span>
                </span>
                <i className="fas fa-chevron-right cd-pay-turn" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>

        {/* 9. Similar cars, and a way to put two side by side */}
        {similar.length > 0 && (
          <section className="cd-section" aria-labelledby="cd-similar">
            <h2 className="cd-h" id="cd-similar">
              Similar cars
            </h2>
            <ul className="cc-row">
              {similar.map((r) => (
                <CarCard
                  key={r.id}
                  market={code}
                  sizes="(min-width: 700px) 33vw, 78vw"
                  card={cardFor(
                    {
                      slug: r.slug,
                      year: r.year,
                      make: r.make,
                      model: r.model,
                      trim: r.trim,
                      bodyStyle: r.bodyStyle,
                      mileage: r.mileage,
                      transmission: r.transmission,
                      fuelType: r.fuelType,
                      drivetrain: r.drivetrain,
                      seats: r.seats,
                      image: r.primaryImage ? mediaUrl(r.primaryImage) : null,
                      pending: r.status === "pending",
                      justIn: isJustIn(r.publishedAt, now),
                      sale: { priceMinor: r.priceMinor },
                      rent: null,
                    },
                    market,
                    "sale",
                  )}
                />
              ))}
            </ul>
            <p className="cd-compare">
              <span className="cd-compare-label">Compare side by side:</span>
              {similar.map((r) => (
                <Link key={r.id} href={compareHref(code, v.slug, r.slug)}>
                  <i className="fas fa-code-compare" aria-hidden="true" />
                  <span className="cd-sr">This car and the </span>
                  {r.year} {splitName(r).name}
                </Link>
              ))}
            </p>
          </section>
        )}

        {/* 10. From this browser's own list; nothing on a first visit */}
        <RecentlyViewed market={code} slug={v.slug} kind="sale" />
      </div>
      <GuideLinks market={code} slugs={["used-car-checklist-free-vin-check"]} compare />
    </div>
  );
}
