import type { CSSProperties } from "react";
import { GAUGE_SWING } from "./sceneMath";

/**
 * A needle gauge from "too low" to "too high". The needle rests at `angle`
 * (sceneMath.gaugeAngle: straight up is the price). Decoration: whoever uses
 * it says the same thing in words beside it.
 *
 * @param sweep the scene's version: sweep end to end, then settle.
 */
export function Gauge({ angle, sweep = false }: { angle: number; sweep?: boolean }) {
  return (
    <span className="gg" aria-hidden="true" data-sweep={sweep || undefined}>
      <span className="gg-dial">
        <svg viewBox="0 0 140 80" focusable="false">
          <path className="gg-arc" d="M 14 72 A 56 56 0 0 1 126 72" />
          {/* The stretch around straight up: the price itself. */}
          <path className="gg-mid" d="M 60.3 16.8 A 56 56 0 0 1 79.7 16.8" />
          {[-GAUGE_SWING, -GAUGE_SWING / 2, 0, GAUGE_SWING / 2, GAUGE_SWING].map((a) => (
            <line key={a} className="gg-tick" x1="70" y1="10" x2="70" y2="4" transform={`rotate(${a} 70 72)`} />
          ))}
        </svg>
        <span className="gg-needle" style={{ "--a": `${angle}deg` } as CSSProperties} />
        <span className="gg-hub" />
      </span>
      <span className="gg-ends">
        <span>Too low</span>
        <span>Too high</span>
      </span>
    </span>
  );
}
