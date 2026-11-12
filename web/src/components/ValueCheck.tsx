"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";
import { lookUpVin, type LookUpResult } from "@/lib/actions/vinCheck";
import { estimateValue } from "@/lib/actions/value";
import type { DecodedVin } from "@/lib/vin/nhtsa";
import type { CarPhoto } from "@/lib/vin/photo";
import { brand, cleanModel } from "@/lib/vin/plain";
import { useHydrated } from "@/lib/useHydrated";
import { ValueUnavailable } from "@/components/ValueUnavailable";
import {
  ASKING_NOTE,
  MILE_CHIPS,
  SOURCE_CREDIT,
  chipLabel,
  demandLine,
  estimateNote,
  failureCopy,
  milesProblem,
  nextMonthLabel,
  readMiles,
  readZip,
  usd,
  wholeNumber,
  zipProblem,
  type ValueEstimate,
  type ValueFailure,
  type ValueResult,
} from "@/components/valueSteps";

/** The two server actions the page calls. A harness can pass stand-ins; the site never does. */
export interface ValueActions {
  lookUp: (prev: LookUpResult | null, formData: FormData) => Promise<LookUpResult>;
  estimate: (prev: ValueResult | null, formData: FormData) => Promise<ValueResult>;
}

type Looked = { vin: string; car: DecodedVin; warning: string | null; photo: CarPhoto | null };
type Problem = { field: "miles" | "zip" | null; message: string };
type Shown = Exclude<ValueFailure, "off" | "input">;

type View =
  | { step: "vin"; vin: string; error: string | null }
  | { step: "confirm"; looked: Looked }
  | { step: "details"; looked: Looked; problem: Problem | null }
  | { step: "result"; looked: Looked; estimate: ValueEstimate }
  | { step: "failed"; looked: Looked; failure: Shown; message: string | null; resets: string | null }
  | { step: "off" };

/**
 * The step on screen, where focus goes after the last answer, and a count
 * that changes with every answer, so the same error twice still moves focus.
 */
type State = { view: View; focus: "heading" | "vin" | "miles" | "zip" | "error" | null; seq: number };

type Action =
  | { type: "started" }
  | { type: "looked"; looked: Looked }
  | { type: "lookFailed"; error: string }
  | { type: "confirmed" }
  | { type: "problem"; problem: Problem }
  | { type: "estimated"; estimate: ValueEstimate }
  | { type: "failed"; failure: Shown; message: string | null; resets: string | null }
  | { type: "off" }
  | { type: "toDetails" }
  | { type: "toVin"; vin: string; error?: string };

function reducer(s: State, a: Action): State {
  const next = (view: View, focus: State["focus"]): State => ({ view, focus, seq: s.seq + 1 });
  const { view } = s;
  const looked = "looked" in view ? view.looked : null;
  switch (a.type) {
    case "started":
      // A new try clears the last one's error; focus stays where it is.
      if (view.step === "vin" && view.error) return { ...s, view: { ...view, error: null }, focus: null };
      if (view.step === "details" && view.problem) return { ...s, view: { ...view, problem: null }, focus: null };
      return s;
    case "looked":
      return next({ step: "confirm", looked: a.looked }, "heading");
    case "lookFailed":
      return view.step === "vin" ? next({ ...view, error: a.error }, "vin") : s;
    case "confirmed":
    case "toDetails":
      return looked ? next({ step: "details", looked, problem: null }, "heading") : s;
    case "problem":
      return looked ? next({ step: "details", looked, problem: a.problem }, a.problem.field ?? "error") : s;
    case "estimated":
      return looked ? next({ step: "result", looked, estimate: a.estimate }, "heading") : s;
    case "failed":
      return looked
        ? next({ step: "failed", looked, failure: a.failure, message: a.message, resets: a.resets }, "heading")
        : s;
    case "off":
      return next({ step: "off" }, null);
    case "toVin":
      return next({ step: "vin", vin: a.vin, error: a.error ?? null }, "vin");
  }
}

const FAILED = "We couldn't reach the site. Check your connection and try again.";

function carName(c: DecodedVin): string {
  return [c.year, c.make && brand(c.make), cleanModel(c.model), c.series, c.trim].filter(Boolean).join(" ");
}

/**
 * What's my car worth: VIN, "Is this your car?", miles and ZIP, then one
 * dealer-price estimate from MarketCheck.
 *
 * Taps, not typing: the VIN is the only thing that must be typed. Miles are
 * a tap on a round number (or the exact figure), and the ZIP starts as the
 * showroom's.
 *
 * One state, moved only by answers to the latest request, as in the car
 * check (VinCheck.tsx): each request takes a ticket and an answer for an
 * older ticket is dropped, so a slow estimate can't pull the page back to a
 * car the visitor has left.
 *
 * The estimate lives in this component's memory and nowhere else. Leaving or
 * reloading the page loses it, on purpose: MarketCheck's terms allow its
 * numbers to be shown for the request that asked and not kept. For the same
 * reason nothing here touches the URL, sessionStorage or analytics, and the
 * VIN travels only in POST bodies.
 */
export function ValueCheck({
  homeZip,
  homePlace,
  sellHref,
  checkHref,
  staffPreview = false,
  actions,
}: {
  /** The showroom's ZIP, from its location record; "" when it has none. */
  homeZip: string;
  /** "Greensboro, NC", said beside that ZIP. */
  homePlace: string | null;
  sellHref: string;
  checkHref: string;
  /** The estimate is switched on for staff only, and this is staff. */
  staffPreview?: boolean;
  actions?: ValueActions;
}) {
  const lookUp = actions?.lookUp ?? lookUpVin;
  const estimate = actions?.estimate ?? estimateValue;

  // Until React is running, a press would post the form to the page itself.
  const hydrated = useHydrated();
  const [state, dispatch] = useReducer(reducer, {
    view: { step: "vin", vin: "", error: null },
    focus: null,
    seq: 0,
  });
  const [busy, setBusy] = useState<"look" | "estimate" | null>(null);
  const [miles, setMiles] = useState("");
  const [zip, setZip] = useState(readZip(homeZip) ?? "");
  // Closed on the showroom's ZIP; open when there is none to start from.
  const [zipOpen, setZipOpen] = useState(!readZip(homeZip));
  const ticket = useRef(0);
  // What is on its way. A ref as well as state: two presses in the same
  // frame both see the old state, and the second must not buy a second estimate.
  const sending = useRef<"look" | "estimate" | null>(null);
  const tool = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const vinInput = useRef<HTMLInputElement>(null);
  const milesInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const { view } = state;

  useEffect(() => {
    const target = {
      heading: heading.current,
      vin: vinInput.current,
      miles: milesInput.current,
      zip: zipInput.current,
      error: errorRef.current,
    }[state.focus ?? "error"];
    if (!state.focus) return;
    if (state.focus !== "heading") return target?.focus();
    // A new step starts at its top: under the headline on a phone, the last
    // step's button was halfway down the screen and the new one's would be
    // off it. The heading takes focus without a second jump.
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    tool.current?.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
    target?.focus({ preventScroll: true });
  }, [state.seq, state.focus]);

  async function run<R>(kind: "look" | "estimate", call: () => Promise<R>, done: (r: R | null) => void) {
    const mine = ++ticket.current;
    sending.current = kind;
    setBusy(kind);
    dispatch({ type: "started" });
    let r: R | null;
    try {
      r = await call();
    } catch {
      r = null;
    }
    if (mine !== ticket.current) return;
    sending.current = null;
    setBusy(null);
    done(r);
  }

  const look = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending.current) return;
    const fd = new FormData(e.currentTarget);
    void run("look", () => lookUp(null, fd), (r) => {
      if (r?.ok && r.vin && r.car) {
        dispatch({
          type: "looked",
          looked: { vin: r.vin, car: r.car, warning: r.warning ?? null, photo: r.photo ?? null },
        });
      } else {
        dispatch({ type: "lookFailed", error: r?.error ?? FAILED });
      }
    });
  };

  const ask = (looked: Looked) => {
    if (sending.current) return;
    const mp = milesProblem(miles);
    if (mp) return dispatch({ type: "problem", problem: { field: "miles", message: mp } });
    const zp = zipProblem(zip);
    if (zp) {
      setZipOpen(true);
      return dispatch({ type: "problem", problem: { field: "zip", message: zp } });
    }
    const fd = new FormData();
    fd.set("vin", looked.vin);
    fd.set("miles", String(readMiles(miles)));
    fd.set("zip", readZip(zip) ?? "");
    void run("estimate", () => estimate(null, fd), (r) => {
      if (!r) return dispatch({ type: "problem", problem: { field: null, message: FAILED } });
      if (r.ok && r.estimate) return dispatch({ type: "estimated", estimate: r.estimate });
      switch (r.failure) {
        case "off":
          return dispatch({ type: "off" });
        case "input":
          if (r.field === "vin") return dispatch({ type: "toVin", vin: looked.vin, error: r.error });
          if (r.field === "zip") setZipOpen(true);
          return dispatch({
            type: "problem",
            problem: { field: r.field ?? null, message: r.error ?? "Check what you typed." },
          });
        case "limit":
        case "cap":
        case "none":
        case "down":
          return dispatch({ type: "failed", failure: r.failure, message: r.error ?? null, resets: r.resets ?? null });
        default:
          return dispatch({ type: "problem", problem: { field: null, message: FAILED } });
      }
    });
  };

  // Going back cancels whatever is on its way.
  const leave = (action: Action) => {
    ticket.current++;
    sending.current = null;
    setBusy(null);
    dispatch(action);
  };
  const another = () => {
    setMiles("");
    leave({ type: "toVin", vin: "" });
  };

  const preview = staffPreview ? (
    <p className="val-staff" role="note">
      <i className="fas fa-eye" aria-hidden="true" />
      <span>
        <strong>Staff preview.</strong> Visitors see &ldquo;not available yet&rdquo; until this is
        switched on.
      </span>
    </p>
  ) : null;
  // One box in the page's grid, whatever the step: the staff note, then the panel.
  const shell = (content: React.ReactNode) => (
    <div className="val-tool" ref={tool}>
      {preview}
      {content}
      {/* The button's own words change while it waits; this says so aloud. */}
      <p className="val-sr" role="status">
        {busy === "look" ? "Looking up the VIN" : busy === "estimate" ? "Getting your estimate" : ""}
      </p>
    </div>
  );

  // The server says it is off after all (switched off since the page loaded,
  // or the staff session ended): the same panel as everyone else, no staff note.
  if (view.step === "off") {
    return (
      <div className="val-tool" ref={tool}>
        <ValueUnavailable sellHref={sellHref} checkHref={checkHref} />
      </div>
    );
  }

  if (view.step === "result") {
    return shell(
      <Result
        looked={view.looked}
        estimate={view.estimate}
        heading={heading}
        sellHref={sellHref}
        checkHref={checkHref}
        onChange={() => leave({ type: "toDetails" })}
        onAnother={another}
      />,
    );
  }

  if (view.step === "failed") {
    // "Dec 1" from the server when it gave one; the browser's calendar otherwise.
    const copy = failureCopy(view.failure, {
      car: carName(view.looked.car),
      resets: view.resets ?? nextMonthLabel(new Date()),
    });
    return shell(
      <section className="val-panel val-failed" aria-labelledby="val-failed-title">
        <span className="val-badge" aria-hidden="true">
          <i className={`fas ${copy.icon}`} />
        </span>
        <h2 className="val-h" id="val-failed-title" ref={heading} tabIndex={-1}>
          {copy.title}
        </h2>
        <p className="val-text">{view.message ?? copy.body}</p>
        <div className="val-actions">
          {copy.retry && (
            <button
              type="button"
              className="val-btn val-btn--primary val-btn--wide"
              disabled={busy !== null}
              onClick={() => ask(view.looked)}
            >
              {busy === "estimate" ? "Trying again…" : "Try again"}
            </button>
          )}
          <Link
            href={sellHref}
            className={`val-btn val-btn--wide ${copy.retry ? "val-btn--outline" : "val-btn--primary"}`}
          >
            Get an offer from us
          </Link>
          <Link href={checkHref} className="val-btn val-btn--outline val-btn--wide">
            Check its recalls and safety
          </Link>
        </div>
        <CopyVin vin={view.looked.vin} />
        {/* Not when the month or the day is used up: another car would meet the same answer. */}
        {(view.failure === "none" || view.failure === "down") && (
          <button type="button" className="val-link" onClick={another}>
            Try another car
          </button>
        )}
      </section>,
    );
  }

  const stepNumber = view.step === "vin" ? 1 : view.step === "confirm" ? 2 : 3;
  const progress = (
    <div className="val-progress" aria-hidden="true">
      {[1, 2, 3].map((n) => (
        <span key={n} className={n <= stepNumber ? "is-on" : undefined} />
      ))}
    </div>
  );
  const count = <span className="val-step-count">Step {stepNumber} of 3</span>;

  if (view.step === "confirm") {
    const { looked } = view;
    const facts = [looked.car.body, looked.car.engine ?? looked.car.fuel, looked.car.drive]
      .filter(Boolean)
      .join(" · ");
    return shell(
      <section className="val-panel" aria-labelledby="val-confirm-title">
        {progress}
        <div className="val-step">
          <ModelPhoto photo={looked.photo} car={looked.car} />
          <div className="val-step-head">
            {count}
            <p className="val-ask" id="val-confirm-title">
              Is this your car?
            </p>
            <h2 className="val-car" ref={heading} tabIndex={-1}>
              {carName(looked.car)}
            </h2>
            {facts && <p className="val-facts">{facts}</p>}
          </div>
          {looked.warning && <p className="val-warn">{looked.warning}</p>}
          <div className="val-actions">
            <button
              type="button"
              className="val-btn val-btn--primary val-btn--wide"
              disabled={!hydrated}
              onClick={() => dispatch({ type: "confirmed" })}
            >
              Yes, that&rsquo;s my car
            </button>
            <button
              type="button"
              className="val-btn val-btn--outline val-btn--wide"
              onClick={() => leave({ type: "toVin", vin: looked.vin })}
            >
              No, change the VIN
            </button>
          </div>
        </div>
      </section>,
    );
  }

  if (view.step === "details") {
    const { looked, problem } = view;
    const chosen = readMiles(miles);
    const errorFor = (field: Problem["field"], id: string) =>
      problem && problem.field === field ? (
        <p
          className="val-error"
          role="alert"
          id={id}
          key={state.seq}
          ref={field === null ? errorRef : undefined}
          tabIndex={field === null ? -1 : undefined}
        >
          <i className="fas fa-circle-exclamation" aria-hidden="true" />
          <span>{problem.message}</span>
        </p>
      ) : null;
    return shell(
      <section className="val-panel" aria-labelledby="val-details-title">
        {progress}
        {/* POST, and never submitted by the browser itself: nothing here can reach a URL. */}
        <form
          method="post"
          className="val-step"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            ask(looked);
          }}
        >
          <div className="val-step-head">
            {count}
            <h2 className="val-step-title" id="val-details-title" ref={heading} tabIndex={-1}>
              About how many miles?
            </h2>
            <p className="val-facts">
              <i className="fas fa-car-side" aria-hidden="true" /> {carName(looked.car)}
            </p>
          </div>

          <div className="val-field">
            <div className="val-chips" role="group" aria-label="Miles, to the nearest 25,000">
              {MILE_CHIPS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="val-chip"
                  aria-pressed={chosen === m}
                  onClick={() => {
                    setMiles(wholeNumber(m));
                    dispatch({ type: "started" });
                  }}
                >
                  {chipLabel(m)}
                </button>
              ))}
            </div>
            <label className="val-label val-label--quiet" htmlFor="val-miles">
              Or type the exact miles
            </label>
            <div className="val-affix">
              <input
                ref={milesInput}
                id="val-miles"
                name="miles"
                className="val-input"
                inputMode="numeric"
                autoComplete="off"
                maxLength={9}
                placeholder="98,000"
                value={miles}
                onChange={(e) => setMiles(e.target.value)}
                aria-invalid={problem?.field === "miles" ? true : undefined}
                aria-describedby={problem?.field === "miles" ? "val-miles-error" : undefined}
              />
              <span className="val-affix-after" aria-hidden="true">
                miles
              </span>
            </div>
            {errorFor("miles", "val-miles-error")}
          </div>

          <div className="val-field">
            <p className="val-label" id="val-where">
              Where is the car?
            </p>
            {zipOpen ? (
              <>
                <label className="val-sr" htmlFor="val-zip">
                  ZIP code
                </label>
                <input
                  ref={zipInput}
                  id="val-zip"
                  name="zip"
                  className="val-input val-input--zip"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={10}
                  placeholder="ZIP code"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  aria-invalid={problem?.field === "zip" ? true : undefined}
                  aria-describedby={problem?.field === "zip" ? "val-zip-error" : undefined}
                />
              </>
            ) : (
              <div className="val-zipline">
                <i className="fas fa-location-dot" aria-hidden="true" />
                <span>
                  <strong>ZIP {zip}</strong>
                  {homePlace && zip === readZip(homeZip) && <small>{homePlace}</small>}
                </span>
                <button
                  type="button"
                  className="val-link"
                  aria-describedby="val-where"
                  onClick={() => {
                    setZipOpen(true);
                    // After React has put the box on the page: the old ZIP
                    // is selected, so typing replaces it.
                    setTimeout(() => {
                      zipInput.current?.focus();
                      zipInput.current?.select();
                    }, 0);
                  }}
                >
                  Change
                </button>
              </div>
            )}
            {errorFor("zip", "val-zip-error")}
          </div>

          {errorFor(null, "val-send-error")}
          <div className="val-actions">
            <button
              type="submit"
              className="val-btn val-btn--primary val-btn--wide"
              disabled={busy !== null || !hydrated}
            >
              {busy === "estimate" ? "Getting your estimate…" : "See my estimate"}
            </button>
            <button
              type="button"
              className="val-btn val-btn--outline val-btn--wide"
              onClick={() => leave({ type: "toVin", vin: looked.vin })}
            >
              Change the car
            </button>
          </div>
          <p className="val-fine">
            We send the VIN, miles and ZIP to MarketCheck to get the estimate.
          </p>
        </form>
      </section>,
    );
  }

  return shell(
    <section className="val-panel" aria-labelledby="val-vin-title">
      {progress}
      {/* POST, so a press before the page is ready can never put a VIN in a URL. */}
      <form method="post" onSubmit={look} className="val-step">
        <div className="val-step-head">
          {count}
          <h2 className="val-step-title" id="val-vin-title">
            Your car
          </h2>
        </div>
        <div className="val-field">
          <label className="val-label" htmlFor="val-vin">
            VIN <em>17 letters and numbers</em>
          </label>
          {/* Not controlled by React: what is typed before the page wakes up stays typed. */}
          <input
            ref={vinInput}
            id="val-vin"
            name="vin"
            defaultValue={view.vin}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={24}
            placeholder="e.g. 1HGCM82633A004352"
            className="val-input val-input--vin"
            aria-invalid={view.error ? true : undefined}
            aria-describedby={view.error ? "val-vin-error" : undefined}
            required
          />
          {/* Only a bot fills this in. */}
          <div className="val-trap" aria-hidden="true">
            <label>
              Leave this empty <input type="text" name="leave_empty" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          {view.error && (
            <p className="val-error" role="alert" id="val-vin-error" key={state.seq}>
              <i className="fas fa-circle-exclamation" aria-hidden="true" />
              <span>{view.error}</span>
            </p>
          )}
        </div>
        <button
          type="submit"
          className="val-btn val-btn--primary val-btn--wide"
          disabled={busy !== null || !hydrated}
        >
          {busy === "look" ? "Looking it up…" : "Look it up"}
        </button>
        <details className="val-help">
          <summary>Where do I find the VIN?</summary>
          <p>
            Look through the windshield at the bottom corner on the driver&rsquo;s side, or on the
            driver&rsquo;s door frame. It&rsquo;s also on the registration and the insurance card.
          </p>
        </details>
      </form>
    </section>,
  );
}

/** The estimate, with exactly what it is right under the number, then what to do next. */
function Result({
  looked,
  estimate,
  heading,
  sellHref,
  checkHref,
  onChange,
  onAnother,
}: {
  looked: Looked;
  estimate: ValueEstimate;
  heading: React.RefObject<HTMLHeadingElement | null>;
  sellHref: string;
  checkHref: string;
  onChange: () => void;
  onAnother: () => void;
}) {
  const demand = demandLine(estimate.demand, {
    zip: estimate.zip,
    asOf: estimate.asOf,
    radiusMiles: estimate.radiusMiles,
  });
  return (
    <div className="val-results">
      <section className="val-panel val-estimate" aria-labelledby="val-result-title">
        <ModelPhoto photo={looked.photo} car={looked.car} />
        <div className="val-step-head">
          <h2 className="val-car" id="val-result-title" ref={heading} tabIndex={-1}>
            {carName(looked.car)}
          </h2>
          <p className="val-facts">
            {wholeNumber(estimate.miles)} miles · ZIP {estimate.zip}
          </p>
        </div>

        <div className="val-figure">
          <p className="val-eyebrow">Estimate</p>
          <p className="val-price">{usd(estimate.price)}</p>
          <p className="val-price-label">Typical price at independent dealers</p>
          {/* Right under the number, never behind a link. */}
          <p className="val-note">{estimateNote(estimate)}</p>
        </div>

        <p className="val-plain">
          <i className="fas fa-circle-info" aria-hidden="true" />
          <span>{ASKING_NOTE}</span>
        </p>

        {(estimate.msrp !== null || demand) && (
          <dl className="val-more">
            {estimate.msrp !== null && (
              <div>
                <dt>
                  <i className="fas fa-tag" aria-hidden="true" /> Price when new
                </dt>
                <dd className="val-more-value">{usd(estimate.msrp)}</dd>
                <dd className="val-more-note">The maker&rsquo;s list price (MSRP), from MarketCheck.</dd>
              </div>
            )}
            {demand && (
              <div>
                <dt>
                  <i className="fas fa-gauge-high" aria-hidden="true" /> Local demand
                </dt>
                <dd className="val-more-value">{demand.headline}</dd>
                <dd className="val-more-note">{demand.detail}</dd>
              </div>
            )}
          </dl>
        )}

        <p className="val-credit">{SOURCE_CREDIT}</p>
      </section>

      <section className="val-panel val-next" aria-labelledby="val-next-title">
        <h3 className="val-h" id="val-next-title">
          What next?
        </h3>
        <div className="val-actions">
          <Link href={sellHref} className="val-btn val-btn--primary val-btn--wide">
            Sell us this car
          </Link>
          <Link href={checkHref} className="val-btn val-btn--outline val-btn--wide">
            Check its recalls and safety
          </Link>
        </div>
        <CopyVin vin={looked.vin} />
        <div className="val-quiet">
          <button type="button" className="val-link" onClick={onChange}>
            Change the miles or ZIP
          </button>
          <button type="button" className="val-link" onClick={onAnother}>
            Check another car
          </button>
        </div>
      </section>
    </div>
  );
}

/**
 * The VIN, to paste on the next page: both of them ask for it, and a link
 * can't carry it (a VIN never goes in a URL). To the clipboard only.
 */
function CopyVin({ vin }: { vin: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <p className="val-copy">
      <span>Both pages ask for the VIN.</span>
      <button
        type="button"
        className="val-link"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(vin);
            setCopied(true);
          } catch {
            // No clipboard here (an old browser, or permission refused): the VIN is still on the car.
            setCopied(false);
          }
        }}
      >
        <i className={`fas ${copied ? "fa-check" : "fa-copy"}`} aria-hidden="true" />{" "}
        <span aria-live="polite">{copied ? "VIN copied" : "Copy VIN"}</span>
      </button>
    </p>
  );
}

/**
 * A photo of the model from Wikimedia Commons, with the credit its license
 * asks for. Nothing at all when there is none, or when it doesn't load.
 */
function ModelPhoto({ photo, car }: { photo: CarPhoto | null; car: DecodedVin }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!photo || failed === photo.src) return null;
  const shown = [photo.photoYear, car.make && brand(car.make), photo.model].filter(Boolean).join(" ");
  // "a 2017 Toyota Camry" when it is the car's year; the year itself when it isn't.
  const caption = photo.photoYear === car.year ? `a ${shown}` : shown;
  return (
    <figure className="val-photo">
      <Image
        src={photo.src}
        width={photo.width}
        height={photo.height}
        alt={shown}
        sizes="(min-width: 960px) 560px, calc(100vw - 32px)"
        onError={() => setFailed(photo.src)}
      />
      <figcaption className="val-photo-credit">
        <a href={photo.pageUrl} target="_blank" rel="noopener noreferrer">
          Photo: {caption}, for illustration
        </a>
        {photo.artist && <> · {photo.artist}</>}
        {" · "}
        {photo.licenseUrl ? (
          <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">
            {photo.license}
          </a>
        ) : (
          photo.license
        )}
      </figcaption>
    </figure>
  );
}
