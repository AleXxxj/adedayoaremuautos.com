"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import type { MarketCode } from "@/lib/market";

/**
 * The bar of five tabs along the bottom of a phone.
 *
 * On a phone the header's links fold behind the menu button, so renting,
 * checking a car and referrals were two taps and a read away on every page.
 * The bar keeps the things people come for under the thumb; the menu still
 * lists everything.
 *
 * Styled at the end of refine.css, which shows it only at 900px and below,
 * and hides it in print, while a text field has focus (so it never rides up
 * on the keyboard), and on a page with its own bar fixed to the bottom. It is
 * rendered only by the public market layout, so the admin and partner pages
 * never have it.
 */
export function TabBar({ market }: { market: MarketCode }) {
  const pathname = usePathname();

  const tabs = [
    { href: `/${market}`, label: "Home", icon: "fa-house" },
    { href: `/${market}/rentals`, label: "Rent", icon: "fa-key" },
    { href: `/${market}/inventory`, label: "Buy", icon: "fa-car" },
    // Nigeria has no car check: cars there go by chassis number, not VIN.
    market === "us"
      ? { href: "/us/check", label: "Check", icon: "fa-clipboard-check" }
      : { href: "/ng/financing", label: "Finance", icon: "fa-calculator" },
    { href: `/${market}/referral`, label: "Earn", icon: "fa-hand-holding-dollar" },
  ];

  return (
    <nav className="tabbar" aria-label="Shortcuts">
      <ul className="tabbar-list">
        {tabs.map((t) => {
          // The header's rule (LegacyNav): Home only on an exact match; every
          // other tab also owns its sub-pages, so a car's page keeps Rent lit.
          const active =
            t.href === `/${market}`
              ? pathname === t.href
              : pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className="tabbar-tab"
                aria-current={active ? "page" : undefined}
                // Only on the tab's own page. From a car's page, Rent is a
                // plain link back to the list.
                onClick={pathname === t.href ? toTop : undefined}
              >
                <i className={`fas ${t.icon}`} aria-hidden="true" />
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The tab for the page you are on takes you back to its top, as in an app.
 * This replaced the back-to-top button. A click with a modifier key still
 * opens the page in a new tab or window.
 */
function toTop(e: MouseEvent<HTMLAnchorElement>) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  // A long page smooth-scrolled from the bottom is a lot of motion for
  // someone who asked their system for less.
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
}
