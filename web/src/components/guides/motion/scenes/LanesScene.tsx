"use client";

import { useState, type CSSProperties } from "react";
import type { Way } from "../../guideMath";
import type { LanesScene as Data } from "../sceneData";
import { SceneFrame, SceneNumber, sceneMoney, useScene, useSceneSignal, type SceneProps } from "../sceneKit";
import { barScales } from "../sceneMath";

const WAYS: { way: Way; label: string; icon: string }[] = [
  { way: "rent", label: "Rent", icon: "fa-key" },
  { way: "buy", label: "Buy", icon: "fa-car" },
  { way: "own", label: "Rent to own", icon: "fa-hand-holding-heart" },
];

/**
 * Three lanes, three totals: each bar runs to its real figure for the length
 * chosen in the tool below, as long beside the others as the money is. Pick
 * another length and the bars move to the new figures.
 */
export default function LanesScene({ scene: data, currency, locale }: SceneProps<Data>) {
  const scene = useScene();
  const [key, setKey] = useState(data.start);
  useSceneSignal("three-way", (s) => setKey(s.key));
  const fmt = sceneMoney(currency, locale);
  const length = data.lengths.find((l) => l.key === key) ?? data.lengths[0];
  const scales = barScales(WAYS.map((w) => length.values[w.way]));

  return (
    <SceneFrame kind="lanes" scene={scene} caption={data.caption}>
      <p className="sc-chip">{length.label}</p>
      <div className="sc-lanes">
        {WAYS.map((w, i) => {
          const value = length.values[w.way];
          const lowest = length.lowest.length === 1 && length.lowest[0] === w.way;
          return (
            <div className="sc-lane" key={w.way} data-lowest={lowest || undefined}>
              <span className="sc-lane-name">
                <i className={`fas ${w.icon}`} />
                {w.label}
                {lowest && <em>Lowest</em>}
              </span>
              <strong className="sc-lane-figure">
                {value != null ? (
                  <SceneNumber value={value / 100} format={(n) => fmt(n * 100)} run={scene.run} ms={1100} delay={i * 120} />
                ) : (
                  "—"
                )}
              </strong>
              <span className="sc-lane-road">
                <span className="sc-lane-bar" style={{ "--p": scales[i], "--i": i } as CSSProperties} />
              </span>
            </div>
          );
        })}
      </div>
    </SceneFrame>
  );
}
