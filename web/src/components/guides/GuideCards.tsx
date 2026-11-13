import Image from "next/image";
import Link from "next/link";
import { canResize } from "@/lib/photo";
import { GUIDES, guideHref } from "@/content/guides";
import type { GuideData, GuideGroup, ToolKey } from "@/content/guides/types";
import { cardBars, sceneFor } from "./motion/sceneData";
import { CardPreview } from "./motion/CardPreview";
import { guidePhotos, readMinutes } from "./guideMath";

export interface GuideCard {
  slug: string;
  tool: ToolKey;
  group: GuideGroup;
  href: string;
  icon: string;
  label: string;
  title: string;
  /** The one-line promise. */
  line: string;
  /** A live figure: "From $350 a week". */
  stat: string;
  /** A real car from stock, or null with none photographed. */
  photo: string | null;
  minutes: number;
  /** For the rent-buy-own card's preview: its three bars at today's proportions. */
  bars: number[] | null;
}

/**
 * Every guide as a card, newest first, each with a live line and a photo of
 * a real car in stock. Photos are dealt across all the guides at once, so a
 * guide has the same photo on the index, on the home page and when shared.
 */
export function guideCards(data: GuideData): GuideCard[] {
  const built = GUIDES.map((g) => ({ g, w: g.words(data) }));
  const photos = guidePhotos(
    built.map(({ g, w }) => ({ slug: g.meta.slug, photoSlug: w.photoSlug })),
    data,
  );
  return built.map(({ g, w }) => ({
    slug: g.meta.slug,
    tool: g.meta.tool,
    group: g.meta.group,
    href: guideHref(g.meta.slug),
    icon: g.meta.card.icon,
    label: g.meta.card.label,
    title: g.meta.title,
    line: g.meta.card.line,
    stat: w.stat,
    photo: photos[g.meta.slug],
    minutes: readMinutes(w),
    bars: g.meta.tool === "three-way" ? cardBars(sceneFor(g.meta.tool, data, null)) : null,
  }));
}

/**
 * Guides as large photo cards: the photo, a label, the title, the one-line
 * promise and a live figure. The whole card is the link.
 *
 * @param level the heading level of each title, to fit the page around it
 */
export function GuideCards({
  cards,
  level,
  compact = false,
  eager = false,
}: {
  cards: GuideCard[];
  level: 2 | 3;
  compact?: boolean;
  /** Load the first photo at once: the page's largest image. */
  eager?: boolean;
}) {
  const Title = level === 2 ? "h2" : "h3";
  return (
    <ul className={`gd-cards${compact ? " gd-cards--compact" : ""}`}>
      {cards.map((c, i) => (
        <li key={c.slug}>
          <Link href={c.href} className="gd-card">
            <span className="gd-card-photo">
              {c.photo && (
                <Image
                  src={c.photo}
                  alt=""
                  fill
                  sizes={compact ? "(min-width: 900px) 380px, 100vw" : "(min-width: 900px) 580px, 100vw"}
                  unoptimized={!canResize(c.photo)}
                  // The first card's photo is the index page's largest image.
                  loading={eager && i === 0 ? "eager" : "lazy"}
                />
              )}
              <span className="gd-card-label">
                <i className={`fas ${c.icon}`} aria-hidden="true" />
                {c.label}
              </span>
              <CardPreview tool={c.tool} bars={c.bars} />
            </span>
            <span className="gd-card-body">
              <Title className="gd-card-title">{c.title}</Title>
              <span className="gd-card-line">{c.line}</span>
              <span className="gd-card-foot">
                <span className="gd-card-stat">{c.stat}</span>
                <span className="gd-card-go">
                  Open
                  <i className="fas fa-arrow-right" aria-hidden="true" />
                </span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
