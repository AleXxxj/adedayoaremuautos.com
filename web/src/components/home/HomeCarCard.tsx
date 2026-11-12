import Image from "next/image";
import Link from "next/link";
import { canResize } from "@/lib/photo";

/**
 * One car in the home page's swipe rows: the photo first, then the name, the
 * price and one line of details. The whole card is the link.
 */
export function HomeCarCard({
  href,
  image,
  name,
  price,
  unit,
  details,
  badge,
}: {
  href: string;
  image: string | null;
  name: string;
  /** "$350", "$9,500" */
  price: string;
  /** "a week"; nothing for a sale price. */
  unit?: string | null;
  /** "or $65 a day", "Automatic": joined with dots. */
  details: (string | null | undefined | false)[];
  badge?: string | null;
}) {
  const line = details.filter(Boolean).join(" · ");
  return (
    <li className="hc">
      <Link href={href} className="hc-link">
        <span className="hc-photo">
          {image ? (
            <Image
              src={image}
              alt=""
              fill
              sizes="(min-width: 1024px) 296px, (min-width: 640px) 46vw, 84vw"
              unoptimized={!canResize(image)}
            />
          ) : (
            <span className="hc-nophoto">
              <i className="fas fa-car" aria-hidden="true" />
            </span>
          )}
          {badge && <span className="hc-badge">{badge}</span>}
        </span>
        <span className="hc-body">
          <h3 className="hc-name">{name}</h3>
          <span className="hc-price">
            <strong>{price}</strong>
            {unit ? ` ${unit}` : ""}
          </span>
          {line && <span className="hc-meta">{line}</span>}
        </span>
      </Link>
    </li>
  );
}
