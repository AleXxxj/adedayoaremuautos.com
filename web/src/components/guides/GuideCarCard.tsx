import Image from "next/image";
import Link from "next/link";
import { canResize } from "@/lib/photo";

/**
 * One car from stock inside a guide: the photo first, then the name, the
 * price and one short line. The whole card is the link.
 *
 * Its own small card, in the guides' sheet, so a guide's look doesn't depend
 * on the home page's or the car lists' styles. No server or client imports,
 * so both the article (server) and the tools (client) can draw it.
 */
export function GuideCarCard({
  href,
  image,
  name,
  price,
  unit,
  meta,
  badge,
}: {
  href: string;
  image: string | null;
  name: string;
  /** "$350", "$9,500" */
  price: string;
  /** "a week"; nothing for a sale price. */
  unit?: string | null;
  /** "157,500 mi · Automatic" */
  meta?: string | null;
  badge?: string | null;
}) {
  return (
    <li className="gd-car">
      <Link href={href} className="gd-car-link">
        <span className="gd-car-photo">
          {image ? (
            <Image
              src={image}
              alt=""
              fill
              sizes="(min-width: 900px) 220px, 46vw"
              unoptimized={!canResize(image)}
            />
          ) : (
            <span className="gd-car-nophoto">
              <i className="fas fa-camera" aria-hidden="true" />
            </span>
          )}
          {badge && <span className="gd-car-badge">{badge}</span>}
        </span>
        <span className="gd-car-body">
          <span className="gd-car-name">{name}</span>
          <span className="gd-car-price">
            <strong>{price}</strong>
            {unit ? ` ${unit}` : ""}
          </span>
          {meta && <span className="gd-car-meta">{meta}</span>}
        </span>
      </Link>
    </li>
  );
}
