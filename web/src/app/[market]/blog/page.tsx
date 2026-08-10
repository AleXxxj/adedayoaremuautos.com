import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode } from "@/lib/market";
import { articlesFor, categoriesFor, type Article } from "@/content/articles";
import { LegacyNewsletter } from "@/components/LegacyBlog";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  return {
    title: "Automotive Insights — Adedayo Aremu Autos",
    description:
      "Expert advice, tips, and guides for car enthusiasts and buyers — buying, financing, hiring and looking after a vehicle.",
    alternates: {
      canonical: `/${market}/blog`,
      languages: { "en-US": "/us/blog", "en-NG": "/ng/blog" },
    },
  };
}

/** The original's emoji-prefixed category chips, by category name. */
const CATEGORY_EMOJI: Record<string, string> = {
  "Buying Guide": "🚗",
  Financing: "💰",
  "Used Cars": "🚘",
  Maintenance: "🔧",
  "Luxury Cars": "🏎️",
  "Rental Tips": "🔑",
  Inspection: "🔍",
};

const label = (c: string) => `${CATEGORY_EMOJI[c] ?? "📰"} ${c}`;

function formatDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(d);
}

function CardMeta({ article, locale }: { article: Article; locale: string }) {
  const date = formatDate(article.publishedOn, locale);
  return (
    <div className="blog-card-meta">
      {/* The original printed a date on every card. These articles carry no
          publication date, and inventing one would misrepresent how current
          the advice is, so the field is simply absent. */}
      {date && (
        <span>
          <i className="fas fa-calendar" /> {date}
        </span>
      )}
      <span>
        <i className="fas fa-clock" /> {article.readMinutes} min read
      </span>
    </div>
  );
}

export default async function BlogIndex({
  params,
  searchParams,
}: {
  params: Promise<{ market: string }>;
  searchParams: Promise<{ category?: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();
  const market = MARKETS[code];
  const { category } = await searchParams;

  const all = articlesFor(code);
  const categories = categoriesFor(code);
  const articles = category ? all.filter((a) => a.category === category) : all;

  const [featured, ...rest] = articles;

  return (
    <>
      <div className="page-header page-header--blog">
        <div className="page-header-content">
          <h1>
            Automotive <span>Insights</span>
          </h1>
          <p>Expert advice, tips, and guides for car enthusiasts and buyers</p>
        </div>
      </div>

      {all.length === 0 ? (
        /* The seven articles are written for Nigeria — Tokunbo imports, customs
           clearance, naira pricing. Serving them to a Greensboro reader would
           be worse than showing nothing, so the US market waits for its own. */
        <div className="blog-grid-section">
          <div className="no-results">
            <i className="fas fa-newspaper" />
            <h3>No articles for this region yet</h3>
            <p>
              Our guides are written for the Nigerian market. Articles for
              {" "}
              {market.name} are on the way.
            </p>
            <Link
              href="/ng/blog"
              className="btn btn-primary"
              style={{ marginTop: 20, display: "inline-flex", width: "auto" }}
            >
              Read the Nigeria guides
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Category filter. The original's buttons were `href="#"` driven by
              client-side JS, so a filtered view could not be linked or
              indexed. These are real URLs. */}
          <div className="blog-categories">
            <Link
              href={`/${code}/blog`}
              className={`category-btn${!category ? " active" : ""}`}
            >
              All Posts
            </Link>
            {categories.map((c) => (
              <Link
                key={c}
                href={`/${code}/blog?category=${encodeURIComponent(c)}`}
                className={`category-btn${category === c ? " active" : ""}`}
              >
                {c}
              </Link>
            ))}
          </div>

          {featured && (
            <div className="featured-post">
              <div className="featured-card">
                <div className="featured-image">
                  {featured.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={featured.image} alt="" />
                  ) : (
                    <div className="car-image-placeholder">Adedayo Aremu Autos</div>
                  )}
                </div>
                <div className="featured-content">
                  <span className="featured-category">{label(featured.category)}</span>
                  <h2>
                    <Link
                      href={`/${code}/blog/${featured.slug}`}
                      className="title-link"
                    >
                      {featured.title}
                    </Link>
                  </h2>
                  <div className="featured-meta">
                    {formatDate(featured.publishedOn, market.locale) && (
                      <span>
                        <i className="fas fa-calendar" />{" "}
                        {formatDate(featured.publishedOn, market.locale)}
                      </span>
                    )}
                    <span>
                      <i className="fas fa-clock" /> {featured.readMinutes} min read
                    </span>
                    <span>
                      <i className="fas fa-user" /> By Adedayo Aremu
                    </span>
                  </div>
                  <p className="featured-excerpt">{featured.excerpt}</p>
                  <Link href={`/${code}/blog/${featured.slug}`} className="read-more">
                    Read Full Article <i className="fas fa-arrow-right" />
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div className="blog-grid-section">
            <div className="section-title">
              <h2>
                Latest <span>Articles</span>
              </h2>
              <p>Stay updated with the latest automotive insights</p>
            </div>

            <div className="blog-grid" id="blogGrid">
              {rest.map((a) => (
                <div className="blog-card" key={a.slug}>
                  <div className="blog-card-image">
                    {a.image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={a.image} alt="" loading="lazy" />
                    ) : (
                      <div className="car-image-placeholder">
                        Adedayo Aremu Autos
                      </div>
                    )}
                    <span className="blog-card-category">{label(a.category)}</span>
                  </div>
                  <div className="blog-card-content">
                    <h3 className="blog-card-title">
                      <Link href={`/${code}/blog/${a.slug}`}>{a.title}</Link>
                    </h3>
                    <CardMeta article={a} locale={market.locale} />
                    <p className="blog-card-excerpt">{a.excerpt}</p>
                    <Link href={`/${code}/blog/${a.slug}`} className="read-more">
                      Read Article <i className="fas fa-arrow-right" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* The original's pagination was three `href="#"` links over seven
                hardcoded articles — two pages that did not exist. Omitted
                until there are enough articles to need it. */}
          </div>
        </>
      )}

      <LegacyNewsletter market={code} source={`/${code}/blog`} />
    </>
  );
}
