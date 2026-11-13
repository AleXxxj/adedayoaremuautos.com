"use client";

import type { StampScene as Data } from "../sceneData";
import { SceneFrame, useScene, type SceneProps } from "../sceneKit";

/**
 * A recall notice is stamped "still open", then "fixed free": the first
 * card's answer (NHTSA: the dealer fixes a safety recall for free).
 */
export default function StampScene({ scene: data }: SceneProps<Data>) {
  const scene = useScene();
  return (
    <SceneFrame kind="stamp" scene={scene} caption={data.caption}>
      <div className="sc-notice">
        <p className="sc-notice-head">
          <i className="fas fa-triangle-exclamation" />
          Safety recall notice
        </p>
        <span className="sc-notice-line" />
        <span className="sc-notice-line" />
        <span className="sc-notice-line sc-notice-line--short" />
        <p className="sc-notice-row">
          <span>Remedy</span>
          <span className="sc-notice-line" />
        </p>
        <span className="sc-stamp sc-stamp--open">Still open</span>
        <span className="sc-stamp sc-stamp--fixed">Fixed free</span>
      </div>
    </SceneFrame>
  );
}
