"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * The header navigation, and the menu it folds into on smaller screens.
 *
 * Below 1100px the stylesheet hides the links and shows `.mobile-menu-btn`,
 * so the button is not decoration — without it the site has no navigation at
 * all on a phone. The original toggled `.active` and swapped the bars icon for
 * a cross; that is reproduced, with the keyboard and screen-reader wiring the
 * original left out.
 *
 * The menu also carries two things the header row has no room for on a
 * phone: the partner log in and, below 900px, the country switch. On a wide
 * screen both stay in the header and these copies are hidden (refine.css).
 */
export function LegacyNav({
  items,
  switches = [],
}: {
  items: { href: string; label: string }[];
  /** The other markets, for the switch in the menu. */
  switches?: { href: string; market: string; name: string }[];
}) {
  const pathname = usePathname();
  // Storing the route the menu was opened on, rather than a plain boolean,
  // closes it on any navigation — link, back button or forward — without an
  // effect that would fire a second render on every route change.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const setOpen = (next: boolean) => setOpenedAt(next ? pathname : null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenedAt(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="mobile-menu-btn"
        id="mobileMenuBtn"
        aria-expanded={open}
        aria-controls="navMenu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen(!open)}
      >
        <i className={open ? "fas fa-times" : "fas fa-bars"} aria-hidden="true" />
      </button>

      <nav
        className={`nav-menu${open ? " active" : ""}`}
        id="navMenu"
        aria-label="Primary"
      >
        {items.map((n) => {
          // Every entry owns its sub-pages, so a car's page keeps Buy Cars lit.
          const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={active ? "active" : undefined}
              aria-current={active ? "page" : undefined}
            >
              {n.label}
            </Link>
          );
        })}

        <Link href="/partner/login" className="nav-extra nav-extra--partner">
          <i className="fas fa-user" aria-hidden="true" />
          Partner log in
        </Link>
        {switches.map((s) => (
          <Link
            key={s.market}
            href={s.href}
            className="nav-extra nav-extra--market"
            data-market={s.market}
          >
            <i className="fas fa-globe" aria-hidden="true" />
            Switch to {s.name}
          </Link>
        ))}
      </nav>
    </>
  );
}
