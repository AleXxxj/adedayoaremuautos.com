"use client";

import { useState } from "react";
import { formatMoney, money } from "@/lib/money";
import { pathToOwnership, tariffFor, type OwnershipTier } from "@/lib/rentToOwn";
import { quoteRental } from "@/lib/rental";

/**
 * "When is it mine?"
 *
 * Runs the same functions the server uses, which run the same pricing the
 * booking engine charges with. A visitor changing the pattern here sees the
 * arithmetic they will actually be invoiced under — not a marketing estimate
 * that quietly disagrees with the paperwork.
 */
export function RentToOwnCalculator({
  tiers,
  locale,
}: {
  tiers: OwnershipTier[];
  locale: string;
}) {
  const owning = tiers.filter((t) => t.ownershipThresholdMinor != null);
  const [slug, setSlug] = useState(owning[0]?.slug ?? "");
  const [daysPerWeek, setDaysPerWeek] = useState(7);

  const tier = owning.find((t) => t.slug === slug) ?? owning[0];

  // No useMemo: this is a handful of integer operations, and the React
  // Compiler cannot preserve a manual memo that returns early — it would
  // silently skip optimising the whole component to keep it.
  const result = (() => {
    if (!tier) return null;
    const path = pathToOwnership(tier);
    if (!path) return null;

    const fmt = (minor: number) => formatMoney(money(minor, tier.currency), locale);

    // Continuous hire is the fastest route. Hiring fewer days a week costs the
    // same in total — the threshold is an amount, not a deadline — but takes
    // proportionally longer in calendar time, and loses the weekly rate once
    // the pattern drops below the point where a week is cheaper than the days.
    const tariff = tariffFor(tier);
    const perWeek =
      daysPerWeek >= 7
        ? quoteRental(tariff, 7).hireMinor
        : quoteRental(tariff, daysPerWeek).hireMinor;

    const weeksNeeded = Math.ceil(tier.ownershipThresholdMinor! / perWeek);
    const hireDays = weeksNeeded * daysPerWeek;
    const totalPaid = weeksNeeded * perWeek;

    const months = Math.floor(weeksNeeded / 4.345);
    const calendar =
      months >= 1
        ? `${months} month${months === 1 ? "" : "s"}`
        : `${weeksNeeded} week${weeksNeeded === 1 ? "" : "s"}`;

    return {
      fmt,
      perWeek: fmt(perWeek),
      weeksNeeded,
      hireDays,
      calendar,
      totalPaid: fmt(totalPaid),
      threshold: fmt(tier.ownershipThresholdMinor!),
      fastestDays: path.days,
      fastestTotal: fmt(path.totalPaid.minor),
    };
  })();

  if (!tier || !result) return null;

  return (
    <div className="rto-calc">
      <div className="rto-calc-inputs">
        {owning.length > 1 && (
          <div className="calc-group">
            <label htmlFor="rto-tier">Category</label>
            <select id="rto-tier" value={slug} onChange={(e) => setSlug(e.target.value)}>
              {owning.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="calc-group">
          <label htmlFor="rto-days">Days you would drive each week</label>
          <select
            id="rto-days"
            value={daysPerWeek}
            onChange={(e) => setDaysPerWeek(Number(e.target.value))}
          >
            {[7, 6, 5, 4, 3, 2].map((d) => (
              <option key={d} value={d}>
                {d} day{d === 1 ? "" : "s"} a week
                {d === 7 ? " — every day" : ""}
              </option>
            ))}
          </select>
        </div>

        <p className="rto-calc-note">
          The threshold is an amount, not a deadline. Driving fewer days costs
          no more in total — it simply takes longer to get there.
        </p>
      </div>

      <div className="rto-calc-result">
        <span className="rto-calc-label">It becomes yours in about</span>
        <span className="rto-calc-headline">{result.calendar}</span>

        <dl className="rto-calc-rows">
          <div>
            <dt>Rent per week</dt>
            <dd>{result.perWeek}</dd>
          </div>
          <div>
            <dt>Weeks of hire</dt>
            <dd>{result.weeksNeeded}</dd>
          </div>
          <div>
            <dt>Total rent to own</dt>
            <dd className="rto-calc-total">{result.totalPaid}</dd>
          </div>
        </dl>

        <p className="rto-calc-fine">
          Ownership transfers once {result.threshold} of rent has been paid. No
          separate purchase price, no balloon payment, and no obligation to
          continue — stop whenever you like and you have simply hired a car.
        </p>
      </div>
    </div>
  );
}
