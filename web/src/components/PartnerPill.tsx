"use client";

import Link from "next/link";
import { usePartnerSession } from "@/lib/usePartnerSession";

/**
 * The header's partner button: "Log in" for a visitor, "My page" for a
 * partner who is already logged in, so the site never asks someone who is
 * logged in to log in.
 */
export function PartnerPill() {
  const active = usePartnerSession();
  return active ? (
    <Link href="/partner" className="partner-pill" aria-label="My partner page">
      <i className="fas fa-user-check" aria-hidden="true" />
      <span className="partner-pill-short" aria-hidden="true">
        My page
      </span>
      <span className="partner-pill-long" aria-hidden="true">
        My partner page
      </span>
    </Link>
  ) : (
    <Link href="/partner/login" className="partner-pill" aria-label="Partner log in">
      <i className="fas fa-user" aria-hidden="true" />
      <span className="partner-pill-short" aria-hidden="true">
        Log in
      </span>
      <span className="partner-pill-long" aria-hidden="true">
        Partner log in
      </span>
    </Link>
  );
}
