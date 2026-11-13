"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { canResize } from "@/lib/photo";
import { SPOT_AT, type SpotsScene as Data } from "../sceneData";
import { SceneFrame, useScene, type SceneProps } from "../sceneKit";

/**
 * A real car from stock with the checklist's parts marked over it. Each mark
 * pulses in turn while its name and number of checks is read out below, and
 * the scene rests on the total.
 */
export default function SpotsScene({ scene: data }: SceneProps<Data>) {
  const scene = useScene();
  const total = data.spots.reduce((n, s) => n + s.checks, 0);
  return (
    <SceneFrame kind="spots" scene={scene} caption={data.caption}>
      {data.photo && (
        <Image
          className="sc-spots-photo"
          src={data.photo}
          alt=""
          fill
          sizes="(min-width: 800px) 760px, 100vw"
          unoptimized={!canResize(data.photo)}
        />
      )}
      <span className="sc-sweep" />
      {data.spots.map((s, i) => {
        const at = SPOT_AT[s.id] ?? { x: 16 + i * 17, y: 22 };
        return (
          <span className="sc-spot" key={s.id} style={{ left: `${at.x}%`, top: `${at.y}%`, "--i": i } as CSSProperties}>
            <i className={`fas ${s.icon}`} />
          </span>
        );
      })}
      <div className="sc-readout">
        {data.spots.map((s, i) => (
          <p key={s.id} style={{ "--i": i } as CSSProperties}>
            <strong>{s.title}</strong> {s.checks} checks
          </p>
        ))}
        <p className="sc-readout-last" style={{ "--i": data.spots.length } as CSSProperties}>
          <strong>{total} checks</strong> {data.spots.length} parts
        </p>
      </div>
    </SceneFrame>
  );
}
