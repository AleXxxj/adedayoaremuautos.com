import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode } from "@/lib/market";
import { articlesFor, categoriesFor } from "@/content/articles";

export const dynamic = "force-static";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  return {
    title: "Automotive insights — Adedayo Aremu Autos",
    description: "Guides on buying, financing, hiring and looking after a vehicle.",
    alternates: { canonical: `/${market}/blog` },
  };
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
  const { category } = await searchParams;

  const all = articlesFor(code);
  const categories = categoriesFor(code);
  const articles = category ? all.filter((a) => a.category === category) : all;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-10 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight">Automotive insights</h1>
        <p className="mt-3 text-[var(--text-secondary)]">
          Guides on buying, financing, hiring and looking after a vehicle.
        </p>
      </header>

      {all.length === 0 ? (
        /* Honest empty state. The existing articles are written for Nigeria and
           would mislead a US reader, so they are not shown here. */
        <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] px-6 py-16 text-center">
          <h2 className="text-lg font-semibold">No articles for this region yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">
            Our existing guides were written for the Nigerian market and cover
            things like customs clearance and Tokunbo imports — not much use if
            you are buying in North Carolina. Guides for this market are on the
            way.
          </p>
          <Link
            href="/ng/blog"
            className="mt-6 inline-block text-sm text-[var(--link)] hover:underline"
          >
            Read the Nigeria guides anyway →
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-8 flex flex-wrap gap-2 border-b border-[var(--border-subtle)] pb-6">
            <Chip href={`/${code}/blog`} active={!category}>All</Chip>
            {categories.map((c) => (
              <Chip
                key={c}
                href={`/${code}/blog?category=${encodeURIComponent(c)}`}
                active={category === c}
              >
                {c}
              </Chip>
            ))}
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((a) => (
              <article
                key={a.slug}
                className="flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6 transition-colors hover:bg-[var(--surface-2)]"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-400)]">
                  {a.category}
                </span>
                <h2 className="mt-2 text-lg font-semibold leading-snug">
                  <Link href={`/${code}/blog/${a.slug}`} className="hover:text-[var(--link)]">
                    {a.title}
                  </Link>
                </h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {a.excerpt}…
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 text-xs text-[var(--text-muted)]">
                  <span>{a.readMinutes} min read</span>
                  <Link href={`/${code}/blog/${a.slug}`} className="font-medium text-[var(--link)] hover:underline">
                    Read →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-transparent bg-[var(--cta-bg)] font-medium text-[var(--cta-fg)]"
          : "border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
      }`}
    >
      {children}
    </Link>
  );
}
