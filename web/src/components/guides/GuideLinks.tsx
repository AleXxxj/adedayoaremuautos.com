import Link from "next/link";
import { getGuide, guideHref } from "@/content/guides";
import "@/styles/guide-links.css";

/**
 * "Guides for this page": one or two links from a page to the guides that go
 * with it (the rental list to the weekly rental guide, the car check to the
 * checklist). US only, where the guides exist. The words are each guide's own
 * title, so a link can never promise something the guide doesn't say.
 *
 * Links between a page and its guide are what tell a search engine the two
 * belong together, and they are how someone on the list finds the tool.
 */
export function GuideLinks({
  market,
  slugs,
  compare = false,
}: {
  market: string;
  slugs: string[];
  /** Also offer the side-by-side compare page (both markets have it). */
  compare?: boolean;
}) {
  const guides = market === "us" ? slugs.map(getGuide).filter((g) => g !== null) : [];
  if (guides.length === 0 && !compare) return null;
  return (
    <aside className="gl" aria-label="Helpful guides">
      <p className="gl-eyebrow">Helpful next</p>
      <ul className="gl-list">
        {guides.map((g) => (
          <li key={g.meta.slug}>
            <Link href={guideHref(g.meta.slug)} className="gl-link">
              <i className="fas fa-book-open" aria-hidden="true" />
              <span>{g.meta.title}</span>
              <i className="fas fa-arrow-right gl-go" aria-hidden="true" />
            </Link>
          </li>
        ))}
        {compare && (
          <li>
            <Link href={`/${market}/compare`} className="gl-link">
              <i className="fas fa-code-compare" aria-hidden="true" />
              <span>Compare two cars side by side</span>
              <i className="fas fa-arrow-right gl-go" aria-hidden="true" />
            </Link>
          </li>
        )}
      </ul>
    </aside>
  );
}
