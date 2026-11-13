"use client";

import { useState, type CSSProperties } from "react";
import type { YearScene as Data } from "../sceneData";
import { STORY_DAY_ONE } from "../sceneMath";
import { SceneCar, SceneFrame, sceneMoney, useScene, useSceneSignal, type SceneProps } from "../sceneKit";

/**
 * Twelve months as a road, with the story's moments marked along it. The car
 * (the one chosen below, a real car from stock) moves on as each choice is
 * made, and reaches month 12 at the ending.
 */
export default function YearScene({ scene: data, currency, locale }: SceneProps<Data>) {
  const scene = useScene();
  const [state, setState] = useState<{ side: "cheap" | "pricier" | null; at: number }>({ side: null, at: -1 });
  useSceneSignal("cost-story", (s) => setState({ side: s.side, at: s.at }));
  const fmt = sceneMoney(currency, locale);

  const car = (state.side ? data[state.side] : null) ?? data.cheap ?? data.pricier;
  const last = data.stops.length - 1;
  const ended = state.at > last;
  const stop = data.stops[Math.min(Math.max(state.at, 0), last)];
  const at = ended ? 1 : stop.at;
  // One label for the moments that share day one, then the months.
  const labels = data.stops
    .filter((s, i) => i === 0 || s.at >= STORY_DAY_ONE)
    .map((s, i) => ({ at: s.at, text: i === 0 ? "Day one" : s.when.replace("Month ", "Mo ") }));

  return (
    <SceneFrame kind="year" scene={scene} caption={data.caption}>
      <p className="sc-chip" key={ended ? "end" : stop.when}>
        {ended ? "One year later" : state.at < 0 ? "Day one" : stop.when}
      </p>
      {state.side && car && (
        <p className="sc-year-car">
          <span>{car.name}</span> <strong className="sc-money">{fmt(car.priceMinor)}</strong>
        </p>
      )}
      <div className="sc-year">
        <span className="sc-year-road" />
        {Array.from({ length: 13 }, (_, m) => (
          <span className="sc-year-tick" key={m} style={{ "--at": STORY_DAY_ONE + (1 - STORY_DAY_ONE) * (m / 12) } as CSSProperties} />
        ))}
        {data.stops.map((s, i) => (
          <span
            className="sc-year-stop"
            key={s.when}
            data-done={state.at >= i || undefined}
            style={{ "--at": s.at, "--i": i } as CSSProperties}
          />
        ))}
        {labels.map((l) => (
          <span className="sc-year-label" key={l.text} style={{ "--at": l.at } as CSSProperties}>
            {l.text}
          </span>
        ))}
        <span className="sc-year-track" style={{ "--at": at } as CSSProperties}>
          {car ? <SceneCar image={car.image} key={car.image} /> : <span className="sc-car sc-car--none" />}
        </span>
      </div>
    </SceneFrame>
  );
}
