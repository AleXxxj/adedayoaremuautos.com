"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import {
  lookUpVin,
  checkCar,
  type LookUpResult,
  type CheckResult,
} from "@/lib/actions/vinCheck";
import type { CrashRatings, DecodedVin, ModelRecall, RatedVersion } from "@/lib/vin/nhtsa";
import { useHydrated } from "@/lib/useHydrated";

/** Makes NHTSA spells in capitals that are written that way. */
const ACRONYMS = new Set(["BMW", "GMC", "RAM", "MINI", "SRT", "AMG", "VW"]);

/** "MERCEDES-BENZ" -> "Mercedes-Benz", "BMW" stays "BMW". */
function brand(make: string): string {
  if (ACRONYMS.has(make)) return make;
  return make
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}

/** vPIC's model without its note: "RAV4 Prime (PHEV)" -> "RAV4 Prime". */
const cleanModel = (m: string | null) => m?.replace(/\s*\([^)]*\)\s*$/, "") || null;

function carName(c: DecodedVin): string {
  return [c.year, c.make && brand(c.make), cleanModel(c.model), c.series, c.trim].filter(Boolean).join(" ");
}

function modelName(c: DecodedVin, under?: string | null): string {
  return [c.year, c.make && brand(c.make), under ?? cleanModel(c.model), under ? null : c.series]
    .filter(Boolean)
    .join(" ");
}

/** "C300, C350 and C400". */
function joinAnd(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * NHTSA's capitals as a heading: "FUEL/PROPULSION SYSTEM" -> "Fuel/Propulsion
 * System", "UNKNOWN OR OTHER" -> "Unknown or Other", "ELECTRONIC STABILITY
 * CONTROL (ESC)" keeps its "(ESC)".
 */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s(/-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase())
    .replace(/ (And|Or|Of|The|To|For|In|On|With) /g, (w) => w.toLowerCase())
    .replace(/\(([A-Za-z]{2,4})\)$/, (_, a: string) => `(${a.toUpperCase()})`);
}

/** "UNITED STATES" -> "the United States"; "JAPAN" -> "Japan". */
function country(raw: string): string {
  const name = titleCase(raw);
  return /^(United |Czech Republic|Netherlands|Philippines|Dominican Republic)/.test(name)
    ? `the ${name}`
    : name;
}

type Looked = { vin: string; car: DecodedVin; warning: string | null };
type Checked = CheckResult & { vin: string; car: DecodedVin };

type View =
  | { step: "enter"; vin: string; error: string | null }
  | { step: "confirm"; looked: Looked; error: string | null }
  | { step: "results"; checked: Checked; error: string | null };

/**
 * The step on screen, where focus goes after the last answer, and a count
 * that changes with every answer: the same error twice is still news, and
 * focus has to move for it.
 */
type State = { view: View; focus: "heading" | "input" | "error" | null; seq: number };

type Action =
  | { type: "started" }
  | { type: "looked"; looked: Looked }
  | { type: "lookFailed"; error: string }
  | { type: "checked"; checked: Checked }
  | { type: "checkFailed"; error: string }
  | { type: "back"; vin: string };

function reducer(s: State, a: Action): State {
  const next = (view: View, focus: State["focus"]): State => ({ view, focus, seq: s.seq + 1 });
  switch (a.type) {
    case "started":
      // A new try clears the last one's error; focus stays where it is.
      return s.view.error ? { ...s, view: { ...s.view, error: null }, focus: null } : s;
    case "looked":
      return next({ step: "confirm", looked: a.looked, error: null }, "heading");
    case "lookFailed":
      // To the VIN box, which names the error, so it can be corrected.
      return s.view.step === "enter" ? next({ ...s.view, error: a.error }, "input") : s;
    case "checked":
      return next({ step: "results", checked: a.checked, error: null }, "heading");
    case "checkFailed":
      return s.view.step === "enter" ? s : next({ ...s.view, error: a.error }, "error");
    case "back":
      return next({ step: "enter", vin: a.vin, error: null }, "input");
  }
}

const FAILED = "Something went wrong. Please try again.";

/**
 * Check any car: VIN, then "Is this the car?", then what is known about it.
 *
 * One state, moved only by answers to the latest request. Each request takes
 * a ticket, and an answer for an older ticket is dropped — so a result still
 * on its way when the visitor goes back, or starts on another car, can't
 * pull the page back to the car they left. Which button is busy is part of
 * that ticket too: going back frees the buttons at once, instead of leaving
 * "Looking it up…" on screen until the abandoned request ends.
 *
 * Focus follows the answer. The button just pressed disappears with its
 * step, so focus goes to the new step's heading; after an error it goes to
 * the VIN box or to the error itself, where a screen reader reads it.
 */
export function VinCheck({
  market,
  locale,
  contactHref,
}: {
  market: string;
  locale: string;
  contactHref: string;
}) {
  // Until React is running, a press would post the form to the page itself.
  const hydrated = useHydrated();
  const [state, dispatch] = useReducer(reducer, {
    view: { step: "enter", vin: "", error: null },
    focus: null,
    seq: 0,
  });
  const [busy, setBusy] = useState<"look" | "check" | null>(null);
  const ticket = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const { view } = state;

  useEffect(() => {
    const target =
      state.focus === "input"
        ? input.current
        : state.focus === "error"
          ? errorRef.current
          : state.focus === "heading"
            ? heading.current
            : null;
    target?.focus();
  }, [state.seq, state.focus]);

  async function run<R extends { ok: boolean; error?: string }>(
    kind: "look" | "check",
    call: () => Promise<R>,
    done: (r: R) => void,
  ) {
    const mine = ++ticket.current;
    setBusy(kind);
    dispatch({ type: "started" });
    let r: R;
    try {
      r = await call();
    } catch {
      r = { ok: false, error: FAILED } as R;
    }
    if (mine !== ticket.current) return;
    setBusy(null);
    done(r);
  }

  const look = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    void run<LookUpResult>("look", () => lookUpVin(null, fd), (r) => {
      if (r.ok && r.vin && r.car) {
        dispatch({ type: "looked", looked: { vin: r.vin, car: r.car, warning: r.warning ?? null } });
      } else {
        dispatch({ type: "lookFailed", error: r.error ?? FAILED });
      }
    });
  };

  const check = (vin: string) => {
    if (busy) return;
    const fd = new FormData();
    fd.set("vin", vin);
    void run<CheckResult>("check", () => checkCar(null, fd), (r) => {
      if (r.ok && r.vin === vin && r.car) {
        dispatch({ type: "checked", checked: { ...r, vin: r.vin, car: r.car } });
      } else {
        dispatch({ type: "checkFailed", error: r.error ?? FAILED });
      }
    });
  };

  // Going back cancels whatever is on its way. "No, change the VIN" keeps it
  // to correct; "Check another car" starts with an empty box.
  const back = (vin: string) => {
    ticket.current++;
    setBusy(null);
    dispatch({ type: "back", vin });
  };

  // Keyed by the count, so the same message twice is announced twice.
  const errorNote = (id?: string) =>
    view.error ? (
      <p className="vc-error" role="alert" id={id} key={state.seq} ref={errorRef} tabIndex={-1}>
        {view.error}
      </p>
    ) : null;

  if (view.step === "results") {
    return (
      <Results
        checked={view.checked}
        locale={locale}
        market={market}
        contactHref={contactHref}
        heading={heading}
        error={errorNote()}
        retrying={busy === "check"}
        onRetry={busy ? undefined : () => check(view.checked.vin)}
        onAnother={() => back("")}
      />
    );
  }

  if (view.step === "confirm") {
    const { looked } = view;
    return (
      <div className="vc-card">
        <p className="vc-eyebrow">Is this the car?</p>
        <h2 className="vc-car" ref={heading} tabIndex={-1}>
          {carName(looked.car)}
        </h2>
        <p className="vc-facts">
          {[
            looked.car.body,
            // An electric car has no engine size; its fuel says what it runs on.
            looked.car.engine ?? looked.car.fuel,
            looked.car.drive,
            looked.car.builtIn && `Built in ${country(looked.car.builtIn)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {looked.warning && <p className="vc-warn">{looked.warning}</p>}

        <div className="vc-actions">
          <button
            type="button"
            className="btn btn-primary vc-primary"
            disabled={busy !== null || !hydrated}
            onClick={() => check(looked.vin)}
          >
            {busy === "check" ? "Checking…" : "Yes, check it"}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => back(looked.vin)}>
            No, change the VIN
          </button>
        </div>
        {errorNote()}
      </div>
    );
  }

  return (
    // POST, so a press before the page is ready can never put a VIN in a URL.
    <form method="post" onSubmit={look} className="vc-card">
      <label className="vc-label" htmlFor="vc-vin">
        VIN <span>17 letters and numbers</span>
      </label>
      {/* Not controlled by React: what is typed before the page wakes up stays typed. */}
      <input
        ref={input}
        id="vc-vin"
        name="vin"
        defaultValue={view.vin}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={24}
        placeholder="e.g. 1HGCM82633A004352"
        className="vc-input"
        aria-invalid={view.error ? true : undefined}
        aria-describedby={view.error ? "vc-vin-error" : undefined}
        required
      />
      {/* Only a bot fills this in. */}
      <div aria-hidden style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Leave this empty <input type="text" name="leave_empty" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {errorNote("vc-vin-error")}
      <button type="submit" className="btn btn-primary vc-primary" disabled={busy !== null || !hydrated}>
        {busy === "look" ? "Looking it up…" : "Check this VIN"}
      </button>
      <details className="vc-help">
        <summary>Where do I find the VIN?</summary>
        <p>
          Look through the windshield at the bottom corner on the driver&rsquo;s side, or on
          the driver&rsquo;s door frame. It&rsquo;s also on the registration and the
          insurance card.
        </p>
      </details>
    </form>
  );
}

/** "Couldn't load", and a way to ask again: each check of the car costs one of the day's lookups. */
function Unloaded({
  what,
  retrying,
  onRetry,
}: {
  what: string;
  retrying: boolean;
  onRetry?: () => void;
}) {
  return (
    <>
      <p className="vc-muted">Couldn&rsquo;t load {what} from NHTSA just now.</p>
      <button type="button" className="btn btn-outline vc-copy" disabled={!onRetry} onClick={onRetry}>
        {retrying ? "Checking again…" : "Check again"}
      </button>
    </>
  );
}

function Results({
  checked,
  locale,
  market,
  contactHref,
  heading,
  error,
  retrying,
  onRetry,
  onAnother,
}: {
  checked: Checked;
  locale: string;
  market: string;
  contactHref: string;
  heading: React.RefObject<HTMLHeadingElement | null>;
  error: React.ReactNode;
  retrying: boolean;
  onRetry?: () => void;
  onAnother: () => void;
}) {
  const { car, vin, recalls, complaints, ratings } = checked;
  const model = modelName(car);
  const [copied, setCopied] = useState(false);
  const copyVin = async () => {
    try {
      await navigator.clipboard.writeText(vin);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Refused; the VIN is on screen to select by hand.
    }
  };
  const asOf = checked.asOf
    ? new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }).format(
        new Date(checked.asOf),
      )
    : null;
  // Recalls filed under another name ("C300" for a C-Class) are labeled with it.
  const recallModel =
    recalls && recalls.foundUnder.length > 0 && !recalls.foundUnder.includes(car.model ?? "")
      ? modelName(car, joinAnd(recalls.foundUnder))
      : model;
  const complaintModel =
    complaints && complaints.foundUnder.length > 0 && !complaints.foundUnder.includes(car.model ?? "")
      ? modelName(car, joinAnd(complaints.foundUnder))
      : model;

  return (
    <div className="vc-results">
      <div className="vc-card">
        <p className="vc-eyebrow">Free check{asOf ? ` · NHTSA data as of ${asOf}` : ""}</p>
        <h2 className="vc-car" ref={heading} tabIndex={-1}>
          {carName(car)}
        </h2>
        <p className="vc-facts">
          VIN <code>{vin}</code>{" "}
          <button type="button" className="vc-link-button" onClick={copyVin}>
            {copied ? "Copied" : "Copy VIN"}
          </button>
        </p>
        {error}
      </div>

      {recalls ? (
        <Recalls list={recalls.list} model={recallModel} locale={locale} />
      ) : (
        <section className="vc-card">
          <h3 className="vc-h">Recalls</h3>
          <Unloaded what="recalls" retrying={retrying} onRetry={onRetry} />
        </section>
      )}

      <section className="vc-card">
        <h3 className="vc-h">Owner complaints</h3>
        {!complaints ? (
          <Unloaded what="complaints" retrying={retrying} onRetry={onRetry} />
        ) : complaints.total === 0 ? (
          <p>No complaints on file with NHTSA for the {model}.</p>
        ) : (
          <>
            <p className="vc-big">
              {complaints.total.toLocaleString(locale)}{" "}
              <span>complaint{complaints.total === 1 ? "" : "s"}</span>
            </p>
            <p className="vc-facts">
              For the {complaintModel}: {complaints.crashes} involved a crash · {complaints.fires} a fire ·{" "}
              {complaints.injuries} injur{complaints.injuries === 1 ? "y" : "ies"} reported
            </p>
            {complaints.topParts.length > 0 && (
              <ul className="vc-parts">
                {complaints.topParts.map((p) => (
                  <li key={p.part}>
                    <span>{titleCase(p.part)}</span> <strong>{p.count.toLocaleString(locale)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <p className="vc-note">
          Problems owners reported to NHTSA for this model year. These are reports, not proven defects.
        </p>
      </section>

      <section className="vc-card">
        <h3 className="vc-h">Crash-test stars</h3>
        {!ratings ? (
          <Unloaded what="crash-test stars" retrying={retrying} onRetry={onRetry} />
        ) : ratings.versions.length === 0 ? (
          <p className="vc-muted">
            We couldn&rsquo;t find crash-test stars for the {model}. NHTSA may list it under another
            name: search for it at{" "}
            <a href="https://www.nhtsa.gov/ratings" target="_blank" rel="noopener noreferrer">
              nhtsa.gov/ratings
            </a>
            .
          </p>
        ) : (
          <Stars ratings={ratings} model={model} />
        )}
      </section>

      <section className="vc-card">
        <h3 className="vc-h">Check this exact car</h3>
        <p className="vc-facts">
          These sites run their own checks, not Adedayo Aremu Autos. Tap Copy VIN, then paste it on their site.
        </p>
        <ul className="vc-out">
          <li>
            <a href="https://www.nhtsa.gov/recalls" target="_blank" rel="noopener noreferrer">
              Open recalls on this car <span>NHTSA · free</span>
            </a>
          </li>
          <li>
            <a href="https://www.nicb.org/vincheck" target="_blank" rel="noopener noreferrer">
              Theft and insurance total-loss records <span>NICB · free, 5 checks a day</span>
            </a>
          </li>
          <li>
            <a
              href="https://vehiclehistory.bja.ojp.gov/nmvtis_vehiclehistory"
              target="_blank"
              rel="noopener noreferrer"
            >
              Title history <span>Government-approved providers · paid, usually a few dollars</span>
            </a>
          </li>
        </ul>
        <button type="button" className="btn btn-outline vc-copy" onClick={copyVin}>
          <i className="fas fa-copy" aria-hidden="true" /> {copied ? "VIN copied" : "Copy VIN"}
        </button>
      </section>

      <section className="vc-card vc-cta">
        <h3 className="vc-h">Need a car?</h3>
        <div className="vc-actions">
          <a className="btn btn-primary vc-primary" href={`/${market}/rentals`}>
            See cars for rent
          </a>
          <a className="btn btn-outline" href={`/${market}/inventory`}>
            See cars for sale
          </a>
        </div>
      </section>

      <p className="vc-footnote">
        Vehicle data comes from NHTSA, the National Highway Traffic Safety Administration. We can&rsquo;t
        promise it&rsquo;s complete or correct. See a mistake? <a href={contactHref}>Tell us</a>.
      </p>
      <button type="button" className="btn btn-outline vc-again" onClick={onAnother}>
        Check another car
      </button>
    </div>
  );
}

const STAR_ROWS = [
  ["Overall", "overall"],
  ["Front crash", "front"],
  ["Side crash", "side"],
  ["Rollover", "rollover"],
] as const;

function starsOf(v: RatedVersion): string {
  return STAR_ROWS.map(([, k]) => v[k] ?? "-").join("|");
}

/** The maker's own name for a cab, when NHTSA's name has one before its code. */
const NAMED_CAB =
  /\b(Super ?Crew|Super ?Cab|Crew ?Max|Crew Cab|King Cab|Access Cab|Double Cab|Quad Cab|Mega Cab|Regular Cab)\s+PU\/(?:CC|EC|RC)\b/gi;

/** Capitals that are names or abbreviations people know, left as they are. */
const KEEP_CAPS = new Set(["MINI", "AMG", "SUV", "AWD", "FWD", "RWD", "4WD", "2WD", "BMW", "GMC", "RAM", "SRT", "TRX"]);

/**
 * NHTSA's shorthand in words: "Super Crew PU/CC 4x4" -> "Super Crew 4WD",
 * "Crew PU/CC 4WD" -> "Crew Cab 4WD", "5 HB FWD" -> "5-door hatchback FWD",
 * "C RWD" -> "convertible RWD", "HEV" -> "hybrid", "W/ SAB" -> "with side
 * air bags", "TOYOTA TUNDRA" -> "Toyota Tundra". "Later Release" stays, as
 * "built later": it is what tells two versions apart.
 */
function plainVersion(description: string): string {
  let d = description
    .replace(/\b(?:early|earlier) release\b/gi, "built earlier")
    .replace(/\blater release\b/gi, "built later")
    .replace(/\bw\/o\s*(rear\s+)?sab'?s?\b/gi, (_, rear?: string) => `without ${rear ? "rear " : ""}side air bags`)
    .replace(/\bw\/\s*(rear\s+)?(?:seat\s+)?sab'?s?\b/gi, (_, rear?: string) => `with ${rear ? "rear " : ""}side air bags`)
    .replace(NAMED_CAB, "$1")
    .replace(/\b(Crew|Quad|Regular|Double|Extended|King|Access|Mega)\s+PU\/(?:CC|EC|RC)\b/gi, "$1 Cab");
  // The maker's cab name is already there ("Super Crew Diesel PU/CC"): the
  // code would name the cab twice.
  if (/\b(Cab|Crew|CrewMax|Super ?Crew|Super ?Cab)\b/i.test(d)) d = d.replace(/\s*PU\/(?:CC|EC|RC)\b/gi, "");
  d = d
    .replace(/\bPU\/CC\b/gi, "crew cab")
    .replace(/\bPU\/EC\b/gi, "extended cab")
    .replace(/\bPU\/RC\b/gi, "regular cab")
    .replace(/\b(\d)\s*DR\b/gi, "$1-door")
    .replace(/\b(\d)\s*HB\b/gi, "$1-door hatchback")
    .replace(/\bHB\b/gi, "hatchback")
    .replace(/\bSW\b/gi, "wagon")
    .replace(/\bVAN\b/g, "van")
    .replace(/\bPHEV\b/g, "plug-in hybrid")
    .replace(/\bHEV\b/g, "hybrid")
    .replace(/\bBEV\b/g, "electric")
    .replace(/\s+C\s+(?=(?:AWD|4WD|FWD|RWD|2WD|4x4|4x2)\b)/i, " convertible ")
    .replace(/\b4x4\b/gi, "4WD")
    .replace(/\b4x2\b/gi, "2WD")
    .replace(/\s{2,}/g, " ")
    .trim();
  return d
    .split(" ")
    .map((w) => (/^[A-Z]{4,}$/.test(w) && !KEEP_CAPS.has(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w))
    .join(" ")
    .replace(/\bXdrive\b/g, "xDrive")
    .replace(/\bSdrive\b/g, "sDrive");
}

/** Words that describe a version rather than name the model. */
const VERSION_WORD = /^(suv|van|wagon|hatchback|convertible|crew|extended|regular|cab|\d-door|awd|fwd|rwd|4wd|2wd|built|with|without|plug-in|hybrid|electric)$/i;

/**
 * The model's part of the shared start: "2022 Nissan Rogue", not "2022
 * Nissan Rogue SUV FWD built" when the versions differ only in "built
 * later" and "built earlier".
 */
function modelPart(start: string): string {
  const words = start ? start.split(" ") : [];
  const cut = words.findIndex((w) => VERSION_WORD.test(w));
  return (cut >= 0 ? words.slice(0, cut) : words).join(" ");
}

/** The words every description starts with ("2019 Chevrolet Silverado 1500"), left off a list. */
function sharedStart(descriptions: string[]): string {
  const split = descriptions.map((d) => d.split(" "));
  const words: string[] = [];
  for (let i = 0; split.every((w) => i < w.length - 1 && w[i] === split[0][i]); i++) words.push(split[0][i]);
  return words.join(" ");
}

function StarRow({ value }: { value: string }) {
  const n = Number(value);
  // One image with one name, so a screen reader says "4 of 5 stars", not
  // five "black star"s. Hollow stars for the rest still read in high contrast.
  return (
    <dd>
      <span role="img" aria-label={`${value} of 5 stars`}>
        {"★".repeat(n)}
        <span className="vc-star-off">{"☆".repeat(Math.max(0, 5 - n))}</span>
      </span>
    </dd>
  );
}

/**
 * The stars for the versions that match this car. One set when they agree.
 * When they don't, the ratings they share once, then each version with the
 * ratings that differ — never one version's stars presented as another's,
 * and never "Not rated" for a version that has some stars. When more
 * versions match than could be fetched, none are offered as the choices.
 */
function Stars({ ratings, model }: { ratings: CrashRatings; model: string }) {
  const { versions, matched } = ratings;
  if (matched > versions.length) {
    return (
      <p className="vc-muted">
        NHTSA rates more versions of the {model} than we can show here, and the VIN doesn&rsquo;t say
        which one this is. See them all at{" "}
        <a href="https://www.nhtsa.gov/ratings" target="_blank" rel="noopener noreferrer">
          nhtsa.gov/ratings
        </a>
        .
      </p>
    );
  }

  const agree = new Set(versions.map(starsOf)).size === 1;
  const v = versions[0];
  const rated = STAR_ROWS.filter(([, k]) => v[k]);
  const plain = versions.map((x) => plainVersion(x.description));

  if (agree) {
    if (rated.length === 0) {
      // Often a car from before 2011, rated under NHTSA's older system.
      return <p className="vc-muted">NHTSA has no 5-Star ratings on file for this version.</p>;
    }
    return (
      <>
        <dl className="vc-stars">
          {rated.map(([label, k]) => (
            <div key={label}>
              <dt>{label}</dt>
              <StarRow value={v[k]!} />
            </div>
          ))}
        </dl>
        <p className="vc-facts">
          {versions.length === 1
            ? `Rated: ${plain[0]}`
            : "The same for every version of this model that matches this car."}
        </p>
        <p className="vc-note">
          NHTSA crash-test stars. Compare them only with cars of the same type and about the same weight.
        </p>
      </>
    );
  }

  const start = modelPart(sharedStart(plain));
  const same = STAR_ROWS.filter(([, k]) => v[k] && versions.every((x) => x[k] === v[k]));
  const differ = STAR_ROWS.filter(([, k]) => new Set(versions.map((x) => x[k] ?? "-")).size > 1);
  return (
    <>
      <p className="vc-facts">
        The stars for the {start || "model"} depend on the version, and the VIN doesn&rsquo;t say which.
      </p>
      {same.length > 0 && (
        <>
          <p className="vc-note">The same for every version:</p>
          <dl className="vc-stars">
            {same.map(([label, k]) => (
              <div key={label}>
                <dt>{label}</dt>
                <StarRow value={v[k]!} />
              </div>
            ))}
          </dl>
        </>
      )}
      <ul className="vc-versions">
        {versions.map((x, i) => (
          <li key={`${i}:${x.description}`}>
            <p className="vc-version-name">{plain[i].slice(start.length).trim() || plain[i]}</p>
            {STAR_ROWS.some(([, k]) => x[k]) ? (
              <dl className="vc-stars">
                {differ.map(([label, k]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    {x[k] ? <StarRow value={x[k]!} /> : <dd className="vc-muted">Not rated</dd>}
                  </div>
                ))}
              </dl>
            ) : (
              <p className="vc-muted">Not rated</p>
            )}
          </li>
        ))}
      </ul>
      <p className="vc-note">
        NHTSA crash-test stars. Compare them only with cars of the same type and about the same weight.
      </p>
    </>
  );
}

/** The newest few recalls, then the rest on request: a popular model can have twenty or more. */
const FIRST_RECALLS = 5;

function Recalls({
  list,
  model,
  locale,
}: {
  list: ModelRecall[];
  model: string;
  locale: string;
}) {
  // YYYY-MM-DD from the server, shown the way the reader writes dates.
  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  const [showAll, setShowAll] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  // The button that was pressed is gone; focus goes to the first recall it
  // revealed, so the reader carries on from where they were.
  useEffect(() => {
    if (showAll) listRef.current?.querySelectorAll("summary")[FIRST_RECALLS]?.focus();
  }, [showAll]);

  const urgent = list.some((r) => r.parkIt || r.parkOutside);
  return (
    <section className="vc-card">
      <h3 className="vc-h">Recalls for this model</h3>
      {list.length === 0 ? (
        <p>
          NHTSA lists no recalls for the {model}. To be sure about this exact car, check its VIN at{" "}
          <a href="https://www.nhtsa.gov/recalls" target="_blank" rel="noopener noreferrer">
            nhtsa.gov/recalls
          </a>
          .
        </p>
      ) : (
        <>
          <p className="vc-big">
            {list.length} <span>recall{list.length === 1 ? "" : "s"}</span>
          </p>
          {urgent && (
            <p className="vc-warn">
              Some {model} cars are under a recall that says not to drive them, or to park them
              outside, until they&rsquo;re fixed. Check this car&rsquo;s VIN at nhtsa.gov/recalls
              before you drive it.
            </p>
          )}
          <p className="vc-facts">
            {list.length} recall{list.length === 1 ? " was" : "s were"} issued for the {model}. Some may
            not apply to this car, and some may already be fixed. Check this car&rsquo;s VIN for free at{" "}
            <a href="https://www.nhtsa.gov/recalls" target="_blank" rel="noopener noreferrer">
              nhtsa.gov/recalls
            </a>
            .
          </p>
          <ul className="vc-recalls" ref={listRef}>
            {(showAll ? list : list.slice(0, FIRST_RECALLS)).map((r) => (
              <li key={r.campaign}>
                <details>
                  <summary>
                    <span>{r.component ? titleCase(r.component.split(":")[0]) : "Recall"}</span>
                    {r.date && <small>{when(r.date)}</small>}
                  </summary>
                  {r.summary && <p>{r.summary}</p>}
                  {r.remedy && (
                    <p>
                      <strong>The fix:</strong> {r.remedy}
                    </p>
                  )}
                  <p className="vc-note">NHTSA campaign {r.campaign}</p>
                </details>
              </li>
            ))}
          </ul>
          {!showAll && list.length > FIRST_RECALLS && (
            <button type="button" className="btn btn-outline vc-copy" onClick={() => setShowAll(true)}>
              Show all {list.length} recalls
            </button>
          )}
        </>
      )}
    </section>
  );
}
