import Image from "next/image";
import Link from "next/link";
import { canResize } from "@/lib/photo";
import type { CardView } from "./carData";
import { SaveButton } from "./SaveButton";

/**
 * One car as a card: the photo first, edge to edge, then a small "2017 ·
 * Hyundai", the model big, one line of facts and the price. The whole card is
 * one link; the heart over the photo is its own button, beside the link
 * rather than inside it (styles/cars.css).
 *
 * Used by both lists, by a car page's "Similar cars" and "Recently viewed",
 * and by the saved list, which is why it takes a finished CardView
 * (carData.ts) rather than a database row: the server pages and the browser
 * build the same card from the same function.
 */
export function CarCard({
  card,
  market,
  heading = "h3",
  eager = false,
  sizes = "(min-width: 1100px) 380px, (min-width: 700px) 50vw, 100vw",
}: {
  card: CardView;
  market: string;
  /** "h2" in a list under the page's title, "h3" under a section's. */
  heading?: "h2" | "h3";
  /** The first card of a list: usually the largest thing on the first screen. */
  eager?: boolean;
  sizes?: string;
}) {
  const Heading = heading;
  return (
    <li className="cc">
      <Link href={card.href} className="cc-link">
        <span className="cc-photo">
          {card.image ? (
            <Image
              src={card.image}
              alt=""
              fill
              sizes={sizes}
              loading={eager ? "eager" : undefined}
              fetchPriority={eager ? "high" : undefined}
              unoptimized={!canResize(card.image)}
            />
          ) : (
            <span className="cc-nophoto">
              <i className="fas fa-camera" aria-hidden="true" />
              Photo coming soon
            </span>
          )}
          {card.badge && <span className="cc-badge">{card.badge}</span>}
        </span>
        <span className="cc-body">
          <span className="cc-kicker">{card.kicker}</span>
          <Heading className="cc-name">
            {card.name}
            {card.detail && <span className="cc-detail"> {card.detail}</span>}
          </Heading>
          {card.facts && (
            <span className="cc-facts">
              <i className="fas fa-gauge-high" aria-hidden="true" />
              {card.facts}
            </span>
          )}
          <span className="cc-price">
            <strong>{card.price}</strong>
            {card.unit && <span className="cc-unit"> {card.unit}</span>}
            {card.sub && <span className="cc-sub">{card.sub}</span>}
          </span>
        </span>
      </Link>
      <SaveButton market={market} slug={card.slug} name={card.full} />
    </li>
  );
}
