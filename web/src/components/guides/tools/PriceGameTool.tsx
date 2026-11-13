"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatMoney, money, type CurrencyCode } from "@/lib/money";
import { canResize } from "@/lib/photo";
import { PRICE_RANKS, priceShareText } from "@/content/guides/priceGame";
import type { GuideSaleCar } from "@/content/guides/types";
import { GuideCarCard } from "../GuideCarCard";
import { ShareButton } from "../ShareButton";
import { Gauge } from "../motion/Gauge";
import { gaugeAngle, gaugeWord } from "../motion/sceneMath";
import { momentFor, parseScoreHash, priceRounds, priceScore, rankFor, scoreHash, streak, timeLeft } from "../gameMath";
import { CountUp, FriendNote, Progress, buzz, parseBest, useHash, useStepFocus, useStored } from "./gameKit";

/** Seconds a round takes: look at the car, tap a price, see the answer. */
const ROUND_SECONDS = 10;

const KEY = "aaa:guess-the-price:best:v1";

/** The first game is the same for everyone, so the server and the browser draw the same page. */
const FIRST_SEED = 20261113;

/**
 * Guess the price: a real car from stock, four prices, one tap. Five rounds
 * when stock allows, then a score, a rank and a dare to send to a friend.
 *
 * The real price is the listing's; the other three are worked out from it
 * (gameMath.priceOptions). After a tap the real price counts up, the right
 * button is marked, and the result is announced politely. "Play again" deals
 * a new game from a new seed.
 *
 * The best score is kept in this browser as two numbers ("4-5"). A shared
 * link carries a score after the #, nothing else, and whoever opens it is
 * told the score to beat.
 */
export function PriceGameTool({
  cars,
  currency,
  locale,
  distanceUnit,
  path,
}: {
  /** Cars for sale with a price. The game picks from the ones with a photo that are not pending. */
  cars: GuideSaleCar[];
  currency: CurrencyCode;
  locale: string;
  distanceUnit: "mi" | "km";
  path: string;
}) {
  const [seed, setSeed] = useState(FIRST_SEED);
  const rounds = useMemo(() => priceRounds(cars, seed), [cars, seed]);
  const [guesses, setGuesses] = useState<number[]>([]);
  const [at, setAt] = useState(0);
  const [bestRaw, setBestRaw] = useStored(KEY);
  const { ref, moved } = useStepFocus<HTMLHeadingElement>(`${seed}-${at}`);
  const friend = parseScoreHash(useHash());

  const fmt = (minor: number) => formatMoney(money(minor, currency), locale);
  const num = (n: number) => new Intl.NumberFormat(locale).format(n);
  const bySlug = (slug: string) => cars.find((c) => c.slug === slug)!;
  const answers = rounds.map((r) => bySlug(r.slug).priceMinor);
  const score = priceScore(answers, guesses);
  const best = parseBest(bestRaw);

  if (rounds.length === 0) {
    return (
      <div className="gt gm">
        <p className="gt-notice">
          <i className="fas fa-circle-info" aria-hidden="true" />
          No cars are listed with a photo and a price today, so there is nothing to guess. Check back soon.
        </p>
        <Link href="/us/inventory" className="gt-all">
          See cars for sale
          <i className="fas fa-arrow-right" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  function guess(minor: number) {
    if (guesses[at] != null) return;
    const next = [...guesses];
    next[at] = minor;
    setGuesses(next);
    buzz();
    // The last guess ends the game: keep the score if it is the best yet.
    if (at === rounds.length - 1) {
      const final = priceScore(answers, next);
      if (!best || final / rounds.length > best.score / best.of) setBestRaw(`${final}-${rounds.length}`);
    }
  }

  function next() {
    moved();
    setAt(at + 1);
  }

  function again() {
    moved();
    setGuesses([]);
    setAt(0);
    setSeed(Date.now() % 2147483647);
  }

  /* ── The score ── */
  if (at >= rounds.length) {
    const rank = rankFor(PRICE_RANKS, score, rounds.length);
    return (
      <div className="gt gm">
        <section className="gm-result" aria-labelledby="gm-price-result">
          <p className="gm-result-eyebrow">Your score</p>
          <p className="gm-score">
            <strong>
              <CountUp value={score} format={String} />
            </strong>{" "}
            of {rounds.length}
          </p>
          <h3 className="gm-result-title" id="gm-price-result" tabIndex={-1} ref={ref}>
            {rank.title}
          </h3>
          <p className="gm-result-line">{rank.line}</p>
          {friend && (
            <FriendNote>
              Your friend scored{" "}
              <strong>
                {friend.score} of {friend.of}
              </strong>
              .{" "}
              {score / rounds.length > friend.score / friend.of
                ? "You win."
                : score / rounds.length === friend.score / friend.of
                  ? "A tie. Play again to settle it."
                  : "They win this one."}
            </FriendNote>
          )}
          {best && (
            <p className="gm-best">
              Your best: {best.score} of {best.of}
            </p>
          )}
          <p className="gd-sr" role="status" aria-live="polite">
            You scored {score} of {rounds.length}: {rank.title}.
          </p>
          <ShareButton
            title="Guess the Price"
            text={priceShareText(score, rounds.length, rank)}
            path={`${path}${scoreHash(score, rounds.length)}`}
            label="Challenge a friend"
            primary
            withText
          />
          <button type="button" className="gd-btn" onClick={again}>
            <i className="fas fa-rotate-left" aria-hidden="true" />
            Play again
          </button>
        </section>

        <div className="gm-cars">
          <p className="gm-cars-h">The cars you saw</p>
          <ul className="gd-cars">
            {rounds.map((r, i) => {
              const c = bySlug(r.slug);
              return (
                <GuideCarCard
                  key={r.slug}
                  href={`/us/inventory/${c.slug}`}
                  image={c.image}
                  name={c.name}
                  price={fmt(c.priceMinor)}
                  meta={guesses[i] === c.priceMinor ? "You got it" : `You said ${fmt(guesses[i])}`}
                />
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  /* ── A round ── */
  const round = rounds[at];
  const car = bySlug(round.slug);
  const picked = guesses[at];
  const done = picked != null;
  const right = picked === car.priceMinor;
  const last = at === rounds.length - 1;
  const marks = guesses.filter((g) => g != null).map((g, i) => g === answers[i]);
  const moment = done ? momentFor(marks.length, rounds.length, streak(marks)) : null;
  const left = timeLeft(rounds.length - at - (done ? 1 : 0), ROUND_SECONDS);

  return (
    <div className="gt gm">
      {friend && at === 0 && !done && (
        <FriendNote>
          Your friend scored{" "}
          <strong>
            {friend.score} of {friend.of}
          </strong>
          . Beat it.
        </FriendNote>
      )}
      <Progress
        done={at + (done ? 1 : 0)}
        of={rounds.length}
        label={`Round ${at + 1} of ${rounds.length} · Score ${score}${left ? ` · ${left}` : ""}`}
        moment={moment}
      />

      {/* Keyed by the car: each round's photo arrives, it doesn't blink in. */}
      <div className="gm-photo gm-photo--in" key={car.slug}>
        {car.image && (
          <Image
            src={car.image}
            alt=""
            fill
            sizes="(min-width: 800px) 720px, 100vw"
            unoptimized={!canResize(car.image)}
            loading={at === 0 ? "eager" : "lazy"}
          />
        )}
      </div>
      <h3 className="gm-ask gm-in" key={`name-${car.slug}`} tabIndex={-1} ref={ref}>
        {car.name}
      </h3>
      <p className="gm-sub">
        {[car.mileage != null && `${num(car.mileage)} ${distanceUnit}`, car.transmission].filter(Boolean).join(" · ") ||
          "Miles not listed"}
        {" · What is the price?"}
      </p>

      <div className="gm-prices gm-in" key={`prices-${car.slug}`} role="group" aria-label={`Price of the ${car.name}`}>
        {round.optionsMinor.map((minor) => {
          const isAnswer = minor === car.priceMinor;
          const state = !done ? undefined : isAnswer ? "right" : minor === picked ? "wrong" : "off";
          return (
            <button
              key={minor}
              type="button"
              className="gm-price"
              data-state={state}
              aria-disabled={done || undefined}
              aria-pressed={minor === picked}
              onClick={() => guess(minor)}
            >
              {state === "right" && <i className="fas fa-check" aria-hidden="true" />}
              {state === "wrong" && <i className="fas fa-xmark" aria-hidden="true" />}
              {fmt(minor)}
              {state === "right" && <span className="gd-sr"> (the price)</span>}
            </button>
          );
        })}
      </div>

      <div className="gm-reveal gm-reveal--gauge" role="status" aria-live="polite">
        {done && (
          <>
            {/* The needle rests where the guess was: under the price, on it, or over it. */}
            <Gauge angle={gaugeAngle(picked, car.priceMinor)} />
            <p className="gm-reveal-line" data-right={right || undefined}>
              <span>
                {right
                  ? "Right."
                  : `${fmt(Math.abs(picked - car.priceMinor))} too ${gaugeWord(picked, car.priceMinor)}.`}{" "}
                It is listed at
              </span>{" "}
              <strong>
                {/* Counted in whole dollars, so no cents flicker on the way up. */}
                <CountUp value={car.priceMinor / 100} format={(n) => fmt(Math.round(n * 100))} />
              </strong>
            </p>
          </>
        )}
      </div>

      {done && (
        <div className="gm-nav">
          <button type="button" className="gd-btn gd-btn--primary" onClick={next}>
            {last ? "See my score" : "Next car"}
            <i className="fas fa-arrow-right" aria-hidden="true" />
          </button>
          <Link href={`/us/inventory/${car.slug}`} className="gd-btn">
            See this car
          </Link>
        </div>
      )}
      {!last && marks.length > 0 && (
        <button type="button" className="gm-skip" onClick={() => { moved(); setAt(rounds.length); }}>
          Stop here and see my score
        </button>
      )}
    </div>
  );
}
