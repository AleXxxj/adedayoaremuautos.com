import Image from "next/image";
import Link from "next/link";
import { canResize } from "@/lib/photo";

/**
 * One car in a list: photo, name, price, a line of details. The whole row is
 * the link, a full-width target for a thumb. A row on a phone, a card in a
 * grid on a wider screen (styles/car-list.css).
 *
 * Every rate, the deposit, open dates or the full specification are on the
 * car's own page, where people decide. A list is for choosing which page to
 * open.
 */
export function CarRow({
  href,
  image,
  preload = false,
  title,
  price,
  unit,
  details,
  badge,
}: {
  href: string;
  image: string | null;
  /** The first row: usually the largest thing on the first screen. */
  preload?: boolean;
  title: string;
  /** "$350", "Price on request". */
  price: string;
  /** "a week"; nothing for a sale price. */
  unit?: string | null;
  /** "or $65 a day", "82,000 mi", "Automatic": joined with dots. */
  details: (string | null | undefined | false)[];
  badge?: string | null;
}) {
  const line = details.filter(Boolean).join(" · ");
  return (
    <li>
      <Link href={href} className="cl-card">
        <span className="cl-card-photo">
          {image ? (
            // Sized to the slot it fills: about 112 pixels wide on a phone,
            // a third of the row on a wider screen.
            <Image
              src={image}
              alt=""
              fill
              sizes="(min-width: 768px) 360px, 112px"
              preload={preload}
              unoptimized={!canResize(image)}
            />
          ) : (
            <span className="cl-card-nophoto">
              <i className="fas fa-car" aria-hidden="true" />
            </span>
          )}
        </span>
        <span className="cl-card-body">
          <h3 className="cl-card-name">{title}</h3>
          <span className="cl-card-price">
            <strong>{price}</strong>
            {unit ? ` ${unit}` : ""}
          </span>
          {line && <span className="cl-card-meta">{line}</span>}
          {badge && <span className="cl-card-badge">{badge}</span>}
        </span>
        <span className="cl-card-go" aria-hidden="true">
          <i className="fas fa-chevron-right" />
        </span>
      </Link>
    </li>
  );
}
