"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatMoney, money, type CurrencyCode } from "@/lib/money";
import { canResize } from "@/lib/photo";
import { STORY_VERDICT, storyShareText } from "@/content/guides/cheapCar";
import { ShareButton } from "../ShareButton";
import {
  gotHash,
  parseGotHash,
  storyChances,
  storyEnding,
  type StoryEnding,
  type StoryPicks,
  type StoryStep,
} from "../gameMath";
import { signalScene } from "../motion/sceneKit";
import { FriendNote, Progress, useCarry, useHash, useStepFocus } from "./gameKit";

interface StoryCar {
  slug: string;
  name: string;
  image: string | null;
  priceMinor: number;
}

type Side = "cheap" | "pricier";

/**
 * A story the reader steers: pick the cheaper car or the pricier one (two
 * real cars from stock), then make one choice at each of seven moments in a
 * year. Each choice shows its consequence at once. The ending depends on how
 * much was left to chance, never on the price.
 *
 * Every consequence is a general truth about cars (see content/guides/
 * cheapCar.ts): no repair bills, no odds. The only money shown is the two
 * listed prices and the difference between them.
 *
 * Nothing is typed, stored or sent. A shared link carries the ending's name.
 */
export function CostStoryTool({
  steps,
  endings,
  pair,
  currency,
  locale,
  path,
}: {
  steps: StoryStep[];
  endings: StoryEnding[];
  /** The two cars from stock, or null when stock has no two prices to set against each other. */
  pair: { cheap: StoryCar; pricier: StoryCar; gapMinor: number } | null;
  currency: CurrencyCode;
  locale: string;
  path: string;
}) {
  const [side, setSide] = useState<Side | null>(null);
  const [picks, setPicks] = useState<StoryPicks>({});
  // -1 is choosing the car; steps.length is the ending.
  const [at, setAt] = useState(-1);
  const { ref, moved } = useStepFocus<HTMLHeadingElement>(at);
  // The chosen car's photo travels from the pair to the corner of the story.
  const { ref: carried, take } = useCarry<HTMLSpanElement>(side);
  // The road at the top of the page follows the story.
  useEffect(() => signalScene({ tool: "cost-story", side, at }), [side, at]);
  const friend = parseGotHash(
    useHash(),
    endings.map((e) => e.id),
  );
  const friendEnding = endings.find((e) => e.id === friend) ?? null;

  const fmt = (minor: number) => formatMoney(money(minor, currency), locale);
  const chances = storyChances(steps, picks);

  function go(next: number) {
    moved();
    setAt(next);
  }

  function choose(s: Side, from: Element | null) {
    take(from);
    setSide(s);
    go(0);
  }

  function restart() {
    setSide(null);
    setPicks({});
    go(-1);
  }

  /* ── Pick a car ── */
  if (at < 0 || side == null) {
    const sides: { id: Side; label: string; car: StoryCar | null }[] = [
      { id: "cheap", label: "The cheaper car", car: pair?.cheap ?? null },
      { id: "pricier", label: "The pricier car", car: pair?.pricier ?? null },
    ];
    return (
      <div className="gt gm">
        {friendEnding && (
          <FriendNote>
            Your friend ended as <strong>{friendEnding.title}</strong>. How will your year go?
          </FriendNote>
        )}
        <Progress done={0} of={steps.length + 1} label="Day one" />
        <h3 className="gm-ask" tabIndex={-1} ref={ref}>
          Which one do you buy?
        </h3>
        {pair && (
          <p className="gm-sub">
            Two real cars from our lot today. The gap is {fmt(pair.gapMinor)}.
          </p>
        )}
        <div className="gm-duel" role="group" aria-label="Which one do you buy?">
          {sides.map((s) => (
            <button key={s.id} type="button" className="gm-duel-card" onClick={(e) => choose(s.id, e.currentTarget.querySelector(".gm-duel-photo"))}>
              {s.car?.image && (
                <span className="gm-duel-photo">
                  <Image
                    src={s.car.image}
                    alt=""
                    fill
                    sizes="(min-width: 800px) 350px, 50vw"
                    unoptimized={!canResize(s.car.image)}
                  />
                </span>
              )}
              <span className="gm-duel-body">
                <span className="gm-duel-label">{s.label}</span>
                {s.car && (
                  <>
                    <strong className="gm-duel-price">{fmt(s.car.priceMinor)}</strong>
                    <span className="gm-duel-name">{s.car.name}</span>
                  </>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ── The ending ── */
  if (at >= steps.length) {
    const ending = storyEnding(endings, chances) ?? endings[endings.length - 1];
    const car = pair ? pair[side] : null;
    return (
      <div className="gt gm">
        <section className="gm-result" aria-labelledby="gm-story-result">
          <p className="gm-result-eyebrow">One year later</p>
          <h3 className="gm-result-title" id="gm-story-result" tabIndex={-1} ref={ref}>
            {ending.title}
          </h3>
          <p className="gm-score gm-score--plain">
            <strong>{steps.length - chances}</strong> checked · <strong>{chances}</strong> left to chance
          </p>
          <p className="gm-result-line">{ending.line}</p>
          {car && pair && (
            <p className="gm-result-line">
              You paid <strong className="gm-money">{fmt(car.priceMinor)}</strong> for the {car.name}:{" "}
              {side === "cheap"
                ? `${fmt(pair.gapMinor)} less than the other car on day one.`
                : `${fmt(pair.gapMinor)} more than the other car on day one.`}
            </p>
          )}
          <p className="gm-verdict">{STORY_VERDICT}</p>
          {friendEnding && (
            <FriendNote>
              {friendEnding.id === ending.id ? (
                <>Same ending as your friend.</>
              ) : (
                <>
                  Your friend ended as <strong>{friendEnding.title}</strong>.
                </>
              )}
            </FriendNote>
          )}
          <p className="gd-sr" role="status" aria-live="polite">
            Your ending: {ending.title}. {steps.length - chances} checked, {chances} left to chance.
          </p>
          <ShareButton
            title="Cheap car or pricier car: which really costs more?"
            text={storyShareText(ending)}
            path={`${path}${gotHash(ending.id)}`}
            label="Send this to a friend"
            primary
            withText
          />
        </section>

        <div className="gm-cars">
          <p className="gm-cars-h">Your year</p>
          <ul className="gm-recap">
            {steps.map((s) => {
              const c = s.choices.find((x) => x.id === picks[s.id]);
              return (
                <li key={s.id} data-chance={c?.chance || undefined}>
                  <i className={`fas ${c?.chance ? "fa-triangle-exclamation" : "fa-check"}`} aria-hidden="true" />
                  <span>
                    <span className="gm-recap-when">{s.when}</span>
                    {s.ask} <strong>{c?.label}</strong>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="gm-nav">
          <Link href="/us/check" className="gd-btn">
            <i className="fas fa-clipboard-check" aria-hidden="true" />
            Check a real car&rsquo;s recalls
          </Link>
          <Link href="/us/guides/used-car-checklist-free-vin-check" className="gd-btn">
            <i className="fas fa-list-check" aria-hidden="true" />
            Open the 10-minute checklist
          </Link>
        </div>
        <button type="button" className="gm-back" onClick={restart}>
          <i className="fas fa-rotate-left" aria-hidden="true" />
          Live the year again
        </button>
      </div>
    );
  }

  /* ── A moment in the year ── */
  const step = steps[at];
  const chosen = step.choices.find((c) => c.id === picks[step.id]) ?? null;
  const last = at === steps.length - 1;

  const mine = pair ? pair[side] : null;

  return (
    <div className="gt gm">
      <Progress
        done={at + 1 + (chosen ? 1 : 0)}
        of={steps.length + 1}
        label={`Choice ${at + 1} of ${steps.length} · ${chances} left to chance`}
      />
      {mine && (
        <p className="gm-mycar">
          {mine.image && (
            <span className="gm-mycar-photo" ref={carried}>
              <Image src={mine.image} alt="" fill sizes="96px" unoptimized={!canResize(mine.image)} />
            </span>
          )}
          <span>
            Your car
            <strong>{mine.name}</strong>
          </span>
        </p>
      )}
      <p className="gm-when gm-in" key={`when-${step.id}`}>
        <i className={`fas ${step.icon}`} aria-hidden="true" />
        {step.when}
      </p>
      <h3 className="gm-ask gm-in" key={`ask-${step.id}`} tabIndex={-1} ref={ref}>
        {step.ask}
      </h3>
      <div className="gm-pair gm-in" key={`pair-${step.id}`} role="group" aria-label={step.ask}>
        {step.choices.map((c) => (
          <button
            key={c.id}
            type="button"
            className="gm-choice"
            aria-pressed={chosen?.id === c.id}
            aria-disabled={chosen != null || undefined}
            data-off={(chosen != null && chosen.id !== c.id) || undefined}
            onClick={() => {
              if (!chosen) setPicks((p) => ({ ...p, [step.id]: c.id }));
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="gm-reveal" role="status" aria-live="polite">
        {chosen && (
          <p className="gm-outcome" data-chance={chosen.chance || undefined}>
            <i className={`fas ${chosen.chance ? "fa-triangle-exclamation" : "fa-check"}`} aria-hidden="true" />
            <span>
              {chosen.result}
              {step.source && (
                <>
                  {" "}
                  <a href={step.source.url} className="gm-source" target="_blank" rel="noopener noreferrer">
                    Source: {step.source.label}
                  </a>
                </>
              )}
            </span>
          </p>
        )}
      </div>

      {chosen && (
        <div className="gm-nav">
          <button type="button" className="gd-btn gd-btn--primary" onClick={() => go(at + 1)}>
            {last ? "See how the year ends" : `Next: ${steps[at + 1].when}`}
            <i className="fas fa-arrow-right" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
