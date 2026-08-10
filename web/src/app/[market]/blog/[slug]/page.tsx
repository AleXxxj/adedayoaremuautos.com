import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode } from "@/lib/market";
import { ARTICLES, articleBySlug, articlesFor, type Block } from "@/content/articles";
import { approvedComments } from "@/lib/actions/blog";
import { socialLinks } from "@/lib/contact";
import { LegacyCommentForm, LegacyShare } from "@/components/LegacyBlog";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ market: a.market, slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string; slug: string }>;
}): Promise<Metadata> {
  const { market, slug } = await params;
  if (!isMarketCode(market)) return {};
  const a = articleBySlug(market, slug);
  if (!a) return {};
  return {
    title: `${a.title} — Adedayo Aremu Autos`,
    description: a.excerpt,
    alternates: { canonical: `/${market}/blog/${slug}` },
    openGraph: {
      title: a.title,
      description: a.excerpt,
      type: "article",
      images: a.image ? [a.image] : [],
    },
  };
}

const CATEGORY_EMOJI: Record<string, string> = {
  "Buying Guide": "🚗",
  Financing: "💰",
  "Used Cars": "🚘",
  Maintenance: "🔧",
  "Luxury Cars": "🏎️",
  "Rental Tips": "🔑",
  Inspection: "🔍",
};

/**
 * Renders the article body.
 *
 * Consecutive `li` blocks are gathered into one `<ul>`. The source stores them
 * flat, and emitting a separate single-item list per bullet would be both
 * wrong markup and read as a series of disconnected lists to a screen reader.
 */
function renderBlocks(blocks: Block[]) {
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flush = (key: string) => {
    if (bullets.length === 0) return;
    out.push(
      <ul key={key}>
        {bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  blocks.forEach((b, i) => {
    if (b.tag === "li") {
      bullets.push(b.text);
      return;
    }
    flush(`ul-${i}`);
    if (b.tag === "h2") out.push(<h2 key={i}>{b.text}</h2>);
    else if (b.tag === "h3") out.push(<h3 key={i}>{b.text}</h3>);
    else out.push(<p key={i}>{b.text}</p>);
  });

  flush("ul-end");
  return out;
}

/** Hashtags from the title and category, as the original hand-wrote per page. */
function tagsFor(title: string, category: string): string[] {
  const fromCategory = category.replace(/[^A-Za-z]/g, "");
  const fromTitle = title
    .split(/\s+/)
    .filter((w) => /^[A-Z][A-Za-z]{3,}$/.test(w))
    .slice(0, 3)
    .map((w) => w.replace(/[^A-Za-z]/g, ""));
  return [...new Set([fromCategory, ...fromTitle])].filter(Boolean).slice(0, 4);
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ market: string; slug: string }>;
}) {
  const { market: code, slug } = await params;
  if (!isMarketCode(code)) notFound();

  const article = articleBySlug(code, slug);
  if (!article) notFound();

  const market = MARKETS[code];
  const related = articlesFor(code).filter((a) => a.slug !== slug).slice(0, 3);
  const comments = await approvedComments(slug);
  const authorSocials = socialLinks(code);

  const published = article.publishedOn
    ? new Intl.DateTimeFormat(market.locale, { dateStyle: "long", timeZone: "UTC" }).format(
        new Date(article.publishedOn),
      )
    : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.excerpt,
    articleSection: article.category,
    inLanguage: market.locale,
    ...(article.image ? { image: article.image } : {}),
    ...(article.publishedOn ? { datePublished: article.publishedOn } : {}),
    author: { "@type": "Person", name: "Adedayo Aremu" },
    publisher: { "@type": "Organization", name: "Adedayo Aremu Autos" },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* The photograph comes from the article record rather than a per-page
          CSS rule, so each article keeps its own. */}
      <div
        className="post-header"
        style={
          article.image
            ? {
                backgroundImage: `linear-gradient(135deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.55) 100%), url('${article.image}')`,
              }
            : undefined
        }
      >
        <div className="post-header-content">
          <span className="post-category">
            {CATEGORY_EMOJI[article.category] ?? "📰"} {article.category}
          </span>
          <h1>{article.title}</h1>
          <div className="post-meta">
            {published && (
              <span>
                <i className="fas fa-calendar" /> {published}
              </span>
            )}
            <span>
              <i className="fas fa-clock" /> {article.readMinutes} min read
            </span>
            <span>
              <i className="fas fa-user" /> By Adedayo Aremu
            </span>
          </div>
        </div>
      </div>

      <div className="blog-container">
        <div className="breadcrumb">
          <Link href={`/${code}`}>Home</Link> &gt;{" "}
          <Link href={`/${code}/blog`}>Blog</Link> &gt; <span>{article.title}</span>
        </div>

        <div className="blog-content">
          {article.image && (
            <div className="blog-image">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={article.image} alt="" />
            </div>
          )}

          {renderBlocks(article.blocks)}
        </div>

        <LegacyShare title={article.title} tags={tagsFor(article.title, article.category)} />

        <div className="author-box">
          <div className="author-image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/ceo.png" alt="Adedayo Aremu" />
          </div>
          <div className="author-info">
            <h3>
              <span>Adedayo Aremu</span>
            </h3>
            {/* The original said "over 5 years of experience". That figure is
                not one we can stand behind, so the claim is left out. */}
            <p>
              Founder &amp; CEO of Adedayo Aremu Autos. Adedayo is passionate
              about helping customers find the right vehicle for their needs
              through transparent, customer-centred service.
            </p>
            {authorSocials.length > 0 && (
              <div className="author-social">
                {authorSocials.map((s) => (
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
        </div>

        {related.length > 0 && (
          <div className="related-posts">
            <h2>
              Related <span>Articles</span>
            </h2>
            <div className="related-grid">
              {related.map((r) => (
                <div className="related-card" key={r.slug}>
                  <div className="related-image">
                    {r.image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={r.image} alt="" loading="lazy" />
                    ) : (
                      <div className="car-image-placeholder">
                        Adedayo Aremu Autos
                      </div>
                    )}
                  </div>
                  <div className="related-content">
                    <h4>
                      <Link href={`/${code}/blog/${r.slug}`}>{r.title}</Link>
                    </h4>
                    <div className="related-meta">{r.readMinutes} min read</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="comments-section">
          <h2>
            {comments.length > 0 ? (
              <>
                {comments.length} <span>Comment{comments.length === 1 ? "" : "s"}</span>
              </>
            ) : (
              <>
                Leave a <span>Comment</span>
              </>
            )}
          </h2>

          {/* The original shipped three invented commenters. Real ones only,
              and only after a member of staff has approved them. */}
          {comments.map((c) => (
            <div className="comment" key={c.id}>
              <div className="comment-avatar">
                {c.authorName.trim().charAt(0).toUpperCase()}
              </div>
              <div className="comment-content">
                <div className="comment-header">
                  <strong>{c.authorName}</strong>
                  <span className="comment-date">
                    {new Intl.DateTimeFormat(market.locale, {
                      dateStyle: "medium",
                      timeZone: market.timezone,
                    }).format(c.createdAt)}
                  </span>
                </div>
                <p>{c.body}</p>
              </div>
            </div>
          ))}

          <LegacyCommentForm market={code} articleSlug={slug} />
        </div>
      </div>
    </>
  );
}
