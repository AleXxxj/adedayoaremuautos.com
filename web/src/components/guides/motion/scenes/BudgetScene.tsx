"use client";

import { useState, type CSSProperties } from "react";
import type { BudgetScene as Data } from "../sceneData";
import { SceneCar, SceneFrame, SceneNumber, useScene, useSceneSignal, type SceneProps } from "../sceneKit";
import { odometerDigits } from "../sceneMath";

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * An odometer rolls to the budget chosen below, and the cars from stock that
 * it reaches step forward. The count beside it is the tool's own.
 */
export default function BudgetScene({ scene: data }: SceneProps<Data>) {
  const scene = useScene();
  const [major, setMajor] = useState(data.start);
  useSceneSignal("budget", (s) => setMajor(s.major));
  const places = String(Math.max(...data.budgets.map((b) => b.major))).length;
  const digits = odometerDigits(major, places);
  const lead = places - String(major).length;
  const reach = data.budgets.find((b) => b.major === major)?.count ?? 0;

  return (
    <SceneFrame kind="budget" scene={scene} caption={data.caption}>
      <div className="sc-budget-top">
        <p className="sc-odo">
          <span className="sc-odo-unit">$</span>
          {digits.map((d, i) => (
            <span className="sc-odo-cell" key={i}>
              {/* A comma before each group of three, counted from the right. */}
              {i > 0 && (places - i) % 3 === 0 && <span className="sc-odo-comma">,</span>}
              <span className="sc-wheel" data-lead={i < lead || undefined}>
                <span
                  className="sc-wheel-strip"
                  style={{ transform: `translateY(${-d * 10}%)`, "--i": i } as CSSProperties}
                >
                  {DIGITS.map((n) => (
                    <span key={n}>{n}</span>
                  ))}
                </span>
              </span>
            </span>
          ))}
        </p>
        <p className="sc-budget-count">
          <strong>
            <SceneNumber value={reach} format={String} run={scene.run} ms={900} delay={500} />
          </strong>
          <span>{reach === 1 ? "car in reach" : "cars in reach"}</span>
        </p>
      </div>
      <div className="sc-lot">
        {data.cars.map((c, i) => (
          <span
            className="sc-lot-car"
            key={c.image}
            data-in={c.priceMinor <= major * 100 || undefined}
            style={{ "--i": i } as CSSProperties}
          >
            <SceneCar image={c.image} sizes="140px" />
          </span>
        ))}
      </div>
    </SceneFrame>
  );
}
