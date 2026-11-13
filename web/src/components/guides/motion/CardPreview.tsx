import type { CSSProperties, ReactNode } from "react";
import type { ToolKey } from "@/content/guides/types";
import { route, routePoint } from "./sceneMath";

/** `n` marks, each knowing its place in the row. */
const marks = (n: number, place?: (i: number) => CSSProperties): ReactNode =>
  Array.from({ length: n }, (_, i) => <i key={i} style={{ "--i": i, ...place?.(i) } as CSSProperties} />);

/** The road-trip preview's seven dots, along the same kind of curve the scene draws. */
const ARC = route({ x: 8, y: 78 }, { x: 92, y: 40 }, 0.34);

/**
 * A small sketch of a guide's scene, in the corner of its card: seven days
 * and a car for the weekly rental, three bars for rent-buy-own (at today's
 * real proportions), a needle for guess the price, and so on.
 *
 * Drawn by the server and still by default. guides.css plays it twice while
 * the card is hovered or focused, or (on a touch screen) while the card is
 * the one nearest the middle of the screen; with reduced motion it stays
 * still. Decoration only: the card's words say what the guide is.
 */
export function CardPreview({ tool, bars }: { tool: ToolKey; bars: number[] | null }) {
  let inside: ReactNode;
  switch (tool) {
    case "weeks":
      inside = (
        <>
          {marks(7)}
          <b />
        </>
      );
      break;
    case "three-way":
      inside = (bars ?? [0.5, 1, 0.75]).map((p, i) => <i key={i} style={{ "--p": p, "--i": i } as CSSProperties} />);
      break;
    case "budget":
      inside = (
        <>
          <b />
          {marks(5)}
        </>
      );
      break;
    case "checklist":
      inside = Array.from({ length: 4 }, (_, i) => (
        <i key={i} className="fas fa-check" style={{ "--i": i } as CSSProperties} />
      ));
      break;
    case "life-quiz":
      inside = marks(3);
      break;
    case "price-game":
      inside = (
        <>
          <i />
          <b />
        </>
      );
      break;
    case "cost-story":
      inside = (
        <>
          {marks(12)}
          <b />
        </>
      );
      break;
    case "recall-quiz":
      inside = <em>Free</em>;
      break;
    case "road-trip":
      inside = marks(7, (i) => {
        const at = routePoint(ARC, i / 6);
        return { left: `${at.x}%`, top: `${at.y}%` };
      });
      break;
  }
  return (
    <span className={`pv pv--${tool}`} aria-hidden="true">
      {inside}
    </span>
  );
}
