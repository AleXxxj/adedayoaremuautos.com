"use client";

import { Gauge } from "../Gauge";
import type { TagScene as Data } from "../sceneData";
import { SceneCar, SceneFrame, sceneMoney, useScene, type SceneProps } from "../sceneKit";

/**
 * One real car from stock: the needle sweeps from "too low" to "too high",
 * the price tag turns over to the listed price, and the needle comes to rest
 * on it.
 */
export default function TagScene({ scene: data, currency, locale }: SceneProps<Data>) {
  const scene = useScene();
  const fmt = sceneMoney(currency, locale);
  return (
    <SceneFrame kind="tag" scene={scene} caption={data.caption}>
      <div className="sc-tag-car">
        <SceneCar image={data.car.image} sizes="320px" />
        <span className="sc-tag">
          <span className="sc-flip">
            <span className="sc-face sc-face--ask">$ ?</span>
            <span className="sc-face sc-face--price sc-money">{fmt(data.car.priceMinor)}</span>
          </span>
        </span>
      </div>
      <Gauge angle={0} sweep />
    </SceneFrame>
  );
}
