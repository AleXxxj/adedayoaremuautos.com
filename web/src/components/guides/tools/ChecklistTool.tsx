"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { CheckGroup } from "@/content/guides/checklist";
import { checklistText, tally, type Answer } from "../guideMath";

/**
 * The used-car checklist: five parts of a car, tapped through one at a time,
 * with a running tally and a result to share or save.
 *
 * Every check has two big buttons, Good and Problem. Nothing is typed. The
 * tally at the top is announced politely as it changes; moving to the next
 * part puts focus on its heading, so a screen reader starts reading there.
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

/* ── The tool ──────────────────────────────────────────────────────────── */

export function ChecklistTool({ groups, path }: { groups: CheckGroup[]; path: string }) {
  const ids = groups.flatMap((g) => g.checks.map((c) => c.id));
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const answers = parse(raw, new Set(ids));
  const score = tally(ids, answers);

  // 0 to groups.length - 1 are the parts; groups.length is the result.
  const [step, setStep] = useState(0);
  const [note, setNote] = useState("");
  const [manual, setManual] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  // After Next, Back or a jump: start reading at the new part's heading.
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [step]);

  function go(next: number) {
    moved.current = true;
    setNote("");
    setManual("");
    setStep(next);
  }

  function answer(id: string, value: Answer) {
    const next = { ...answers };
    // A second tap on the same button takes the answer back.
    if (next[id] === value) delete next[id];
    else next[id] = value;
    writeRaw(Object.keys(next).length ? JSON.stringify(next) : "");
  }

  const onResult = step >= groups.length;
  const group = onResult ? null : groups[step];
  const partDone = (g: CheckGroup) => g.checks.every((c) => answers[c.id]);
  const problems = groups.flatMap((g) =>
    g.checks.filter((c) => answers[c.id] === "problem").map((c) => ({ part: g.title, label: c.label })),
  );
  const firstOpen = groups.findIndex((g) => !partDone(g));

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
    go(0);
  }

  return (
    <div className="gt ck">
      <div className="ck-top">
        <ol className="ck-steps" aria-label="Parts of the checklist">
          {groups.map((g, i) => (
            <li key={g.id}>
              <button
                type="button"
                className="ck-step"
                aria-current={i === step ? "step" : undefined}
                data-done={partDone(g) || undefined}
                onClick={() => go(i)}
              >
                <i className={`fas ${partDone(g) ? "fa-check" : g.icon}`} aria-hidden="true" />
                <span>{g.title}</span>
                {partDone(g) && <span className="gd-sr"> (done)</span>}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="ck-step"
              aria-current={onResult ? "step" : undefined}
              onClick={() => go(groups.length)}
            >
              <i className="fas fa-flag-checkered" aria-hidden="true" />
              <span>Result</span>
            </button>
          </li>
        </ol>
        <div className="ck-bar" aria-hidden="true">
          <span style={{ transform: `scaleX(${((score.total - score.left) / score.total).toFixed(3)})` }} />
        </div>
        <p className="ck-tally" role="status" aria-live="polite">
          <span>
            <strong>{score.good}</strong> good
          </span>
          <span data-kind={score.problems ? "problem" : undefined}>
            <strong>{score.problems}</strong> to ask about
          </span>
          <span>
            <strong>{score.left}</strong> left
          </span>
        </p>
      </div>

      {group ? (
        <section className="ck-part" aria-labelledby="ck-part-title">
          <h3 className="ck-part-title" id="ck-part-title" tabIndex={-1} ref={heading}>
            {group.title}
            <span>
              Part {step + 1} of {groups.length}
            </span>
          </h3>
          <ul className="ck-list ck-list--in" key={group.id}>
            {group.checks.map((c) => (
              <li key={c.id} className="ck-item" data-answer={answers[c.id]}>
                <p className="ck-label">{c.label}</p>
                <p className="ck-hint">
                  {c.hint}
                  {c.link && (
                    <>
                      {" "}
                      <Link href={c.link.href} className="gd-a">
                        {c.link.label}
                      </Link>
                    </>
                  )}
                </p>
                <div className="ck-btns" role="group" aria-label={c.label}>
                  <button
                    type="button"
                    className="ck-btn"
                    data-kind="good"
                    aria-pressed={answers[c.id] === "good"}
                    onClick={() => answer(c.id, "good")}
                  >
                    <i className="fas fa-check" aria-hidden="true" />
                    Good
                  </button>
                  <button
                    type="button"
                    className="ck-btn"
                    data-kind="problem"
                    aria-pressed={answers[c.id] === "problem"}
                    onClick={() => answer(c.id, "problem")}
                  >
                    <i className="fas fa-triangle-exclamation" aria-hidden="true" />
                    Problem
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="ck-nav">
            {step > 0 && (
              <button type="button" className="gd-btn" onClick={() => go(step - 1)}>
                <i className="fas fa-arrow-left" aria-hidden="true" />
                Back
              </button>
            )}
            <button type="button" className="gd-btn gd-btn--primary" onClick={() => go(step + 1)}>
              {step + 1 < groups.length ? `Next: ${groups[step + 1].title}` : "See my result"}
              <i className="fas fa-arrow-right" aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : (
        <section className="ck-part ck-result" aria-labelledby="ck-part-title">
          <h3 className="ck-part-title" id="ck-part-title" tabIndex={-1} ref={heading}>
            Your result
          </h3>
          <dl className="ck-score">
            <div>
              <dd>{score.good}</dd>
              <dt>good</dt>
            </div>
            <div data-kind={score.problems ? "problem" : undefined}>
              <dd>{score.problems}</dd>
              <dt>to ask about</dt>
            </div>
            <div>
              <dd>{score.left}</dd>
              <dt>not checked</dt>
            </div>
          </dl>

          {problems.length > 0 ? (
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
          ) : (
            <p className="ck-result-h">{score.left ? "No problems marked so far." : "No problems marked."}</p>
          )}

          {score.left > 0 && firstOpen !== -1 && (
            <button type="button" className="gd-btn" onClick={() => go(firstOpen)}>
              <i className="fas fa-list-check" aria-hidden="true" />
              Finish the {score.left} {score.left === 1 ? "check" : "checks"} left
            </button>
          )}

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
            <button type="button" className="ck-reset" onClick={reset}>
              Start over
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
