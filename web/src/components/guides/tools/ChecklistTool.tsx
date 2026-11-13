"use client";

import { memo, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { canResize } from "@/lib/photo";
import type { CheckGroup } from "@/content/guides/checklist";
import {
  areaProgress,
  checklistText,
  minutesLeft,
  nextStop,
  tally,
  walkMoment,
  walkResult,
  walkStops,
  type Answer,
} from "../guideMath";
import { SPOT_AT } from "../motion/sceneData";
import { CountUp, Moment, buzz, useStepFocus } from "./gameKit";

/**
 * The used-car checklist as a walk around the car. The car's photo stays on
 * screen with the part being checked lit up; under it is ONE check at a
 * time, a card with two big answers, Good and Problem. A tap is confirmed on
 * the card and the walk moves to the next check by itself. A part that is
 * finished gets its seal on the photo. Nothing is typed.
 *
 * It can be left at any point: "Stop here" shows a result for what was
 * checked, and that result is a result, not a scolding. What is left is
 * shown as minutes, not as a pile.
 *
 * The tally is announced politely as it changes; each new check takes focus
 * on its heading, so a screen reader starts reading there. Everything is a
 * real button: the parts of the car, Back, Skip and Stop.
 *
 * WHERE THE ANSWERS GO: nowhere. They are kept in this browser's
 * localStorage (check ids and "good"/"problem", nothing else), so a visitor
 * who walks around a car, locks the phone and comes back still has them.
 * Sharing hands the result's text to the phone's share sheet; saving draws
 * it on a canvas and downloads a PNG. No request is made either way, and the
 * result holds no car, no VIN and no name.
 */

const KEY = "aaa:used-car-checklist:v1";

/* ── The answers, as an external store (localStorage, or memory without it) ─ */

let memory = "";
const listeners = new Set<() => void>();

function readRaw(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    // Private mode, or storage switched off: keep them for this visit.
    return memory;
  }
}

function writeRaw(raw: string) {
  memory = raw;
  try {
    if (raw) window.localStorage.setItem(KEY, raw);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Kept in memory above.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Only known checks with a known answer: the stored text is never trusted. */
function parse(raw: string, ids: Set<string>): Record<string, Answer> {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return {};
    const out: Record<string, Answer> = {};
    for (const [id, value] of Object.entries(data)) {
      if (ids.has(id) && (value === "good" || value === "problem")) out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/* ── The result as a picture ───────────────────────────────────────────── */

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** The site's colors, read from the page so the picture matches it. */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws the score and the checks marked as problems. Returns the canvas. */
function drawResult(
  score: { good: number; problems: number; left: number },
  problems: string[],
  site: string,
): HTMLCanvasElement {
  const W = 1080;
  const PAD = 72;
  const MAX = 10;
  const canvas = document.createElement("canvas");
  const probe = canvas.getContext("2d")!;
  probe.font = `500 34px ${FONT}`;
  const shown = problems.slice(0, MAX).map((p) => wrap(probe, p, W - PAD * 2 - 40));
  const listHeight = shown.reduce((h, lines) => h + lines.length * 46 + 18, 0);
  const more = problems.length - shown.length;
  const H = 560 + (problems.length ? 90 + listHeight : 70) + (more > 0 ? 56 : 0) + 120;
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d")!;
  const bg = token("--surface-0", "#070C0A");
  const card = token("--surface-1", "#141E19");
  const line = token("--border-default", "#33443B");
  const white = "#F1F6F3";
  const silver = "#BDCCC4";
  const amber = token("--warning", "#F5B324");

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = silver;
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText("ADEDAYO AREMU AUTOS", PAD, 110);
  ctx.fillStyle = white;
  ctx.font = `800 76px ${FONT}`;
  ctx.fillText("Used car checklist", PAD, 210);

  // Three tiles: good, to ask about, not checked.
  const tiles: [number, string, string][] = [
    [score.good, "good", white],
    [score.problems, "to ask about", score.problems ? amber : white],
    [score.left, "not checked", white],
  ];
  const gap = 24;
  const tileW = (W - PAD * 2 - gap * 2) / 3;
  tiles.forEach(([n, label, color], i) => {
    const x = PAD + i * (tileW + gap);
    ctx.fillStyle = card;
    ctx.beginPath();
    // Square corners on a browser too old for roundRect.
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, 270, tileW, 220, 28);
    else ctx.rect(x, 270, tileW, 220);
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `800 104px ${FONT}`;
    ctx.fillText(String(n), x + 32, 400);
    ctx.fillStyle = silver;
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(label, x + 32, 456);
  });

  let y = 580;
  ctx.fillStyle = white;
  ctx.font = `800 44px ${FONT}`;
  if (problems.length === 0) {
    ctx.fillText(score.left ? "No problems marked so far." : "No problems marked.", PAD, y);
    y += 70;
  } else {
    ctx.fillText("Ask the seller about", PAD, y);
    y += 74;
    for (const lines of shown) {
      ctx.fillStyle = amber;
      ctx.beginPath();
      ctx.arc(PAD + 10, y - 12, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = white;
      ctx.font = `500 34px ${FONT}`;
      for (const text of lines) {
        ctx.fillText(text, PAD + 40, y);
        y += 46;
      }
      y += 18;
    }
    if (more > 0) {
      ctx.fillStyle = silver;
      ctx.font = `500 32px ${FONT}`;
      ctx.fillText(`and ${more} more`, PAD + 40, y);
      y += 56;
    }
  }

  ctx.fillStyle = silver;
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText(site, PAD, H - 64);
  return canvas;
}

/* ── The deck's unseen cards ───────────────────────────────────────────── */

/**
 * Every check's words, hidden, stacked where the card in view sits, so the
 * card is always as tall as the longest check. Drawn once: the checklist
 * doesn't change, so an answer never draws these again.
 */
const Ghosts = memo(function Ghosts({ groups }: { groups: CheckGroup[] }) {
  return (
    <>
      {groups.map((g) =>
        g.checks.map((c) => (
          <div className="ck-card ck-card--ghost" aria-hidden="true" key={c.id}>
            <p className="ck-kicker">{g.title}</p>
            <p className="ck-label">{c.label}</p>
            <p className="ck-hint">
              {c.hint} {c.link?.label}
            </p>
          </div>
        )),
      )}
    </>
  );
});

/* ── The tool ──────────────────────────────────────────────────────────── */

/** How long a tap's answer stays on the card before the walk moves on. */
const CONFIRM_MS = 560;

export function ChecklistTool({
  groups,
  path,
  photo,
}: {
  groups: CheckGroup[];
  path: string;
  /** A real car from stock to walk around; the marks sit on a plain panel without one. */
  photo: string | null;
}) {
  const stops = walkStops(groups);
  const ids = stops.map((s) => s.id);
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const answers = parse(raw, new Set(ids));
  const score = tally(ids, answers);
  const areas = areaProgress(groups, answers);

  // Where the walk is: a check (0 to stops.length - 1) or the result (stops.length).
  // Until the reader moves, it is the first check with no answer, so a visitor
  // who comes back to a half-done walk is put where they left off.
  const [pos, setPos] = useState<number | null>(null);
  const at = pos ?? nextStop(stops, answers, -1);
  const [moment, setMoment] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [manual, setManual] = useState("");
  const { ref: heading, moved } = useStepFocus<HTMLHeadingElement>(at);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function go(next: number) {
    window.clearTimeout(timer.current);
    moved();
    setNote("");
    setManual("");
    setPos(next);
  }

  function answer(id: string, value: Answer) {
    const next = { ...answers, [id]: value };
    // Hold the walk on this card while the answer shows, then move on.
    setPos(at);
    setMoment(walkMoment(groups, answers, next));
    writeRaw(JSON.stringify(next));
    buzz();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => go(nextStop(stops, next, at)), CONFIRM_MS);
  }

  const onResult = at >= stops.length;
  const stop = onResult ? null : stops[at];
  const group = stop ? groups[stop.part] : null;
  const check = stop && group ? group.checks[stop.index] : null;
  const problems = groups.flatMap((g) =>
    g.checks.filter((c) => answers[c.id] === "problem").map((c) => ({ part: g.title, label: c.label })),
  );
  const left = minutesLeft(score.left, score.total);
  const result = walkResult(groups, answers);

  const pageUrl = () => new URL(path, window.location.origin).toString();
  const resultText = () => checklistText(groups, answers, pageUrl());

  async function copy() {
    const text = resultText();
    try {
      await navigator.clipboard.writeText(text);
      setManual("");
      setNote("Copied. Paste it in a text or a note.");
    } catch {
      setManual(text);
      setNote("Copy your result from the box below.");
    }
  }

  async function share() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Used car checklist", text: resultText() });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    await copy();
  }

  function saveImage() {
    try {
      const canvas = drawResult(
        score,
        problems.map((p) => `${p.part}: ${p.label}`),
        new URL(path, window.location.origin).host + path,
      );
      canvas.toBlob((blob) => {
        if (!blob) {
          setNote("Couldn't make the picture. Use Copy as text.");
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "used-car-checklist.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setNote("Picture saved. Look in your downloads or photos.");
      }, "image/png");
    } catch {
      setNote("Couldn't make the picture. Use Copy as text.");
    }
  }

  function reset() {
    writeRaw("");
    setMoment(null);
    go(0);
  }

  /** The first check with no answer in a part, or its first check when it is done. */
  const enter = (part: number) => {
    const open = stops.findIndex((s) => s.part === part && !answers[s.id]);
    return open !== -1 ? open : stops.findIndex((s) => s.part === part);
  };

  return (
    <div className="gt ck">
      {/* The car being walked around. Decoration: the parts are named on the buttons under it. */}
      <div className="ck-car" aria-hidden="true" data-result={onResult || undefined}>
        {photo && <Image src={photo} alt="" fill sizes="(min-width: 800px) 720px, 100vw" unoptimized={!canResize(photo)} />}
        {groups.map((g, i) => {
          const where = SPOT_AT[g.id] ?? { x: 16 + i * 17, y: 22 };
          const sealed = areas[i].sealed;
          return (
            <span
              key={g.id}
              className="ck-spot"
              data-on={stop?.part === i || undefined}
              data-sealed={sealed || undefined}
              style={{ left: `${where.x}%`, top: `${where.y}%` } as CSSProperties}
            >
              {/* Keyed, so the seal presses on when the part is finished. */}
              <i className={`fas ${sealed ? "fa-check" : g.icon}`} key={sealed ? "seal" : "icon"} />
            </span>
          );
        })}
        <span className="ck-car-read">
          {group && stop ? (
            <>
              <strong>{group.title}</strong> check {stop.index + 1} of {group.checks.length}
            </>
          ) : (
            <>
              <strong>{score.total - score.left}</strong> of {score.total} checked
            </>
          )}
        </span>
      </div>

      <div className="ck-top">
        <ol className="ck-steps" aria-label="Parts of the car">
          {groups.map((g, i) => (
            <li key={g.id}>
              <button
                type="button"
                className="ck-step"
                aria-current={stop?.part === i ? "step" : undefined}
                data-done={areas[i].sealed || undefined}
                onClick={() => go(enter(i))}
              >
                <i className={`fas ${areas[i].sealed ? "fa-check" : g.icon}`} aria-hidden="true" />
                <span>{g.title}</span>
                <span className="gd-sr">
                  {" "}
                  ({areas[i].done} of {areas[i].total} checked)
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div className="ck-barrow">
          <div className="ck-bar" aria-hidden="true">
            <span style={{ transform: `scaleX(${((score.total - score.left) / score.total).toFixed(3)})` }} />
          </div>
          <Moment text={moment} />
        </div>
        <p className="ck-tally" role="status" aria-live="polite">
          <span>
            <strong>{score.good}</strong> good
          </span>
          <span data-kind={score.problems ? "problem" : undefined}>
            <strong>{score.problems}</strong> to ask about
          </span>
          <span>
            <strong>{score.left}</strong> left{left > 0 && <> · about {left} min</>}
          </span>
        </p>
      </div>

      {check && group && stop ? (
        <section className="ck-part" aria-labelledby="ck-part-title">
          {/* Every check's words, unseen, in the same place: the card is as tall as the
              longest of them, so moving on never moves what is under it. */}
          <div className="ck-deck">
            <Ghosts groups={groups} />
            {/* Keyed by the check: each one is dealt in, and takes its answer like a stamp. */}
            <div className="ck-card" key={check.id} data-answer={answers[check.id]}>
            <p className="ck-kicker">
              <i className={`fas ${group.icon}`} aria-hidden="true" />
              {group.title} · {stop.index + 1} of {group.checks.length}
            </p>
            <h3 className="ck-label" id="ck-part-title" tabIndex={-1} ref={heading}>
              {check.label}
            </h3>
            <p className="ck-hint">
              {check.hint}
              {check.link && (
                <>
                  {" "}
                  <Link href={check.link.href} className="gd-a">
                    {check.link.label}
                  </Link>
                </>
              )}
            </p>
            {answers[check.id] && (
              <span className="ck-stamp" aria-hidden="true" data-kind={answers[check.id]} key={answers[check.id]}>
                {answers[check.id] === "good" ? "Good" : "Ask"}
              </span>
            )}
            </div>
          </div>
          <div className="ck-btns" role="group" aria-label={check.label}>
            <button
              type="button"
              className="ck-btn"
              data-kind="good"
              aria-pressed={answers[check.id] === "good"}
              onClick={() => answer(check.id, "good")}
            >
              <i className="fas fa-check" aria-hidden="true" />
              Good
            </button>
            <button
              type="button"
              className="ck-btn"
              data-kind="problem"
              aria-pressed={answers[check.id] === "problem"}
              onClick={() => answer(check.id, "problem")}
            >
              <i className="fas fa-triangle-exclamation" aria-hidden="true" />
              Problem
            </button>
          </div>
          <div className="ck-nav">
            <button type="button" className="ck-link" disabled={at === 0} onClick={() => go(at - 1)}>
              <i className="fas fa-arrow-left" aria-hidden="true" />
              Back
            </button>
            <button type="button" className="ck-link" onClick={() => go(at + 1 < stops.length ? at + 1 : stops.length)}>
              Skip
              <i className="fas fa-arrow-right" aria-hidden="true" />
            </button>
            <button type="button" className="ck-link ck-link--stop" onClick={() => go(stops.length)}>
              <i className="fas fa-flag-checkered" aria-hidden="true" />
              {score.left === score.total ? "See the result" : "Stop here"}
            </button>
          </div>
        </section>
      ) : (
        <section className="ck-part ck-result" aria-labelledby="ck-part-title">
          <p className="ck-kicker">Your result</p>
          <h3 className="ck-result-title" id="ck-part-title" tabIndex={-1} ref={heading}>
            {result.title}
          </h3>
          <p className="ck-result-line">{result.line}</p>
          <dl className="ck-score">
            <div>
              <dd>
                <CountUp value={score.good} format={String} />
              </dd>
              <dt>good</dt>
            </div>
            <div data-kind={score.problems ? "problem" : undefined}>
              <dd>
                <CountUp value={score.problems} format={String} />
              </dd>
              <dt>to ask about</dt>
            </div>
            <div>
              <dd>
                <CountUp value={score.left} format={String} />
              </dd>
              <dt>not checked</dt>
            </div>
          </dl>

          {/* Each part of the car: sealed, or how far along. */}
          <ul className="ck-areas">
            {areas.map((a, i) => (
              <li key={a.id} data-sealed={a.sealed || undefined} style={{ "--i": i } as CSSProperties}>
                <i className={`fas ${a.sealed ? "fa-circle-check" : groups[i].icon}`} aria-hidden="true" />
                <span>{a.title}</span>
                <span className="ck-area-n">
                  {a.sealed ? "Done" : `${a.done} of ${a.total}`}
                  {a.problems > 0 && <em> · {a.problems} to ask</em>}
                </span>
              </li>
            ))}
          </ul>

          {problems.length > 0 && (
            <>
              <p className="ck-result-h">Ask the seller about</p>
              <ul className="ck-problems">
                {problems.map((p) => (
                  <li key={`${p.part}-${p.label}`}>
                    <i className="fas fa-triangle-exclamation" aria-hidden="true" />
                    <span>
                      <span className="ck-problem-part">{p.part}</span>
                      {p.label}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {score.left > 0 && (
            <button type="button" className="gd-btn" onClick={() => go(nextStop(stops, answers, -1))}>
              <i className="fas fa-person-walking" aria-hidden="true" />
              {score.left === score.total ? "Start the walk" : `Keep going: ${score.left} left, about ${left} min`}
            </button>
          )}

          {score.left < score.total && (
            <div className="ck-actions">
              <button type="button" className="gd-btn gd-btn--primary" onClick={share}>
                <i className="fas fa-arrow-up-from-bracket" aria-hidden="true" />
                Share result
              </button>
              <button type="button" className="gd-btn" onClick={saveImage}>
                <i className="fas fa-image" aria-hidden="true" />
                Save as image
              </button>
              <button type="button" className="gd-btn" onClick={copy}>
                <i className="fas fa-copy" aria-hidden="true" />
                Copy as text
              </button>
            </div>
          )}
          <p className="ck-note" role="status" aria-live="polite">
            {note}
          </p>
          {manual && (
            <textarea
              className="ck-manual"
              readOnly
              rows={8}
              value={manual}
              aria-label="Your result as text"
              onFocus={(e) => e.currentTarget.select()}
            />
          )}

          <div className="ck-after">
            <Link href="/us/check" className="gd-a">
              Check this car&rsquo;s VIN free
            </Link>
            {score.left < score.total && (
              <button type="button" className="ck-reset" onClick={reset}>
                Start over
              </button>
            )}
          </div>
        </section>
      )}

      {/* Without JavaScript the walk can't move: the whole list, as plain reading. */}
      <noscript>
        <ol className="ck-plain">
          {groups.map((g) => (
            <li key={g.id}>
              <strong>{g.title}</strong>
              <ul>
                {g.checks.map((c) => (
                  <li key={c.id}>
                    {c.label}. {c.hint}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </noscript>
    </div>
  );
}
