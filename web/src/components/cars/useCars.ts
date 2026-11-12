"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isSlug, slugRequests, type PublicCar } from "./carData";

/**
 * The listed cars behind a list of slugs, read from /api/cars.
 *
 * Each slug is asked for once: taking a car off the saved list, or saving
 * another, only asks for what is new. A slug the answer leaves out is a car
 * that is no longer listed (`gone`), which callers drop from their list.
 */
export function useCars(
  market: string,
  slugs: string[],
): {
  /** In the order of `slugs`, without the ones not listed. */
  cars: PublicCar[];
  /** Asked for and not listed any more. */
  gone: string[];
  status: "loading" | "ready" | "error";
  retry: () => void;
} {
  // null: asked for, and not listed.
  const [known, setKnown] = useState<ReadonlyMap<string, PublicCar | null>>(() => new Map());
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const missing = slugs.filter((slug) => !known.has(slug)).join(",");

  useEffect(() => {
    if (!missing) return;
    const wanted = missing.split(",");
    let live = true;

    Promise.all(
      slugRequests(wanted).map(async (chunk) => {
        const res = await fetch(`/api/cars?market=${market}&slugs=${chunk.join(",")}`);
        if (!res.ok) throw new Error(`cars: ${res.status}`);
        const body: { cars?: unknown } = await res.json();
        return Array.isArray(body.cars) ? (body.cars as PublicCar[]) : [];
      }),
    )
      .then((answers) => {
        if (!live) return;
        setKnown((before) => {
          const next = new Map(before);
          for (const slug of wanted) next.set(slug, null);
          for (const car of answers.flat()) if (isSlug(car?.slug)) next.set(car.slug, car);
          return next;
        });
        setFailed(false);
      })
      .catch(() => {
        if (live) setFailed(true);
      });

    return () => {
      live = false;
    };
  }, [market, missing, attempt]);

  const cars = useMemo(
    () => slugs.flatMap((slug) => known.get(slug) ?? []),
    [slugs, known],
  );
  const gone = useMemo(() => slugs.filter((slug) => known.get(slug) === null), [slugs, known]);
  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  return { cars, gone, status: failed ? "error" : missing ? "loading" : "ready", retry };
}
