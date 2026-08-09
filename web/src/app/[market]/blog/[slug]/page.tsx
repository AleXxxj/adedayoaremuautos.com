import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, MARKET_CODES, isMarketCode } from "@/lib/market";
import { ARTICLES, articleBySlug, articlesFor } from "@/content/articles";

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
    openGraph: { title: a.title, description: a.excerpt, type: "article" },
  };
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.excerpt,
    articleSection: article.category,
    inLanguage: market.locale,
    author: { "@type": "Organization", name: "Adedayo Aremu Autos" },
    publisher: { "@type": "Organization", name: "Adedayo Aremu Autos" },
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className="mb-6 text-sm text-[var(--text-muted)]">
        <Link href={`/${code}/blog`} className="hover:text-[var(--link)]">
          ← All articles
        </Link>
      </nav>

      <header className="mb-8">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-400)]">
          {article.category}
        </span>
        <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          {article.title}
        </h1>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          {article.readMinutes} min read
          {article.publishedOn && ` · ${article.publishedOn}`}
        </p>
      </header>

      <article className="space-y-4">
        {article.blocks.map((b, i) => {
          if (b.tag === "h2")
            return (
              <h2 key={i} className="mt-10 text-2xl font-bold tracking-tight">
                {b.text}
              </h2>
            );
          if (b.tag === "h3")
            return (
              <h3 key={i} className="mt-6 text-lg font-semibold">
                {b.text}
              </h3>
            );
          if (b.tag === "li")
            return (
              <p key={i} className="flex gap-3 leading-relaxed text-[var(--text-secondary)]">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--brand-400)]" />
                <span>{b.text}</span>
              </p>
            );
          return (
            <p key={i} className="leading-relaxed text-[var(--text-secondary)]">
              {b.text}
            </p>
          );
        })}
      </article>

      <aside className="mt-12 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6">
        <h2 className="text-lg font-semibold">Looking for a vehicle?</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Browse what we have available, or tell us what you are after and we
          will source it.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={`/${code}/inventory`}
            className="rounded-lg bg-[var(--cta-bg)] px-5 py-2.5 text-sm font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)]"
          >
            Browse inventory
          </Link>
          <Link
            href={`/${code}/contact`}
            className="rounded-lg border border-[var(--border-strong)] px-5 py-2.5 text-sm font-medium hover:bg-[var(--surface-2)]"
          >
            Talk to us
          </Link>
        </div>
      </aside>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-semibold">More guides</h2>
          <ul className="space-y-3">
            {related.map((a) => (
              <li key={a.slug} className="border-b border-[var(--border-subtle)] pb-3">
                <Link href={`/${code}/blog/${a.slug}`} className="font-medium hover:text-[var(--link)]">
                  {a.title}
                </Link>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                  {a.category} · {a.readMinutes} min
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
