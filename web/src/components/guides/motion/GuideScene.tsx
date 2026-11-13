"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { CurrencyCode } from "@/lib/money";
import type { Scene } from "./sceneData";

/**
 * The scene at the top of a guide. Each one is its own small bundle, loaded
 * only on the guide that shows it; the server still draws its last frame, so
 * the picture is there before (and without) any JavaScript.
 *
 * The slot around it has the scene's height from the first paint, so nothing
 * on the page moves when the scene arrives or plays.
 */
const SCENES = {
  weeks: dynamic(() => import("./scenes/WeekScene")),
  "three-way": dynamic(() => import("./scenes/LanesScene")),
  budget: dynamic(() => import("./scenes/BudgetScene")),
  checklist: dynamic(() => import("./scenes/SpotsScene")),
  "life-quiz": dynamic(() => import("./scenes/DealScene")),
  "price-game": dynamic(() => import("./scenes/TagScene")),
  "cost-story": dynamic(() => import("./scenes/YearScene")),
  "recall-quiz": dynamic(() => import("./scenes/StampScene")),
  "road-trip": dynamic(() => import("./scenes/MapScene")),
} as const;

export function GuideScene({ scene, currency, locale }: { scene: Scene; currency: CurrencyCode; locale: string }) {
  // Each scene takes its own shape of data; the tool's name picks the pair.
  const Drawn = SCENES[scene.tool] as ComponentType<{ scene: Scene; currency: CurrencyCode; locale: string }>;
  return (
    <div className="sc-slot">
      <Drawn scene={scene} currency={currency} locale={locale} />
    </div>
  );
}
