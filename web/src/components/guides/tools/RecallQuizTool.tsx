"use client";

import { useState } from "react";
import Link from "next/link";
import { RECALL_RANKS, recallShareText, type RecallFact } from "@/content/guides/recallQuiz";
import { ShareButton } from "../ShareButton";
import { parseScoreHash, rankFor, scoreHash, trueFalseScore } from "../gameMath";
import { CountUp, FriendNote, Progress, parseBest, useHash, useStepFocus, useStored } from "./gameKit";

const KEY = "aaa:recall-or-not:best:v1";

/**
 * Eight statements about US safety recalls, one card at a time: tap True or
 * False, and the card turns to show the answer, one line of why, and a link
 * to NHTSA's page. Then a score, a rank and the way to the free car check.
 *
 * Every statement and every explanation is NHTSA's (content/guides/
 * recallQuiz.ts keeps the agency's own words beside each). The best score is
 * kept in this browser as two numbers; a shared link carries a score.
 */
export function RecallQuizTool({ facts, path }: { facts: RecallFact[]; path: string }) {
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [at, setAt] = useState(0);
  const [bestRaw, setBestRaw] = useStored(KEY);
  const { ref, moved } = useStepFocus<HTMLHeadingElement>(at);
  const friend = parseScoreHash(useHash());

  const score = trueFalseScore(facts, answers);
  const best = parseBest(bestRaw);
  const total = facts.length;

  function answer(id: string, value: boolean) {
    if (answers[id] !== undefined) return;
    const next = { ...answers, [id]: value };
    setAnswers(next);
    if (at === total - 1) {
      const final = trueFalseScore(facts, next);
      if (!best || final / total > best.score / best.of) setBestRaw(`${final}-${total}`);
    }
  }

  function go(next: number) {
    moved();
    setAt(next);
  }

  function again() {
    setAnswers({});
    go(0);
  }

  /* ── The score ── */
  if (at >= total) {
    const rank = rankFor(RECALL_RANKS, score, total);
    return (
      <div className="gt gm">
        <section className="gm-result" aria-labelledby="gm-recall-result">
          <p className="gm-result-eyebrow">Your score</p>
          <p className="gm-score">
            <strong>
              <CountUp value={score} format={String} />
            </strong>{" "}
            of {total}
          </p>
          <h3 className="gm-result-title" id="gm-recall-result" tabIndex={-1} ref={ref}>
            {rank.title}
          </h3>
          <p className="gm-result-line">{rank.line}</p>
          {friend && (
            <FriendNote>
              Your friend got{" "}
              <strong>
                {friend.score} of {friend.of}
              </strong>
              .{" "}
              {score / total > friend.score / friend.of
                ? "You win."
                : score / total === friend.score / friend.of
                  ? "A tie."
                  : "They win this one."}
            </FriendNote>
          )}
          {best && (
            <p className="gm-best">
              Your best: {best.score} of {best.of}
            </p>
          )}
          <p className="gd-sr" role="status" aria-live="polite">
            You got {score} of {total}: {rank.title}.
          </p>
          <Link href="/us/check" className="gd-btn gd-btn--primary">
            <i className="fas fa-clipboard-check" aria-hidden="true" />
            Check a car&rsquo;s recalls free
          </Link>
          <ShareButton
            title="Recall or Not?"
            text={recallShareText(score, total, rank)}
            path={`${path}${scoreHash(score, total)}`}
            label="Challenge a friend"
            withText
          />
          <button type="button" className="gm-back" onClick={again}>
            <i className="fas fa-rotate-left" aria-hidden="true" />
            Play again
          </button>
        </section>

        <div className="gm-cars">
          <p className="gm-cars-h">The answers</p>
          <ul className="gm-recap">
            {facts.map((f) => {
              const right = answers[f.id] === f.answer;
              return (
                <li key={f.id} data-chance={!right || undefined}>
                  <i className={`fas ${right ? "fa-check" : "fa-xmark"}`} aria-hidden="true" />
                  <span>
                    <span className="gm-recap-when">
                      {f.answer ? "True" : "False"}
                      <span className="gd-sr">{right ? " (you were right)" : " (you missed this one)"}</span>
                    </span>
                    {f.claim} <span className="gm-recap-why">{f.why}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  /* ── A card ── */
  const fact = facts[at];
  const picked = answers[fact.id];
  const done = picked !== undefined;
  const right = picked === fact.answer;
  const last = at === total - 1;

  return (
    <div className="gt gm">
      {friend && at === 0 && !done && (
        <FriendNote>
          Your friend got{" "}
          <strong>
            {friend.score} of {friend.of}
          </strong>
          . Beat it.
        </FriendNote>
      )}
      <Progress done={at + (done ? 1 : 0)} of={total} label={`Card ${at + 1} of ${total} · Score ${score}`} />

      <div className="gm-card" data-flipped={done || undefined}>
        <p className="gm-card-kicker">True or false?</p>
        <h3 className="gm-card-claim" tabIndex={-1} ref={ref}>
          {fact.claim}
        </h3>
        <div className="gm-reveal" role="status" aria-live="polite">
          {done && (
            <div className="gm-card-back">
              <p className="gm-card-verdict" data-right={right || undefined}>
                <i className={`fas ${right ? "fa-check" : "fa-xmark"}`} aria-hidden="true" />
                {right ? "Right." : "Not this time."} It is {fact.answer ? "true" : "false"}.
              </p>
              <p className="gm-card-why">{fact.why}</p>
              <a href={fact.url} className="gm-source" target="_blank" rel="noopener noreferrer">
                Source: NHTSA
                <span className="gd-sr"> (opens nhtsa.gov)</span>
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="gm-pair" role="group" aria-label={fact.claim}>
        {[true, false].map((value) => (
          <button
            key={String(value)}
            type="button"
            className="gm-choice"
            aria-pressed={picked === value}
            aria-disabled={done || undefined}
            data-off={(done && picked !== value) || undefined}
            onClick={() => answer(fact.id, value)}
          >
            <i className={`fas ${value ? "fa-check" : "fa-xmark"}`} aria-hidden="true" />
            {value ? "True" : "False"}
          </button>
        ))}
      </div>

      {done && (
        <div className="gm-nav">
          <button type="button" className="gd-btn gd-btn--primary" onClick={() => go(at + 1)}>
            {last ? "See my score" : "Next card"}
            <i className="fas fa-arrow-right" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
