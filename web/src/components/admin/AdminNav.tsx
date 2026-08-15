"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: string;
}

/**
 * Admin navigation.
 *
 * The links were plain text in a row, which on a phone wrapped into an
 * unreadable paragraph and gave no indication of where you were. This is a
 * real navigation: pills with an active state on desktop, and a drawer behind
 * a button below 900px.
 *
 * The item list is decided on the server from the signed-in role, so a member
 * of staff is never shown a section they cannot open. Hiding it here is
 * presentation only — every page still calls requireStaff() and checks its own
 * permissions, because a nav that omits a link is not a security boundary.
 */
export function AdminNav({
  items,
  email,
  role,
}: {
  items: AdminNavItem[];
  email: string;
  role: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Longest match wins, so /admin/vehicles/new lights Inventory rather than
  // lighting nothing.
  const activeHref = items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  // Escape closes it. Registered only while open, so nothing listens on the
  // vast majority of renders.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Labelled, not a bare glyph. An icon-only square in a header reads as
          a logo until you happen to tap it — and it read as nothing at all
          while the icon font was missing. */}
      <button
        type="button"
        className="admin-burger"
        aria-expanded={open}
        aria-controls="admin-nav"
        onClick={() => setOpen((o) => !o)}
      >
        <i className={open ? "fas fa-times" : "fas fa-bars"} aria-hidden="true" />
        <span>Menu</span>
      </button>

      <nav
        id="admin-nav"
        className={`admin-nav${open ? " is-open" : ""}`}
        aria-label="Admin sections"
      >
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`admin-nav-link${i.href === activeHref ? " is-active" : ""}`}
            aria-current={i.href === activeHref ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            <i className={i.icon} aria-hidden="true" />
            <span>{i.label}</span>
          </Link>
        ))}

        {/* Inside the drawer on a phone, where the header has no room for it. */}
        <div className="admin-nav-foot">
          <span className="admin-who">
            {email} · {role}
          </span>
        </div>
      </nav>

      {open && (
        <button
          type="button"
          className="admin-scrim"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
