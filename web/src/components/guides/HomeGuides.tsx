import Link from "next/link";
import { GUIDES, HOME_GUIDE_SLUGS } from "@/content/guides";
import { loadGuideData } from "./loadGuideData";
import { GuideCards, guideCards } from "./GuideCards";
// Here, not in the home page: the section brings its own sheet, so the page
// that shows it needs one import and one line.
import "@/styles/guides.css";
// The cards' small previews.
import "@/styles/guides-motion.css";

/**
 * The home page's "Guides" section (US only): three guides as cards, and a
 * link to the rest. Each card's figure is live, from the same load the
 * guides use.
 *
 * The head uses the home page's own classes (home-eyebrow, home-title,
 * home-row-head), so it reads as one of that page's sections; the cards are
 * the guides' own.
 */
export async function HomeGuides() {
  const cards = guideCards(await loadGuideData());
  const shown = HOME_GUIDE_SLUGS.flatMap((slug) => cards.filter((c) => c.slug === slug));
  if (shown.length === 0) return null;

  return (
    <section className="home-wrap home-block" aria-labelledby="home-guides-h">
      <div className="home-row-head">
        <h2 className="home-title" id="home-guides-h">
          Guides
        </h2>
        <Link href="/us/guides" className="home-row-all">
          See all {GUIDES.length}
          <i className="fas fa-arrow-right" aria-hidden="true" />
        </Link>
      </div>
      <GuideCards cards={shown} level={3} compact />
    </section>
  );
}
