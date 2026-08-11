"use client";

import { useActionState, useState } from "react";
import { retireTier, type TierResult } from "@/lib/actions/tiers";
import { TierForm, type TierDefaults } from "./TierForm";
import { MARKETS, type MarketCode } from "@/lib/market";
import { formatMoney, money, toMajor, type CurrencyCode } from "@/lib/money";
import { pathToOwnership } from "@/lib/rentToOwn";

export interface TierRow {
  id: string;
  marketCode: MarketCode;
  name: string;
  tagline: string | null;
  position: number;
  dailyMinor: number;
  weeklyMinor: number | null;
  monthlyMinor: number | null;
  ownershipThresholdMinor: number | null;
  depositMinor: number;
  currency: CurrencyCode;
  isActive: boolean;
}

function toDefaults(t: TierRow): TierDefaults {
  const major = (m: number | null) =>
    m == null ? "" : toMajor(money(m, t.currency));
  return {
    id: t.id,
    marketCode: t.marketCode,
    name: t.name,
    tagline: t.tagline,
    position: t.position,
    daily: major(t.dailyMinor),
    weekly: major(t.weeklyMinor),
    monthly: major(t.monthlyMinor),
    ownershipThreshold: major(t.ownershipThresholdMinor),
    deposit: major(t.depositMinor),
    isActive: t.isActive,
  };
}

export function TierList({
  market,
  tiers,
}: {
  market: MarketCode;
  tiers: TierRow[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const cfg = MARKETS[market];

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">
          {cfg.name}{" "}
          <span className="text-sm font-normal text-[var(--text-muted)]">
            prices in {cfg.currency}
          </span>
        </h2>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-lg bg-[var(--cta-bg)] px-4 py-2 text-sm font-semibold text-[var(--cta-fg)]"
          >
            Add category
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
          <TierForm defaults={{ marketCode: market, position: tiers.length + 1 }} onDone={() => setAdding(false)} />
        </div>
      )}

      {tiers.length === 0 && !adding ? (
        <p className="rounded-xl border border-dashed border-[var(--border-default)] px-5 py-8 text-center text-sm text-[var(--text-muted)]">
          No categories yet. Rent to Own will not appear on the {cfg.name} site
          until at least one is added.
        </p>
      ) : (
        <div className="space-y-3">
          {tiers.map((t) =>
            editing === t.id ? (
              <div key={t.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
                <TierForm defaults={toDefaults(t)} onDone={() => setEditing(null)} />
              </div>
            ) : (
              <TierCard key={t.id} tier={t} onEdit={() => setEditing(t.id)} />
            ),
          )}
        </div>
      )}
    </section>
  );
}

function TierCard({ tier, onEdit }: { tier: TierRow; onEdit: () => void }) {
  const [, retire, retiring] = useActionState<TierResult | null, FormData>(
    retireTier,
    null,
  );
  const cfg = MARKETS[tier.marketCode];
  const fmt = (m: number) => formatMoney(money(m, tier.currency), cfg.locale);

  const path = pathToOwnership({
    slug: "row",
    name: tier.name,
    tagline: null,
    dailyMinor: tier.dailyMinor,
    weeklyMinor: tier.weeklyMinor,
    monthlyMinor: tier.monthlyMinor,
    ownershipThresholdMinor: tier.ownershipThresholdMinor,
    depositMinor: tier.depositMinor,
    currency: tier.currency,
  });

  return (
    <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <strong>{tier.name}</strong>
        {!tier.isActive && (
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            hidden
          </span>
        )}
        <span className="ml-auto text-sm text-[var(--text-secondary)] tabular-nums">
          {fmt(tier.dailyMinor)}/day
          {tier.weeklyMinor != null && <> · {fmt(tier.weeklyMinor)}/week</>}
        </span>
      </div>

      {tier.tagline && (
        <p className="mt-1 text-sm text-[var(--text-muted)]">{tier.tagline}</p>
      )}

      <p className="mt-3 text-sm text-[var(--text-secondary)]">
        {path ? (
          <>
            Owns it after{" "}
            <strong className="text-[var(--text-primary)]">{path.days} days</strong>{" "}
            of continuous hire, having paid{" "}
            <strong className="text-[var(--text-primary)]">
              {formatMoney(path.totalPaid, cfg.locale)}
            </strong>
            .
          </>
        ) : (
          <span className="text-[var(--text-muted)]">
            Hire only — no ownership threshold set.
          </span>
        )}
      </p>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm font-semibold"
        >
          Edit
        </button>
        {tier.isActive && (
          <form action={retire}>
            <input type="hidden" name="id" value={tier.id} />
            <input type="hidden" name="marketCode" value={tier.marketCode} />
            <button
              type="submit"
              disabled={retiring}
              className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm hover:border-[var(--danger)] hover:text-[var(--danger)] disabled:opacity-60"
            >
              Hide from site
            </button>
          </form>
        )}
      </div>
    </article>
  );
}
