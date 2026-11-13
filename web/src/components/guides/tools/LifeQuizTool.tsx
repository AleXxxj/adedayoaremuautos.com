"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMoney, money, type CurrencyCode } from "@/lib/money";
import { LIFE_PROFILES, lifeShareText } from "@/content/guides/lifeQuiz";
import type { GuideRentCar, GuideSaleCar } from "@/content/guides/types";
import { GuideCarCard } from "../GuideCarCard";
import { ShareButton } from "../ShareButton";
import {
  PROFILE_ORDER,
  gotHash,
  lifeBudgetMinor,
  lifeMatch,
  lifeMode,
  lifeResult,
  momentFor,
  parseGotHash,
  timeLeft,
  type LifeAnswers,
  type LifeQuestion,
} from "../gameMath";
import { FriendNote, Progress, buzz, useHash, useStepFocus } from "./gameKit";

/** Seconds a question takes: one line and one tap. */
const QUESTION_SECONDS = 6;

/** Cars shown under a result; the rest are a tap away on the lists. */
const SHOWN = 4;

/**
 * Six questions, one at a time, each answered with one tap. The last tap
 * shows a type of car, a few lines about the person, and the cars in stock
 * whose listing names that type, within the budget answered.
 *
 * Nothing is typed and nothing is sent: the answers live in this component
 * and are gone when the page is closed. A shared link carries only the name
 * of a result after the #, and a visitor who opens one is told what their
 * friend got.
 */
export function LifeQuizTool({
  questions,
  sale,
  rent,
  currency,
  locale,
  distanceUnit,
  path,
}: {
  questions: LifeQuestion[];
  sale: GuideSaleCar[];
  rent: GuideRentCar[];
  currency: CurrencyCode;
  locale: string;
  distanceUnit: "mi" | "km";
  path: string;
}) {
  const [answers, setAnswers] = useState<LifeAnswers>({});
  const [step, setStep] = useState(0);
  const { ref, moved } = useStepFocus<HTMLHeadingElement>(step);
  const friend = parseGotHash(useHash(), PROFILE_ORDER);

  const fmt = (minor: number) => formatMoney(money(minor, currency), locale);
  const num = (n: number) => new Intl.NumberFormat(locale).format(n);
  const result = lifeResult(questions, answers);
  const onResult = step >= questions.length && result != null;
  const q = questions[Math.min(step, questions.length - 1)];

  function go(next: number) {
    moved();
    setStep(next);
  }

  function pick(optionId: string) {
    setAnswers((a) => ({ ...a, [q.id]: optionId }));
    buzz();
    go(step + 1);
  }

  function restart() {
    setAnswers({});
    go(0);
  }

  if (!onResult) {
    return (
      <div className="gt gm">
        {friend && step === 0 && (
          <FriendNote>
            Your friend got <strong>{LIFE_PROFILES[friend].title}</strong>. What do you get?
          </FriendNote>
        )}
        <Progress
          done={step}
          of={questions.length}
          label={`Question ${step + 1} of ${questions.length} · ${timeLeft(questions.length - step, QUESTION_SECONDS)}`}
          moment={momentFor(step, questions.length)}
        />
        {/* Keyed by the question: each one is dealt in, its answers one after another. */}
        <h3 className="gm-ask gm-in" key={`ask-${q.id}`} tabIndex={-1} ref={ref}>
          {q.ask}
        </h3>
        <div className="gm-options gm-deal" key={q.id} role="group" aria-label={q.ask}>
          {q.options.map((o) => (
            <button
              key={o.id}
              type="button"
              className="gm-option"
              aria-pressed={answers[q.id] === o.id}
              onClick={() => pick(o.id)}
            >
              <span className="gm-option-icon">
                <i className={`fas ${o.icon}`} aria-hidden="true" />
              </span>
              <span>{o.label}</span>
            </button>
          ))}
        </div>
        {step > 0 && (
          <button type="button" className="gm-back" onClick={() => go(step - 1)}>
            <i className="fas fa-arrow-left" aria-hidden="true" />
            Back
          </button>
        )}
      </div>
    );
  }

  const profile = LIFE_PROFILES[result];
  const budgetMinor = lifeBudgetMinor(questions, answers);
  const mode = lifeMode(questions, answers);
  const match = lifeMatch(profile.bodies, sale, rent, budgetMinor);
  const budgetLabel = questions.flatMap((x) => x.options).find((o) => o.id === answers.budget)?.label ?? null;
  const rentFirst = mode === "rent";

  const saleBlock = (
    <div className="gm-cars" key="sale">
      <p className="gm-cars-h">
        {match.sale.length === 0
          ? "For sale"
          : match.overBudget
            ? "The closest for sale. Over your budget"
            : `For sale that fit${budgetMinor != null ? ` at ${fmt(budgetMinor)} or less` : ""}`}
      </p>
      {match.sale.length === 0 ? (
        <p className="gt-notice">
          <i className="fas fa-circle-info" aria-hidden="true" />
          No car of this type is for sale today. Stock changes often, so ask us what is coming in.
        </p>
      ) : (
        <ul className="gd-cars">
          {match.sale.slice(0, SHOWN).map((c) => (
            <GuideCarCard
              key={c.slug}
              href={`/us/inventory/${c.slug}`}
              image={c.image}
              name={c.name}
              price={fmt(c.priceMinor)}
              meta={
                [c.mileage != null && `${num(c.mileage)} ${distanceUnit}`, c.transmission].filter(Boolean).join(" · ") ||
                null
              }
              badge={c.pending ? "Sale pending" : null}
            />
          ))}
        </ul>
      )}
      <Link href="/us/inventory" className="gt-all">
        See all cars for sale
        <i className="fas fa-arrow-right" aria-hidden="true" />
      </Link>
    </div>
  );

  const rentBlock = (
    <div className="gm-cars" key="rent">
      <p className="gm-cars-h">To rent that fit</p>
      {match.rent.length === 0 ? (
        <p className="gt-notice">
          <i className="fas fa-circle-info" aria-hidden="true" />
          No car of this type is in the rental fleet today.
        </p>
      ) : (
        <ul className="gd-cars">
          {match.rent.slice(0, SHOWN).map((c) => {
            const weekly = c.tariff.weeklyMinor;
            return (
              <GuideCarCard
                key={c.slug}
                href={`/us/rentals/${c.slug}`}
                image={c.image}
                name={c.name}
                price={fmt(weekly ?? c.tariff.dailyMinor)}
                unit={weekly != null ? "a week" : "a day"}
                meta={weekly != null ? `or ${fmt(c.tariff.dailyMinor)} a day` : null}
              />
            );
          })}
        </ul>
      )}
      <Link href="/us/rentals" className="gt-all">
        See all cars to rent
        <i className="fas fa-arrow-right" aria-hidden="true" />
      </Link>
    </div>
  );

  return (
    <div className="gt gm">
      <section className="gm-result" aria-labelledby="gm-life-result">
        <p className="gm-result-eyebrow">You got</p>
        <span className="gm-result-icon">
          <i className={`fas ${profile.icon}`} aria-hidden="true" />
        </span>
        <h3 className="gm-result-title" id="gm-life-result" tabIndex={-1} ref={ref}>
          {profile.title}
        </h3>
        {profile.lines.map((line) => (
          <p key={line} className="gm-result-line">
            {line}
          </p>
        ))}
        <dl className="gm-tags">
          <div>
            <dt>Type</dt>
            <dd>{profile.bodyLabel}</dd>
          </div>
          {budgetLabel && (
            <div>
              <dt>Budget</dt>
              <dd>{budgetLabel}</dd>
            </div>
          )}
        </dl>
        {friend && (
          <FriendNote>
            {friend === result ? (
              <>Same as your friend. Great minds.</>
            ) : (
              <>
                Your friend got <strong>{LIFE_PROFILES[friend].title}</strong>.
              </>
            )}
          </FriendNote>
        )}
        <p className="gd-sr" role="status" aria-live="polite">
          Your result: {profile.title}.
        </p>
        <ShareButton
          title="What car fits your life?"
          text={lifeShareText(profile)}
          path={`${path}${gotHash(profile.id)}`}
          label="Send my result to a friend"
          primary
          withText
        />
      </section>

      {rentFirst ? [rentBlock, saleBlock] : [saleBlock, rentBlock]}

      {mode === "rto" && (
        <Link href="/us/rent-to-own" className="gd-btn">
          <i className="fas fa-handshake" aria-hidden="true" />
          See how rent to own works
        </Link>
      )}
      {mode === "unsure" && (
        <Link href="/us/guides/rent-vs-buy-vs-rent-to-own" className="gd-btn">
          <i className="fas fa-scale-balanced" aria-hidden="true" />
          Rent, buy or rent to own?
        </Link>
      )}
      <button type="button" className="gm-back" onClick={restart}>
        <i className="fas fa-rotate-left" aria-hidden="true" />
        Take the quiz again
      </button>
    </div>
  );
}
