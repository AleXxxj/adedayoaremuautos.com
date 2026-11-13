"use client";

/// <reference types="react/canary" />
import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

/**
 * A short fade between pages, as in an app.
 *
 * React's <ViewTransition> (supported by this version of Next with no
 * setting: node_modules/next/dist/docs/01-app/02-guides/view-transitions.md).
 * Keyed by the path, so moving to another page fades the old one out and the
 * new one in, while changing a filter on the same page (only the query string
 * changes) does not animate at all. `default="none"` keeps it out of every
 * other update on the page.
 *
 * Browsers without view transitions, and people who asked for less motion
 * (app-shell.css), get a plain page change.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition key={pathname} enter="page-in" exit="page-out" default="none">
      {children}
    </ViewTransition>
  );
}
