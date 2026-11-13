import { STORY_ENDINGS, STORY_STEPS, storyCars } from "@/content/guides/cheapCar";
import { CHECKLIST } from "@/content/guides/checklist";
import { LIFE_QUESTIONS } from "@/content/guides/lifeQuiz";
import { RECALL_FACTS } from "@/content/guides/recallQuiz";
import { TRIP_PLACES } from "@/content/guides/roadTrip";
import { RTO_DISCLOSURE, owningTiers, rtoTierLine } from "@/content/guides/rentBuyOwn";
import { guideHref } from "@/content/guides";
import type { GuideData, GuideMeta } from "@/content/guides/types";
import { BUDGETS_MAJOR, buyFigures, lowestOwnTier } from "./guideMath";
import { BudgetTool } from "./tools/BudgetTool";
import { ChecklistTool } from "./tools/ChecklistTool";
import { CostStoryTool } from "./tools/CostStoryTool";
import { LifeQuizTool } from "./tools/LifeQuizTool";
import { PriceGameTool } from "./tools/PriceGameTool";
import { RecallQuizTool } from "./tools/RecallQuizTool";
import { RoadTripTool } from "./tools/RoadTripTool";
import { ThreeWayTool } from "./tools/ThreeWayTool";
import { WeeksTool } from "./tools/WeeksTool";

/**
 * The interactive part of a guide, chosen by the guide's `tool`.
 *
 * Each tool is a client component handed only what it shows: names, photos,
 * prices and rates. The arithmetic runs in the browser on those, with the
 * same pure functions the build checks.
 */
export function GuideTool({ meta, data }: { meta: GuideMeta; data: GuideData }) {
  switch (meta.tool) {
    case "weeks":
      return <WeeksTool cars={data.rent} currency={data.currency} locale={data.locale} />;

    case "three-way": {
      const buy = buyFigures(data.sale.map((c) => c.priceMinor));
      const tiers = owningTiers(data.tiers);
      return (
        <ThreeWayTool
          rent={data.rent}
          buy={
            buy && data.sale[0]
              ? {
                  count: buy.count,
                  lowestMinor: buy.lowestMinor,
                  middleMinor: buy.middleMinor,
                  lowName: data.sale[0].name,
                }
              : null
          }
          tier={lowestOwnTier(data.tiers)}
          tierLines={tiers.map((t) => rtoTierLine(data, t))}
          disclosure={RTO_DISCLOSURE}
          currency={data.currency}
          locale={data.locale}
        />
      );
    }

    case "budget":
      return (
        <BudgetTool
          cars={data.sale}
          budgets={BUDGETS_MAJOR}
          currency={data.currency}
          locale={data.locale}
          distanceUnit={data.distanceUnit}
        />
      );

    case "checklist":
      return <ChecklistTool groups={CHECKLIST} path={guideHref(meta.slug)} />;

    case "life-quiz":
      return (
        <LifeQuizTool
          questions={LIFE_QUESTIONS}
          sale={data.sale}
          rent={data.rent}
          currency={data.currency}
          locale={data.locale}
          distanceUnit={data.distanceUnit}
          path={guideHref(meta.slug)}
        />
      );

    case "price-game":
      return (
        <PriceGameTool
          cars={data.sale}
          currency={data.currency}
          locale={data.locale}
          distanceUnit={data.distanceUnit}
          path={guideHref(meta.slug)}
        />
      );

    case "cost-story": {
      const pair = storyCars(data.sale);
      const slim = (c: (typeof data.sale)[number]) => ({
        slug: c.slug,
        name: c.name,
        image: c.image,
        priceMinor: c.priceMinor,
      });
      return (
        <CostStoryTool
          steps={STORY_STEPS}
          endings={STORY_ENDINGS}
          pair={pair ? { cheap: slim(pair.cheap), pricier: slim(pair.pricier), gapMinor: pair.gapMinor } : null}
          currency={data.currency}
          locale={data.locale}
          path={guideHref(meta.slug)}
        />
      );
    }

    case "recall-quiz":
      return <RecallQuizTool facts={RECALL_FACTS} path={guideHref(meta.slug)} />;

    case "road-trip":
      return (
        <RoadTripTool
          places={TRIP_PLACES}
          cars={data.rent}
          currency={data.currency}
          locale={data.locale}
          path={guideHref(meta.slug)}
        />
      );
  }
}
