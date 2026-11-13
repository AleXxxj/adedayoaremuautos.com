import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMoney, money } from "@/lib/money";
import { siteUrl } from "@/lib/siteUrl";
import { GUIDES, getGuide, guideHref } from "@/content/guides";
import { BUSINESS, count } from "@/content/guides/format";
import type { GuideCars, GuideData } from "@/content/guides/types";
import { loadGuideData } from "@/components/guides/loadGuideData";
import { guideUpdated, readMinutes } from "@/components/guides/guideMath";
import { GuideCards, guideCards } from "@/components/guides/GuideCards";
import { GuideCarCard } from "@/components/guides/GuideCarCard";
import { GuideTool } from "@/components/guides/GuideTool";
import { Rich } from "@/components/guides/Rich";
import { ShareButton } from "@/components/guides/ShareButton";
import "@/styles/guides.css";

/**
 * Cached and revalidated, like the other public pages: a guide's numbers are
 * today's stock, and five minutes is as stale as they get. The admin's
 * revalidation of the car lists doesn't reach here, so the window does the
 * work.
 */
export const revalidate = 300;

/**
 * The guides exist on the US site only, so they are built for /us and
 * nothing is built for /ng (where the page is a 404). Building them here
 * also means a guide that can't be drawn fails the build, not a visitor.
 */
export function generateStaticParams({ params }: { params: { market: string } }) {
  return params.market === "us" ? GUIDES.map((g) => ({ slug: g.meta.slug })) : [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string; slug: string }>;
}): Promise<Metadata> {
  const { market, slug } = await params;
  const guide = market === "us" ? getGuide(slug) : null;
  if (!guide) return {};
  const data = await loadGuideData();
  const words = guide.words(data);
  const photo = guideCards(data).find((c) => c.slug === slug)?.photo ?? null;
  const url = guideHref(slug);
  return {
    // Written out in full: with the site-wide "| Adedayo Aremu Autos" added,
    // every guide's title would run past what a search result shows.
    title: { absolute: guide.meta.metaTitle },
    description: words.description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: guide.meta.title,
      description: words.description,
      url,
      siteName: BUSINESS,
      publishedTime: guide.meta.published,
      modifiedTime: guideUpdated(guide.meta, data),
      ...(photo ? { images: [{ url: photo, alt: guide.meta.title }] } : {}),
    },
    twitter: {
      card: photo ? "summary_large_image" : "summary",
      title: guide.meta.title,
      description: words.description,
      ...(photo ? { images: [photo] } : {}),
    },
  };
}

/** Cards under "More guides". The index has them all. */
const MORE_GUIDES = 3;

/** "November 12, 2026", read as a calendar date, not shifted by a time zone. */
const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/** The live cars a section shows, in the order the guide chose. */
function CarsRow({ cars, data }: { cars: GuideCars; data: GuideData }) {
  const fmt = (minor: number) => formatMoney(money(minor, data.currency), data.locale);
  return (
    <div className="gd-carsbox">
      <p className="gd-carsbox-title">{cars.title}</p>
      <ul className="gd-cars">
        {cars.slugs.map((slug) => {
          if (cars.kind === "rent") {
            const c = data.rent.find((x) => x.slug === slug);
            if (!c) return null;
            const weekly = c.tariff.weeklyMinor;
            return (
              <GuideCarCard
                key={slug}
                href={`/us/rentals/${slug}`}
                image={c.image}
                name={c.name}
                price={fmt(weekly ?? c.tariff.dailyMinor)}
                unit={weekly != null ? "a week" : "a day"}
                meta={weekly != null ? `or ${fmt(c.tariff.dailyMinor)} a day` : null}
              />
            );
          }
          const c = data.sale.find((x) => x.slug === slug);
          if (!c) return null;
          return (
            <GuideCarCard
              key={slug}
              href={`/us/inventory/${slug}`}
              image={c.image}
              name={c.name}
              price={fmt(c.priceMinor)}
              meta={
                [c.mileage != null && `${count(data, c.mileage)} ${data.distanceUnit}`, c.transmission]
                  .filter(Boolean)
                  .join(" · ") || null
              }
              badge={c.pending ? "Sale pending" : null}
            />
          );
        })}
      </ul>
      <Link href={cars.all.href} className="gt-all">
        {cars.all.label}
        <i className="fas fa-arrow-right" aria-hidden="true" />
      </Link>
    </div>
  );
}

/**
 * One guide: a real tool wrapped in a short article.
 *
 * Top to bottom on a phone: where you are, the title and its one-line
 * promise, "The short version" with live numbers, the tool (a game comes
 * before the short version, so it is on the first screen), a share button,
 * short sections under the questions people search, live cars from stock,
 * the questions people ask, a share button again, the other guides and the
 * matching pages, and one call to action.
 *
 * The words come from the guide's module as a function of today's stock
 * (src/content/guides), so no number on the page is typed by hand, and the
 * same strings fill the structured data, so the two can't disagree.
 */
export default async function GuidePage({
  params,
}: {
  params: Promise<{ market: string; slug: string }>;
}) {
  const { market, slug } = await params;
  // US only: /ng/guides/... is a 404.
  if (market !== "us") notFound();
  const guide = getGuide(slug);
  if (!guide) notFound();

  const data = await loadGuideData();
  const { meta } = guide;
  const words = guide.words(data);
  const cards = guideCards(data);
  const photo = cards.find((c) => c.slug === slug)?.photo ?? null;
  const updated = guideUpdated(meta, data);
  const minutes = readMinutes(words);
  const base = siteUrl();
  const url = `${base}${guideHref(slug)}`;
  const absolute = (u: string) => (/^https?:\/\//.test(u) ? u : `${base}${u}`);

  // Three linked nodes: the article, its questions, and where it sits.
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "@id": `${url}#article`,
      headline: meta.title,
      description: words.description,
      datePublished: meta.published,
      dateModified: updated,
      // The business wrote it: no person's name is put to it.
      author: { "@type": "Organization", "@id": `${base}/us#dealer`, name: BUSINESS, url: `${base}/us` },
      publisher: { "@id": `${base}/us#dealer` },
      mainEntityOfPage: url,
      inLanguage: "en-US",
      ...(photo ? { image: [absolute(photo)] } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: words.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${base}/us` },
        { "@type": "ListItem", position: 2, name: "Guides", item: `${base}/us/guides` },
        { "@type": "ListItem", position: 3, name: meta.title, item: url },
      ],
    },
  ];

  // "More guides": three, the ones of this guide's kind first.
  const rest = cards.filter((c) => c.slug !== slug);
  const others = [...rest.filter((c) => c.group === meta.group), ...rest.filter((c) => c.group !== meta.group)].slice(0, MORE_GUIDES);
  const share = { title: meta.title, text: meta.card.line, path: guideHref(slug) };

  const shortBox = (
        <section className="gd-short" aria-labelledby="gd-short-h">
          <h2 className="gd-short-h" id="gd-short-h">
            The short version
          </h2>
          <ul>
            {words.short.map((line) => (
              <li key={line}>
                <i className="fas fa-check" aria-hidden="true" />
                <span>
                  <Rich text={line} />
                </span>
              </li>
            ))}
          </ul>
          {meta.live && <p className="gd-short-note">Live numbers from our stock today.</p>}
        </section>
  );

  const toolBox = (
        <section className="gd-toolbox" id="tool" aria-labelledby="gd-tool-h">
          <h2 className="gd-h" id="gd-tool-h">
            {words.toolHeading}
          </h2>
          <GuideTool meta={meta} data={data} />
          <p className="gd-toolnote">{words.toolNote}</p>
        </section>
  );

  return (
    <article className="gd-page">
      {jsonLd.map((node) => (
        <script
          key={node["@type"]}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
        />
      ))}

      <div className="gd-wrap">
        <nav className="gd-crumbs" aria-label="Breadcrumb">
          <Link href="/us">Home</Link>
          <i className="fas fa-chevron-right" aria-hidden="true" />
          <Link href="/us/guides">Guides</Link>
        </nav>

        <header className="gd-head">
          <p className="gd-eyebrow">{meta.eyebrow}</p>
          <h1 className="gd-title">{meta.title}</h1>
          <p className="gd-lead">{meta.promise}</p>
          <p className="gd-meta">
            <span>
              Updated <time dateTime={updated}>{longDate(updated)}</time>
            </span>
            <span aria-hidden="true">·</span>
            <span>{minutes} min read</span>
          </p>
        </header>

        {/* A game is played before it is read about: it comes first. */}
        {meta.game ? (
          <>
            {toolBox}
            {shortBox}
          </>
        ) : (
          <>
            {shortBox}
            {toolBox}
          </>
        )}

        <ShareButton {...share} />

        <details className="gd-toc">
          <summary>
            <span>On this page</span>
            <span className="gd-toc-count">{words.sections.length + 1} sections</span>
          </summary>
          <ol>
            {words.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.heading}</a>
              </li>
            ))}
            <li>
              <a href="#questions">Questions people ask</a>
            </li>
          </ol>
        </details>

        {words.sections.map((s) => (
          <section className="gd-section" id={s.id} key={s.id} aria-labelledby={`${s.id}-h`}>
            <h2 className="gd-h" id={`${s.id}-h`}>
              {s.heading}
            </h2>
            {!s.list &&
              !s.steps &&
              s.body.map((p) => (
                <p key={p}>
                  <Rich text={p} />
                </p>
              ))}
            {s.list && (
              <ul className="gd-list">
                {s.list.map((item) => (
                  <li key={item.text}>
                    <span className="gd-list-icon">
                      <i className={`fas ${item.icon}`} aria-hidden="true" />
                    </span>
                    <span>
                      <Rich text={item.text} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {s.steps && (
              <ol className="gd-steps">
                {s.steps.map((step, i) => (
                  <li key={step}>
                    <span className="gd-steps-n" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span>
                      <Rich text={step} />
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {/* With a list or steps, the paragraphs are the small print under it. */}
            {(s.list || s.steps) &&
              s.body.map((p) => (
                <p key={p} className="gd-after">
                  <Rich text={p} />
                </p>
              ))}
            {s.cars && <CarsRow cars={s.cars} data={data} />}
            {s.link && (
              <Link href={s.link.href} className="gd-more">
                {s.link.label}
                <i className="fas fa-arrow-right" aria-hidden="true" />
              </Link>
            )}
          </section>
        ))}

        <section className="gd-section" id="questions" aria-labelledby="questions-h">
          <h2 className="gd-h" id="questions-h">
            Questions people ask
          </h2>
          <div className="gd-faq">
            {words.faqs.map((f) => (
              <details key={f.q}>
                <summary>
                  <span>{f.q}</span>
                  <i className="fas fa-plus" aria-hidden="true" />
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="gd-send" aria-labelledby="gd-send-h">
          <h2 className="gd-send-h" id="gd-send-h">
            Know someone who needs this?
          </h2>
          <ShareButton {...share} />
        </section>

        <section className="gd-section" aria-labelledby="gd-next-h">
          <h2 className="gd-h" id="gd-next-h">
            Where to next
          </h2>
          <ul className="gd-links">
            {words.links.map((l) => (
              <li key={l.href}>
                <Link href={l.href}>
                  <i className={`fas ${l.icon}`} aria-hidden="true" />
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="gd-cta" aria-labelledby="gd-cta-h">
          <h2 className="gd-cta-h" id="gd-cta-h">
            {words.cta.title}
          </h2>
          <p>{words.cta.text}</p>
          <div className="gd-cta-actions">
            <Link href={words.cta.primary.href} className="gd-btn gd-btn--primary">
              <i className={`fas ${words.cta.primary.icon}`} aria-hidden="true" />
              {words.cta.primary.label}
            </Link>
            {words.cta.secondary &&
              (words.cta.secondary.href.startsWith("tel:") ? (
                <a href={words.cta.secondary.href} className="gd-btn">
                  <i className={`fas ${words.cta.secondary.icon}`} aria-hidden="true" />
                  {words.cta.secondary.label}
                </a>
              ) : (
                <Link href={words.cta.secondary.href} className="gd-btn">
                  <i className={`fas ${words.cta.secondary.icon}`} aria-hidden="true" />
                  {words.cta.secondary.label}
                </Link>
              ))}
          </div>
        </section>

        {others.length > 0 && (
          <section className="gd-section gd-others" aria-labelledby="gd-others-h">
            <h2 className="gd-h" id="gd-others-h">
              More guides
            </h2>
            <GuideCards cards={others} level={3} compact />
            <Link href="/us/guides" className="gd-more">
              See all {cards.length} guides
              <i className="fas fa-arrow-right" aria-hidden="true" />
            </Link>
          </section>
        )}
      </div>
    </article>
  );
}
