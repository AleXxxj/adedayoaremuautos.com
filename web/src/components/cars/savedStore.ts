"use client";

import { useSyncExternalStore } from "react";
import { MAX_RECENT, MAX_SAVED, slugsFrom, toggleSlug, withRecent } from "./carData";

/**
 * Saved and recently viewed cars, kept in this browser and nowhere else.
 *
 * Two short lists of slugs per market in localStorage: no account, nothing
 * sent to the server, no personal data. The cars themselves are read back by
 * slug from /api/cars when a list is shown (useCars.ts).
 *
 * Every heart, chip and row on a page reads the same list through
 * useSlugList, so saving a car on a card updates the "Saved" count at once,
 * and a change in another tab arrives through the `storage` event. Where
 * storage is switched off (some private windows), the lists live in memory
 * for the page, so a heart still fills when tapped.
 */

export type CarList = "saved" | "recent";

const LIMIT: Record<CarList, number> = { saved: MAX_SAVED, recent: MAX_RECENT };
const keyFor = (list: CarList, market: string) => `aaa:${list}:${market}`;

const CHANGED = "aaa:cars-changed";
const EMPTY: string[] = [];
const NO_CARS = () => EMPTY;

/** Used only when localStorage refuses to read or write. */
const memory = new Map<string, string>();

function getRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function setRaw(key: string, value: string[]): void {
  const raw = JSON.stringify(value);
  try {
    if (value.length) window.localStorage.setItem(key, raw);
    else window.localStorage.removeItem(key);
  } catch {
    if (value.length) memory.set(key, raw);
    else memory.delete(key);
  }
  window.dispatchEvent(new Event(CHANGED));
}

/**
 * The parsed list for each key, kept until the stored text changes:
 * useSyncExternalStore needs the same array back while nothing has changed.
 */
const parsed = new Map<string, { raw: string | null; value: string[] }>();

function read(list: CarList, market: string): string[] {
  const key = keyFor(list, market);
  const raw = getRaw(key);
  const hit = parsed.get(key);
  if (hit && hit.raw === raw) return hit.value;
  const slugs = slugsFrom(raw, LIMIT[list]);
  const value = slugs.length ? slugs : EMPTY;
  parsed.set(key, { raw, value });
  return value;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

/** A market's saved or recently viewed slugs, newest first. Empty on the server. */
export function useSlugList(list: CarList, market: string): string[] {
  return useSyncExternalStore(subscribe, () => read(list, market), NO_CARS);
}

/** Saves a car, or takes it off the saved list. */
export function toggleSaved(market: string, slug: string): void {
  setRaw(keyFor("saved", market), toggleSlug(read("saved", market), slug));
}

/** Puts a car at the front of the recently viewed list. */
export function recordView(market: string, slug: string): void {
  const before = read("recent", market);
  const after = withRecent(before, slug);
  if (after.join() !== before.join()) setRaw(keyFor("recent", market), after);
}

/** Drops cars that are no longer listed, so a list never counts a car it can't show. */
export function forgetCars(list: CarList, market: string, gone: string[]): void {
  if (gone.length === 0) return;
  const before = read(list, market);
  const after = before.filter((slug) => !gone.includes(slug));
  if (after.length !== before.length) setRaw(keyFor(list, market), after);
}
