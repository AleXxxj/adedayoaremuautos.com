"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useState } from "react";
import { formatMoney, money, type CurrencyCode } from "@/lib/money";
import { canResize } from "@/lib/photo";
import { carsLabel } from "./homeData";

export interface FinderCar {
  name: string;
  /** Compared with the budget: the sale price, or what a week of renting costs. */
  minor: number;
  /** As the lists show it: "$9,500", "$500 a week", "$85 a day". */
  price: string;
  photo: string | null;
  href: string;
}

export interface FinderSide {
  /** Every car's compared amount, in minor units, for the counts. */
  amounts: number[];
  /** Up to 30 cars to show, cheapest first. */
  cars: FinderCar[];
  /** Budgets to offer, in minor units, lowest first. */
  chips: number[];
  /** "/us/rentals", "/us/inventory" */
  href: string;
}

type Side = "rent" | "buy";

/**
 * "How much do you have?": pick a budget, see what it gets you.
 *
 * Rent compares a week's cost (the weekly rate, or seven days where a car has
 * none); Buy compares the price, and takes any amount typed in as well as the
 * chips. Every figure comes from the cars listed, passed in by the server.
 *
 * No monthly payments and no financing figures here: in the US a payment
 * amount in an ad brings the lending disclosures with it.
 */
export function BudgetFinder({
  currency,
  locale,
  rent,
  buy,
  start,
}: {
  currency: CurrencyCode;
  locale: string;
  rent: FinderSide | null;
  buy: FinderSide | null;
  start: Side;
}) {
  const sides = { rent, buy };
  const [side, setSide] = useState<Side>(sides[start] ? start : rent ? "rent" : "buy");
  // Each side keeps its own budget; both start on a middle chip.
  const middle = (s: FinderSide | null) => s?.chips[Math.floor((s.chips.length - 1) / 2)] ?? 0;
  const [budgets, setBudgets] = useState<Record<Side, number>>({
    rent: middle(rent),
    buy: middle(buy),
  });
  const id = useId();

  const current = sides[side];
  if (!current) return null;
  const budget = budgets[side];
  const setBudget = (minor: number) => setBudgets((b) => ({ ...b, [side]: minor }));

  const fmt = (minor: number, compact = false) =>
    formatMoney(money(minor, currency), locale, { compact });
  // Long naira amounts read better short on a chip: ₦15M, not ₦15,000,000.
  const chipLabel = (minor: number) => fmt(minor, minor >= 100_000_000);
  const symbol =
    new Intl.NumberFormat(locale, { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? "";

  const count = current.amounts.filter((a) => a <= budget).length;
  const fits = current.cars
    .filter((c) => c.minor <= budget)
    .sort((a, b) => b.minor - a.minor)
    .slice(0, 2);
  const lowest = Math.min(...current.amounts);
  const major = Math.round(budget / 100);

  return (
    <div className="bf">
      {rent && buy && (
        <div className="bf-toggle" role="group" aria-label="Rent or buy">
          {(["rent", "buy"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className="bf-toggle-btn"
              aria-pressed={side === s}
              onClick={() => setSide(s)}
            >
              {s === "rent" ? "Rent" : "Buy"}
            </button>
          ))}
        </div>
      )}

      <p className="bf-label" id={`${id}-label`}>
        {side === "rent" ? "I can pay each week" : "I have"}
      </p>

      {side === "buy" && (
        <div className="bf-amount">
          <span className="bf-currency" aria-hidden="true">
            {symbol}
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-labelledby={`${id}-label`}
            value={budget ? new Intl.NumberFormat(locale).format(major) : ""}
            placeholder="0"
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
              setBudget(digits ? Number(digits) * 100 : 0);
            }}
          />
        </div>
      )}

      <div className="bf-chips" role="group" aria-labelledby={`${id}-label`}>
        {current.chips.map((c) => (
          <button
            key={c}
            type="button"
            className="bf-chip"
            aria-pressed={budget === c}
            onClick={() => setBudget(c)}
          >
            {chipLabel(c)}
          </button>
        ))}
      </div>

      <div className="bf-result" aria-live="polite">
        {count > 0 ? (
          <p className="bf-count">
            <strong>{count}</strong> {count === 1 ? "car" : "cars"}
            {side === "rent"
              ? ` to rent for ${fmt(budget)} a week or less`
              : ` for ${fmt(budget)} or less`}
          </p>
        ) : (
          <p className="bf-count bf-count--none">
            {budget > 0 ? (
              side === "rent" ? (
                `No cars to rent for ${fmt(budget)} a week or less right now. Prices start at ${fmt(lowest)} a week.`
              ) : (
                `No cars for ${fmt(budget)} or less right now. Prices start at ${fmt(lowest)}.`
              )
            ) : (
              "Pick an amount to see what fits."
            )}
          </p>
        )}
      </div>

      {fits.length > 0 && (
        <ul className="bf-cars">
          {fits.map((c) => (
            <li key={c.href}>
              <Link href={c.href} className="bf-car">
                <span className="bf-car-photo">
                  {c.photo ? (
                    <Image
                      src={c.photo}
                      alt=""
                      fill
                      sizes="72px"
                      unoptimized={!canResize(c.photo)}
                    />
                  ) : (
                    <i className="fas fa-car" aria-hidden="true" />
                  )}
                </span>
                <span className="bf-car-text">
                  <span className="bf-car-name">{c.name}</span>
                  <span className="bf-car-price">{c.price}</span>
                </span>
                <i className="fas fa-chevron-right bf-car-go" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link
        className="bf-all"
        href={
          side === "buy" && count > 0 ? `${current.href}?price=0-${major}` : current.href
        }
      >
        {side === "rent"
          ? "See all cars for rent"
          : count > 0
            ? `See all ${count}`
            : `See all ${carsLabel(current.amounts.length)}`}
        <i className="fas fa-arrow-right" aria-hidden="true" />
      </Link>
    </div>
  );
}
