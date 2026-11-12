import { CHECKLIST } from "@/content/guides/checklist";
import { RTO_DISCLOSURE, owningTiers, rtoTierLine } from "@/content/guides/rentBuyOwn";
import { guideHref } from "@/content/guides";
import type { GuideData, GuideMeta } from "@/content/guides/types";
import { BUDGETS_MAJOR, buyFigures, lowestOwnTier } from "./guideMath";
import { BudgetTool } from "./tools/BudgetTool";
import { ChecklistTool } from "./tools/ChecklistTool";
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
  }
}
