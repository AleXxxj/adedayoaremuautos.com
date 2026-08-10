"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * The original header navigation, including its mobile behaviour.
 *
 * Below 900px the stylesheet hides `.nav-menu` and shows `.mobile-menu-btn`,
 * so the button is not decoration — without it the site has no navigation at
 * all on a phone. The original toggled `.active` and swapped the bars icon for
 * a cross; that is reproduced, with the keyboard and screen-reader wiring the
 * original left out.
 */
export function LegacyNav({ items }: { items: { href: string; label: string }[] }) {
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
        <i className={open ? "fas fa-times" : "fas fa-bars"} />
      </button>

      <nav
        className={`nav-menu${open ? " active" : ""}`}
        id="navMenu"
        aria-label="Primary"
      >
        {items.map((n) => {
          // The market root is only "current" on an exact match; every other
          // entry also owns its sub-pages, so a car detail page keeps Buy Cars lit.
          const active =
            n.href.split("/").length === 2
              ? pathname === n.href
              : pathname === n.href || pathname.startsWith(`${n.href}/`);
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
      </nav>
    </>
  );
}
