"use client";

import { useEffect, useState } from "react";

/** One question per page load, shared by the header's pill and the menu. */
let asked: Promise<boolean> | null = null;

function ask(): Promise<boolean> {
  asked ??= fetch("/api/partner/session", { credentials: "same-origin", cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { active: false }))
    .then((b: { active?: boolean }) => b.active === true)
    .catch(() => false);
  return asked;
}

/**
 * Whether an active partner is logged in on this browser. False until the
 * answer is in, so the server's "Log in" is what a first paint shows.
 */
export function usePartnerSession(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    let alive = true;
    void ask().then((yes) => {
      if (alive) setActive(yes);
    });
    return () => {
      alive = false;
    };
  }, []);
  return active;
}
