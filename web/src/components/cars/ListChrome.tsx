import Link from "next/link";
import type { ReactNode } from "react";
import type { MarketCode } from "@/lib/market";
import type { BodyCount, BodyKey } from "./carData";
import { SavedChip } from "./Saved";

/**
 * The top of a car list: a small label, the title and a live count. Nothing
 * else sits above the chips, so the first car's photo is on the first screen
 * of a phone.
 */
export function ListHead({
  eyebrow,
  title,
  count,
}: {
  eyebrow: string;
  title: string;
  /** "16 cars for sale", "5 of 16 cars". */
  count: ReactNode;
}) {
  return (
    <header className="cl-head">
      <p className="cl-eyebrow">{eyebrow}</p>
      <h1 className="cl-title">{title}</h1>
      <p className="cl-count" aria-live="polite">
        {count}
      </p>
    </header>
  );
}

/**
 * Tap chips for body type, with how many cars each one leaves: Saved, All,
 * then only the types in stock. Every chip is a link to the list with that
 * choice in its address, so it works without scripts and can be shared.
 */
export function BodyChips({
  market,
  types,
  total,
  chosen,
  saved,
  hrefFor,
  savedHref,
}: {
  market: MarketCode;
  types: BodyCount[];
  /** How many cars "All" shows. */
  total: number;
  chosen: BodyKey | null;
  /** The Saved filter is on. */
  saved: boolean;
  /** The list with this body type chosen; null is All. */
  hrefFor: (key: BodyKey | null) => string;
  savedHref: string;
}) {
  return (
    <nav className="cl-chips" aria-label="Body type">
      <ul>
        <li>
          <SavedChip market={market} href={savedHref} active={saved} />
        </li>
        <li>
          <Link
            href={hrefFor(null)}
            scroll={false}
            className="cl-chip"
            aria-current={!saved && chosen == null ? "true" : undefined}
          >
            All <span className="cl-chip-n">{total}</span>
          </Link>
        </li>
        {types.map((t) => (
          <li key={t.key}>
            <Link
              href={hrefFor(t.key)}
              scroll={false}
              className="cl-chip"
              aria-current={!saved && chosen === t.key ? "true" : undefined}
            >
              {t.label} <span className="cl-chip-n">{t.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
