import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { siteUrl } from "@/lib/siteUrl";
import { BUSINESS } from "@/content/guides/format";
import { loadGuideData } from "@/components/guides/loadGuideData";
import { GuideCards, guideCards } from "@/components/guides/GuideCards";
import "@/styles/guides.css";

/** Cached and revalidated, like the guides themselves: the cards carry live figures. */
export const revalidate = 300;

const TITLE = "Car Guides for Greensboro, NC: Rent, Buy, Check a Car";
const DESCRIPTION =
  "Car guides from Adedayo Aremu Autos in Greensboro, NC. Each one is a tool with today's prices: weekly rentals, rent vs buy, cars by budget, a checklist.";

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
 * The guides: each a real tool wrapped in a short article, as a large photo
 * card with its one-line promise and a live figure. Newest first.
 *
 * US only. The Nigerian articles are the founder's own and stay on /ng/blog,
 * so /ng/guides is a 404.
 */
export default async function GuidesPage({ params }: { params: Promise<{ market: string }> }) {
  const { market } = await params;
  if (market !== "us") notFound();

  const cards = guideCards(await loadGuideData());
  const base = siteUrl();

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
            Car guides with <span>today&rsquo;s numbers</span>
          </h1>
          <p className="gd-lead">Each one is a tool. Tap, see the answer, send it to a friend.</p>
        </header>

        <GuideCards cards={cards} level={2} />
      </div>
    </div>
  );
}
