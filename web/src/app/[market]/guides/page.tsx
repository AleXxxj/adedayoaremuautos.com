import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { siteUrl } from "@/lib/siteUrl";
import { GUIDE_GROUPS } from "@/content/guides";
import { BUSINESS } from "@/content/guides/format";
import { loadGuideData } from "@/components/guides/loadGuideData";
import { GuideCards, guideCards } from "@/components/guides/GuideCards";
import { CardMotion } from "@/components/guides/motion/CardMotion";
import { ScrollLife } from "@/components/guides/motion/ScrollLife";
import "@/styles/guides.css";
import "@/styles/guides-motion.css";

/** Cached and revalidated, like the guides themselves: the cards carry live figures. */
export const revalidate = 300;

const TITLE = "Car Guides and Games for Greensboro, NC";
const DESCRIPTION =
  "Car guides and games from Adedayo Aremu Autos in Greensboro, NC: a car quiz, guess the price, road trips, rent vs buy, and a used car checklist.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  if (market !== "us") return {};
  const photo = guideCards(await loadGuideData()).find((c) => c.photo)?.photo ?? null;
  return {
    title: { absolute: TITLE },
    description: DESCRIPTION,
    alternates: { canonical: "/us/guides" },
    openGraph: {
      type: "website",
      title: TITLE,
      description: DESCRIPTION,
      url: "/us/guides",
      siteName: BUSINESS,
      ...(photo ? { images: [photo] } : {}),
    },
  };
}

/**
 * The guides: each a real tool or game wrapped in a short article, in three
 * groups (Play, Plan, Check) with the games first. The first group is large
 * photo cards; the others are compact rows, so nine guides stay scannable
 * on a phone.
 *
 * US only. The Nigerian articles are the founder's own and stay on /ng/blog,
 * so /ng/guides is a 404.
 */
export default async function GuidesPage({ params }: { params: Promise<{ market: string }> }) {
  const { market } = await params;
  if (market !== "us") notFound();

  const cards = guideCards(await loadGuideData());
  const base = siteUrl();
  const groups = GUIDE_GROUPS.map((g) => ({ ...g, cards: cards.filter((c) => c.group === g.id) })).filter(
    (g) => g.cards.length > 0,
  );

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${base}/us/guides#page`,
      url: `${base}/us/guides`,
      name: TITLE,
      description: DESCRIPTION,
      inLanguage: "en-US",
      publisher: { "@id": `${base}/us#dealer` },
      mainEntity: {
        "@type": "ItemList",
        itemListElement: cards.map((c, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: c.title,
          url: `${base}${c.href}`,
        })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${base}/us` },
        { "@type": "ListItem", position: 2, name: "Guides", item: `${base}/us/guides` },
      ],
    },
  ];

  return (
    <div className="gd-page">
      {/* Groups ease in as they are reached; cards lean to the pointer and play a small preview of their guide. */}
      <ScrollLife />
      <CardMotion />
      {jsonLd.map((node) => (
        <script
          key={node["@type"]}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
        />
      ))}

      <div className="gd-wrap gd-wrap--wide">
        <nav className="gd-crumbs" aria-label="Breadcrumb">
          <Link href="/us">Home</Link>
        </nav>

        <header className="gd-head">
          <p className="gd-eyebrow">Guides</p>
          <h1 className="gd-title">
            Car guides you can <span>play</span>
          </h1>
          <p className="gd-lead">Games, planners and checklists with today&rsquo;s numbers. Tap, then send it to a friend.</p>
        </header>

        <nav className="gd-jump" aria-label="Kinds of guide">
          {groups.map((g) => (
            <a key={g.id} href={`#${g.id}`} className="gt-chip">
              {g.title}
              <span className="gt-chip-count">{g.cards.length}</span>
            </a>
          ))}
        </nav>

        {groups.map((g, i) => (
          <section key={g.id} id={g.id} className={`gd-group${i === 0 ? " gd-group--lead" : ""}`} aria-labelledby={`${g.id}-h`}>
            <div className="gd-group-head">
              <h2 className="gd-group-h" id={`${g.id}-h`}>
                {g.title}
              </h2>
              <p>{g.line}</p>
            </div>
            <GuideCards cards={g.cards} level={3} compact={i > 0} eager={i === 0} />
          </section>
        ))}
      </div>
    </div>
  );
}
