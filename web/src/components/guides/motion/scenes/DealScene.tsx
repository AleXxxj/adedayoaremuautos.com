"use client";

import type { CSSProperties } from "react";
import type { DealScene as Data } from "../sceneData";
import { SceneCar, SceneFrame, useScene, type SceneProps } from "../sceneKit";

/**
 * Three of the quiz's questions are dealt as cards, then turn over to show
 * real cars from stock: questions in, cars out.
 */
export default function DealScene({ scene: data }: SceneProps<Data>) {
  const scene = useScene();
  return (
    <SceneFrame kind="deal" scene={scene} caption={data.caption}>
      <div className="sc-deal">
        {data.cards.map((c, i) => (
          <span
            className="sc-deal-card"
            key={c.ask}
            style={{ "--i": i, "--o": i - (data.cards.length - 1) / 2 } as CSSProperties}
          >
            <span className="sc-flip">
              <span className="sc-face sc-face--ask">
                <i className={`fas ${c.icon}`} />
                <span>{c.ask}</span>
              </span>
              <span className="sc-face sc-face--car">
                {c.car ? <SceneCar image={c.car.image} sizes="220px" /> : <i className={`fas ${c.icon}`} />}
                {c.car && <span>{c.car.name}</span>}
              </span>
            </span>
          </span>
        ))}
      </div>
    </SceneFrame>
  );
}
