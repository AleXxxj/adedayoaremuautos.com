import Image from "next/image";
import { canResize } from "@/lib/photo";
import type { ToolKey } from "@/content/guides/types";

/**
 * What arrives at the end of a guide, above its closing call to action: the
 * same thing the scene at the top was about, coming to rest.
 *
 *   car    the guide's car from stock drives in along the road line and stops
 *   seal   the same, and the checklist's seal presses on once it has stopped
 *   tag    the same, and a price tag swings onto it
 *   stamp  a recall notice takes its stamp
 *   route  the line from Greensboro runs out to its end and the car follows
 *
 * Decoration only (the call to action under it says what to do), drawn by
 * the server in its last frame. It plays once, when the block it sits in
 * eases into view (ScrollLife sets data-reveal), and with reduced motion or
 * without JavaScript it is simply there. Its strip has a fixed height.
 */
const KIND: Record<ToolKey, "car" | "seal" | "tag" | "stamp" | "route"> = {
  weeks: "car",
  "three-way": "car",
  budget: "car",
  checklist: "seal",
  "life-quiz": "car",
  "price-game": "tag",
  "cost-story": "car",
  "recall-quiz": "stamp",
  "road-trip": "route",
};

export function GuideOutro({ tool, photo }: { tool: ToolKey; photo: string | null }) {
  const kind = KIND[tool];
  // No photo from stock, no car: the road alone would be an empty promise.
  if (kind !== "stamp" && !photo) return null;
  return (
    <div className={`gd-outro gd-outro--${kind}`} aria-hidden="true">
      {kind === "stamp" ? (
        <span className="gd-outro-notice">
          <span className="gd-outro-lines">
            <i />
            <i />
            <i />
          </span>
          <span className="gd-outro-stamp">Fixed free</span>
        </span>
      ) : (
        <>
          <span className="gd-outro-road" />
          {kind === "route" && (
            <>
              <span className="gd-outro-pin gd-outro-pin--from" />
              <span className="gd-outro-pin gd-outro-pin--to" />
            </>
          )}
          <span className="gd-outro-run">
            <span className="gd-outro-car">
              {/* Small, and it starts out of sight: loaded with the page, so it is there when it drives in. */}
              <Image src={photo!} alt="" fill sizes="112px" loading="eager" unoptimized={!canResize(photo!)} />
              {kind === "seal" && (
                <span className="gd-outro-seal">
                  <i className="fas fa-check" />
                </span>
              )}
              {kind === "tag" && (
                <span className="gd-outro-tag">
                  <i className="fas fa-tag" />
                </span>
              )}
            </span>
          </span>
        </>
      )}
    </div>
  );
}
