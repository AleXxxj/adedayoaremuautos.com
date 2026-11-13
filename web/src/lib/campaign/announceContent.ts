/**
 * What there is to announce, read from the site's own content.
 *
 * Read only. US guides come from src/content/guides, articles from
 * src/content/articles.ts (today every article is Nigerian). Nothing here is
 * typed by hand: the title, the promise and the address are the page's own.
 */
import { GUIDES, guideHref } from "@/content/guides";
import { articlesFor } from "@/content/articles";
import { ARTICLE_HEADS } from "@/content/articleHeads";
import type { MarketCode } from "@/lib/market";
import type { Announceable, AnnounceKind } from "./announceDraft";

/**
 * An article's one line: the first sentence of its own excerpt.
 *
 * The stored excerpts are cut at a fixed length and stop mid-sentence, so the
 * whole excerpt cannot go in an email. The first sentence is still the
 * author's words, and it ends where the author ended it.
 */
export function firstSentence(excerpt: string): string {
  const text = excerpt.replace(/\s+/g, " ").trim();
  const end = text.search(/[.?!](\s|$)/);
  if (end >= 0) return text.slice(0, end + 1);
  // No sentence end at all: stop at the last whole word.
  const cut = text.lastIndexOf(" ");
  return `${cut > 0 ? text.slice(0, cut) : text}...`;
}

/** Everything announceable in a market, newest first. */
export function announceables(market: MarketCode): Announceable[] {
  const guides: Announceable[] =
    market === "us"
      ? GUIDES.map((g) => ({
          kind: "guide" as const,
          market,
          slug: g.meta.slug,
          title: g.meta.title,
          promise: g.meta.promise,
          path: guideHref(g.meta.slug),
          published: g.meta.published,
        }))
      : [];

  const articles: Announceable[] = articlesFor(market).map((a) => ({
    kind: "article" as const,
    market,
    slug: a.slug,
    title: a.title,
    promise: firstSentence(a.excerpt),
    path: `/${market}/blog/${a.slug}`,
    published: a.publishedOn ?? ARTICLE_HEADS[a.slug]?.publishedOn ?? null,
  }));

  // Stable sort: items of the same day keep the order they were written in.
  return [...guides, ...articles].sort((a, b) =>
    (b.published ?? "").localeCompare(a.published ?? ""),
  );
}

export function findAnnounceable(
  market: MarketCode,
  kind: AnnounceKind,
  slug: string,
): Announceable | null {
  return announceables(market).find((i) => i.kind === kind && i.slug === slug) ?? null;
}
