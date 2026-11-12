"use client";

import { toggleSaved, useSlugList } from "./savedStore";

/**
 * The heart that saves a car in this browser (savedStore.ts).
 *
 * A toggle button: its name stays "Save 2013 Hyundai Sonata" and
 * `aria-pressed` says whether it is saved, which is how a screen reader
 * expects a toggle to speak. On a card it is the heart alone, over the photo;
 * on a car's page it is a pill that reads "Save" or "Saved".
 */
export function SaveButton({
  market,
  slug,
  name,
  variant = "heart",
}: {
  market: string;
  slug: string;
  /** The car's whole name, for the button's label. */
  name: string;
  variant?: "heart" | "pill";
}) {
  const saved = useSlugList("saved", market).includes(slug);
  return (
    <button
      type="button"
      className={`sv sv--${variant}`}
      aria-pressed={saved}
      aria-label={`Save ${name}`}
      onClick={() => toggleSaved(market, slug)}
    >
      <i className={`${saved ? "fas" : "far"} fa-heart`} aria-hidden="true" />
      {variant === "pill" && <span>{saved ? "Saved" : "Save"}</span>}
    </button>
  );
}
