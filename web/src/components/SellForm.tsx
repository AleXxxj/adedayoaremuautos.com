"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { lookUpVin, type LookUpResult } from "@/lib/actions/vinCheck";
import { submitSellRequest, type SellResult } from "@/lib/actions/sell";
import { useActionToast, dismissErrorToasts } from "@/components/Toast";
import { useFormTimer } from "@/lib/useFormTimer";
import { displayPhone } from "@/lib/phoneDisplay";
import { checkVin } from "@/lib/vin/validate";
import type { MarketConfig } from "@/lib/market";
import {
  ACCIDENT,
  COMMON_MAKES,
  CONDITIONS,
  KEYS,
  LIGHTS,
  STEP_TITLES,
  WANTS,
  carName,
  cleanModel,
  decodedMake,
  photosLine,
  replyChoices,
  replyPromise,
  routeForResult,
  sellMessages,
  stepProblem,
  titleChoices,
  yearOptions,
  type CarMode,
  type Choice,
  type Problem,
  type Snapshot,
  type Step,
} from "@/components/sellSteps";

/**
 * The answer to Send, plus the failures the server never gets to report.
 *
 * "unconfirmed" is not "not sent": a phone can lose the reply after the
 * request was saved, so the owner is told only what is known. "reload" is
 * the page being out of date after a release, when every retry fails the
 * same way.
 */
type FormState = (SellResult & { sendFailed?: "unconfirmed" | "reload" }) | null;

/** The car NHTSA decoded the VIN as. */
type Looked = { vin: string; year: number; make: string; model: string; trim: string | null };

/*
 * Each step gets its own history entry at the same address, so the Back
 * gesture on a phone goes back a step instead of leaving the page with
 * everything typed. The rental booking form does the same
 * (RentalBookingForm.tsx); Next.js keeps entries like these through its own
 * back and forward handling.
 */
type Nav = {
  step: Step;
  /** The step before this change. */
  prev: Step;
  /** The furthest step reached: Forward goes no further than this. */
  max: Step;
  /** A field or "@…" control to focus, or null for the step's heading. */
  focus: string | null;
  /** Counts changes, so focusing the same thing again still runs the effect. */
  seq: number;
  history: "push" | "back" | "none";
};
const START: Nav = { step: 1, prev: 1, max: 1, focus: null, seq: 0, history: "none" };

/** A step's history entry, kept beside Next.js's own state. */
type StepEntry = { flow?: string; step?: number };

const FAILED = "Something went wrong. Please try again.";

/** Single-line fields that Enter moves on from. */
const SINGLE = ["text", "tel", "email", "search", "url"];

/** What was sent, for the confirmation and the text-us fallback. */
type Sent = { firstName: string; name: string; replyBy: string; car: string };

/**
 * Sell your car: four short steps, one question group each, then a
 * confirmation with a reference.
 *
 * The fields are not controlled by React. What is typed before the page's
 * scripts arrive stays typed, and every step reads the form itself
 * (FormData), so nothing can disagree with what is on screen. All four
 * steps stay mounted, each one hidden until it is reached, so moving
 * between them loses nothing and the server's answer can name any field.
 * Nothing is disabled to hide it, except the boxes for typing the car in
 * while the car comes from its VIN, so that only one car is ever sent.
 *
 * Next is disabled until the page has hydrated, as on the car check and the
 * booking form: before then a tap would do nothing, and a form timed from a
 * later start would be mistaken for a bot.
 *
 * `lookUp` and `send` stand in for the two server actions in a test harness.
 * The page never passes them.
 */
export function SellForm({
  market,
  contactPhone,
  maxYear,
  lookUp,
  send,
}: {
  market: MarketConfig;
  /** The showroom line in +1… form, or null when none is on file. */
  contactPhone: string | null;
  /** The newest model year in the year list. */
  maxYear: number;
  lookUp?: (formData: FormData) => Promise<LookUpResult>;
  send?: (formData: FormData) => Promise<SellResult>;
}) {
  const us = market.code === "us";
  const m = sellMessages(market.code);
  const uid = useId();
  const fid = (n: string) => `${uid}-${n}`;
  const eid = (n: string) => `${uid}-${n}-error`;
  const { hydrated, elapsedMs } = useFormTimer();

  const phoneLabel = displayPhone(contactPhone, market.code);
  const unconfirmedMessage = phoneLabel
    ? `We couldn't confirm that your details reached us. They're still here. Try again, or call us at ${phoneLabel}.`
    : "We couldn't confirm that your details reached us. They're still here. Try again, or contact us.";
  const reloadMessage =
    "This page was updated while you had it open. Please reload it and send your car's details again.";

  /*
   * A request that gets no answer is caught here, so it is a message beside
   * Send rather than the page's error screen with everything typed gone.
   * The previous state is not forwarded: the action never reads it.
   */
  const [state, action, pending] = useActionState<FormState, FormData>(async (_prev, fd) => {
    try {
      const r = await (send ? send(fd) : submitSellRequest(null, fd));
      // No reference is the quiet answer a bot gets: nothing was saved. A
      // person should never see it; if one does, they get a call instead.
      if (r.ok && !r.reference) return { ok: false, sendFailed: "unconfirmed", error: unconfirmedMessage };
      return r;
    } catch (e) {
      if (unstable_isUnrecognizedActionError(e)) {
        return { ok: false, sendFailed: "reload", error: reloadMessage };
      }
      return { ok: false, sendFailed: "unconfirmed", error: unconfirmedMessage };
    }
  }, null);
  // Failures only, and quiet: the form reads each message out where it
  // shows it, and the confirmation has its own heading.
  useActionToast(state?.ok ? null : state, undefined, { quiet: true });
  const isDone = Boolean(state?.ok && state.reference);

  // ── The car ───────────────────────────────────────────────────────────
  const [mode, setMode] = useState<CarMode>(us ? "vin" : "manual");
  const [looked, setLooked] = useState<Looked | null>(null);
  const [lookBusy, setLookBusy] = useState(false);
  const [lookError, setLookError] = useState<string | null>(null);
  const lookTicket = useRef(0);
  const vinRef = useRef<HTMLInputElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const confirmHeading = useRef<HTMLHeadingElement>(null);

  // ── The steps ─────────────────────────────────────────────────────────
  const [nav, setNav] = useState<Nav>(START);
  const step = nav.step;
  // The one message the form's own checks have on screen, under its field.
  const [problem, setProblem] = useState<Problem | null>(null);
  // Fields changed since the server last answered: its message for them goes.
  const [edited, setEdited] = useState<Record<string, true>>({});
  // The last result taken to its step, so each one is taken there once.
  const [seen, setSeen] = useState<FormState>(null);
  // The result whose general error is shown; any move back clears it.
  const [errorFor, setErrorFor] = useState<FormState>(null);
  const [replyBy, setReplyBy] = useState("phone");
  const [sent, setSent] = useState<Sent | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const headings = useRef<Partial<Record<Step, HTMLHeadingElement | null>>>({});
  const messagesRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  const doneHeading = useRef<HTMLHeadingElement>(null);
  const doneRef = useRef<HTMLElement>(null);
  const flow = useRef("");
  const traversing = useRef(false);
  const armUntil = useRef(0);
  const finished = useRef(false);
  const pendingRef = useRef(false);
  const landingPath = useRef("");

  /** The owner changed this field: any message about it, ours or the server's, goes. */
  const touch = (f: string) => {
    setEdited((e) => (e[f] ? e : { ...e, [f]: true }));
    setProblem((p) => (p?.field === f ? null : p));
  };

  /** Everything the step checks read, from the form itself. */
  function snapshot(): Snapshot {
    const form = formRef.current;
    const fd = form ? new FormData(form) : new FormData();
    const get = (k: string) => {
      const v = fd.get(k);
      return typeof v === "string" ? v : "";
    };
    return {
      market: market.code,
      maxYear,
      mode,
      vinText: vinRef.current?.value ?? "",
      year: get("year"),
      make: get("make"),
      model: get("model"),
      mileage: get("mileage"),
      location: get("location"),
      condition: get("condition"),
      accident: get("accident"),
      warningLights: get("warningLights"),
      title: get("title"),
      keys: get("keys"),
      wants: get("wants"),
      price: get("price"),
      notes: get("notes"),
      name: get("name"),
      phone: get("phone"),
      email: get("email"),
      replyBy: get("replyBy"),
    };
  }

  /*
   * Each answer from the server, taken to the step it is about, once. A
   * field's message goes to that field's step, with the field focused;
   * anything else is shown beside Send, with Send focused.
   */
  if (state !== seen) {
    setSeen(state);
    setEdited({});
    setProblem(null);
    if (state && !isDone) {
      const target = state.fieldErrors ? routeForResult(state.fieldErrors) : null;
      if (target) {
        setErrorFor(null);
        setNav((n) => ({
          ...n,
          step: target.step,
          prev: n.step,
          focus: target.field,
          seq: n.seq + 1,
          history: "back",
        }));
      } else {
        setErrorFor(state.sendFailed ? null : state);
        setNav((n) => ({
          ...n,
          step: 4,
          prev: n.step,
          focus: state.sendFailed === "reload" ? "@reload" : "@send",
          seq: n.seq + 1,
          history: "none",
        }));
      }
    }
  }

  /** A field's message: our own check's first, then the server's until the field is changed. */
  const fieldMsg = (f: string): string | undefined =>
    problem?.field === f ? problem.message : edited[f] ? undefined : state?.fieldErrors?.[f]?.[0];
  /** aria-invalid and aria-describedby for a field, with any hints it has. */
  const describe = (f: string, extra: (string | false | null | undefined)[] = []) => {
    const msg = fieldMsg(f);
    const ids = [...extra, msg ? eid(f) : null].filter(Boolean).join(" ");
    return { "aria-invalid": msg ? true : undefined, "aria-describedby": ids || undefined } as const;
  };

  /** Moves focus without changing step: after a lookup, or to a field. */
  const focusOn = (target: string) =>
    setNav((n) => ({ ...n, prev: n.step, focus: target, seq: n.seq + 1, history: "none" }));

  /** A check failed: its step, its field, its message. */
  function showProblem(k: Step, p: Problem) {
    setProblem(p);
    if (k < nav.step) setErrorFor(null);
    setNav((n) => ({
      ...n,
      step: k,
      prev: n.step,
      focus: p.field,
      seq: n.seq + 1,
      history: k < n.step ? "back" : k > n.step ? "push" : "none",
    }));
  }

  /** Back. Not while sending: what was sent can't change. */
  function goBackTo(target: Step) {
    if (pending || traversing.current) return;
    setProblem(null);
    setErrorFor(null);
    setNav((n) => ({ ...n, step: target, prev: n.step, focus: null, seq: n.seq + 1, history: "back" }));
  }

  function next() {
    if (!hydrated || traversing.current || performance.now() < armUntil.current) return;
    const p = stepProblem(nav.step, snapshot());
    if (p) {
      showProblem(nav.step, p);
      return;
    }
    setProblem(null);
    const target = (nav.step + 1) as Step;
    setNav((n) => ({
      ...n,
      step: target,
      prev: n.step,
      max: Math.max(n.max, target) as Step,
      focus: null,
      seq: n.seq + 1,
      history: "push",
    }));
  }

  // ── The VIN ───────────────────────────────────────────────────────────

  /**
   * "Look it up": the car check's own lookup, which counts toward the
   * visitor's daily checks. Checked here first, so a typo costs nothing and
   * is answered at once. Each lookup takes a ticket, and an answer for an
   * older one is dropped: one still on its way when the owner chose to type
   * the car in can't pull them back.
   */
  async function look() {
    if (!hydrated || lookBusy) return;
    const check = checkVin(vinRef.current?.value ?? "");
    setProblem((p) => (p?.field === "vin" ? null : p));
    if (!check.wellFormed) {
      setLookError(check.message ?? m.vinMissing);
      focusOn("vin");
      return;
    }
    const mine = ++lookTicket.current;
    setLookBusy(true);
    setLookError(null);
    const fd = new FormData();
    fd.set("vin", check.vin);
    const trap = formRef.current?.querySelector<HTMLInputElement>('input[name="leave_empty"]')?.value;
    if (trap) fd.set("leave_empty", trap);
    let r: LookUpResult;
    try {
      r = await (lookUp ? lookUp(fd) : lookUpVin(null, fd));
    } catch {
      r = { ok: false, error: FAILED };
    }
    if (mine !== lookTicket.current) return;
    setLookBusy(false);
    const car = r.ok ? r.car : undefined;
    if (r.ok && r.vin && car?.year && car.make && car.model) {
      setLooked({
        vin: r.vin,
        year: car.year,
        make: decodedMake(car.make),
        model: cleanModel(car.model),
        trim: car.trim?.trim() || null,
      });
      setMode("confirm");
      focusOn("@confirm");
    } else {
      setLookError(r.error ?? FAILED);
      focusOn("vin");
    }
  }

  /** "Yes, that's it": on to the miles, in the same tap, so a phone opens its keyboard there. */
  function confirmYes() {
    flushSync(() => {
      setMode("found");
      setProblem(null);
      touch("confirm");
    });
    const el = formRef.current?.querySelector<HTMLInputElement>('input[name="mileage"]');
    el?.scrollIntoView({ block: "center" });
    el?.focus({ preventScroll: true });
  }

  /** From the VIN to typing the car in. */
  function typeInstead() {
    lookTicket.current++;
    setLookBusy(false);
    setLookError(null);
    setLooked(null);
    setProblem(null);
    setMode("manual");
    focusOn("year");
  }

  /** From the car found back to the VIN box, with the VIN still in it. */
  function changeCar() {
    lookTicket.current++;
    setLooked(null);
    setProblem(null);
    setMode("vin");
    focusOn("vin");
  }

  /** From typing the car in back to the VIN. */
  function useVin() {
    setProblem(null);
    setMode("vin");
    focusOn("vin");
  }

  /** The control to focus for a field a check or the server named. */
  function controlFor(field: string): HTMLElement | null {
    const form = formRef.current;
    if (!form) return null;
    const carField = ["vin", "found", "confirm", "year", "make", "model", "trim"].includes(field);
    if (carField && mode !== "manual") {
      if (mode === "confirm") return yesRef.current;
      if (mode === "found") return changeRef.current;
      return vinRef.current;
    }
    const radios = form.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${field}"]`);
    if (radios.length) return [...radios].find((r) => r.checked) ?? radios[0];
    return form.querySelector<HTMLElement>(`[name="${field}"]`);
  }

  // ── Sending ───────────────────────────────────────────────────────────

  /**
   * Only Send, on the last step, submits. Every step is checked again first:
   * a field can be changed after its step was passed.
   */
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (nav.step !== 4 || pending || !hydrated) return;
    if (performance.now() < armUntil.current) return;
    const snap = snapshot();
    for (const k of [1, 2, 3, 4] as Step[]) {
      const p = stepProblem(k, snap);
      if (p) {
        showProblem(k, p);
        return;
      }
    }
    const fd = new FormData(e.currentTarget);
    fd.set("elapsedMs", String(elapsedMs()));
    fd.set("landingPath", landingPath.current);
    const name = snap.name.replace(/\s+/g, " ").trim();
    setSent({
      firstName: name.split(" ")[0] ?? "",
      name,
      replyBy: snap.replyBy,
      car:
        mode === "found" && looked
          ? carName(looked)
          : carName({ year: snap.year, make: snap.make, model: snap.model }),
    });
    setErrorFor(null);
    startTransition(() => action(fd));
  }

  /*
   * Enter moves to the next box on its step; from the last box on the first
   * three steps it is Next, and in the VIN box it is "Look it up". It never
   * submits from a step where Send is not even showing.
   */
  function onKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !SINGLE.includes(t.type)) return;
    if (t === vinRef.current) {
      e.preventDefault();
      void look();
      return;
    }
    const section = t.closest<HTMLElement>("[data-step]");
    if (!section) return;
    const list = [...section.querySelectorAll("input")].filter(
      (el) => SINGLE.includes(el.type) && !el.disabled && !el.closest("[hidden]") && el !== vinRef.current,
    );
    const i = list.indexOf(t);
    if (i >= 0 && i < list.length - 1) {
      e.preventDefault();
      list[i + 1].focus();
    } else if (nav.step < 4) {
      e.preventDefault();
      next();
    }
    // The last box on the last step: Enter sends, as on any form.
  }

  // Copies for the listeners below, which outlive any one render.
  useEffect(() => {
    finished.current = isDone;
    pendingRef.current = pending;
  });

  useEffect(() => {
    landingPath.current = window.location.pathname;
    // This visit's entries, told apart from an earlier visit's.
    flow.current = window.crypto?.randomUUID?.() ?? String(Math.random()).slice(2);
    window.history.replaceState(
      { ...window.history.state, aaaSell: { flow: flow.current, step: 1 } },
      "",
    );
    const onPop = (e: PopStateEvent) => {
      // The form's own history.go, after Back: already where it should be.
      if (traversing.current) {
        traversing.current = false;
        return;
      }
      const entry = e.state?.aaaSell as StepEntry | undefined;
      if (!entry || entry.flow !== flow.current || typeof entry.step !== "number") return;
      const s = entry.step;
      // Sent: one Back leaves the page rather than walking back through
      // steps that are gone.
      if (finished.current) {
        if (s > 1) window.history.go(1 - s);
        else window.history.back();
        return;
      }
      if (pendingRef.current) return;
      setProblem(null);
      setErrorFor(null);
      setNav((n) => {
        const t = Math.min(s, n.max) as Step;
        return t === n.step ? n : { ...n, step: t, prev: n.step, focus: null, seq: n.seq + 1, history: "none" };
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /*
   * After every step change, before the screen is painted: the history
   * entry, the double-tap guard, and where focus goes — a field, a control,
   * or the step's heading.
   */
  useLayoutEffect(() => {
    if (nav.seq === 0) return;
    if (flow.current) {
      const here = window.history.state?.aaaSell as StepEntry | undefined;
      if (nav.history === "push") {
        for (let k = nav.prev + 1; k <= nav.step; k++) {
          window.history.pushState(
            { ...window.history.state, aaaSell: { flow: flow.current, step: k } },
            "",
          );
        }
      } else if (nav.history === "back" && here?.flow === flow.current && typeof here.step === "number") {
        if (here.step > nav.step) {
          traversing.current = true;
          window.setTimeout(() => {
            traversing.current = false;
          }, 500);
          window.history.go(nav.step - here.step);
        } else if (here.step !== nav.step) {
          window.history.replaceState(
            { ...window.history.state, aaaSell: { flow: flow.current, step: nav.step } },
            "",
          );
        }
      }
    }
    // A second tap on the same spot lands on whatever replaced the button.
    if (nav.step !== nav.prev) armUntil.current = performance.now() + 500;

    const form = formRef.current;
    if (!form) return;
    const f = nav.focus;
    let target: HTMLElement | null = null;
    if (f === "@send" || f === "@reload") {
      target =
        f === "@reload"
          ? form.querySelector<HTMLElement>('[data-action="reload"]')
          : sendRef.current;
      // The message sits directly above Send: bringing Send into view, clear
      // of the tab bar (scroll-margin, sell.css), shows both.
      (sendRef.current ?? messagesRef.current)?.scrollIntoView({ block: "nearest" });
    } else if (f === "@confirm") {
      target = confirmHeading.current;
      target?.scrollIntoView({ block: "center" });
    } else if (f) {
      target = controlFor(f);
      target?.scrollIntoView({ block: "center" });
    }
    if (!target) {
      // The panel's top, so the progress bar above the heading shows too.
      form.scrollIntoView({ block: "start" });
      target = headings.current[nav.step] ?? null;
    }
    target?.focus({ preventScroll: true });
    // controlFor reads the car's mode, which changes with nav; nav is what
    // this follows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav]);

  /*
   * The confirmation replaces the form, from its top, which on a phone is
   * well above the Send button just pressed. Brought into view, its heading
   * focused, so it is seen and read out.
   */
  useEffect(() => {
    if (!isDone) return;
    dismissErrorToasts();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    doneRef.current?.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
    doneHeading.current?.focus({ preventScroll: true });
  }, [isDone]);

  if (isDone && state?.reference) {
    return (
      <section className="sell-panel sell-done" ref={doneRef} aria-labelledby={fid("done")}>
        <i className="fas fa-circle-check sell-done-icon" aria-hidden="true" />
        <h2 className="sell-done-title" id={fid("done")} ref={doneHeading} tabIndex={-1}>
          {sent?.firstName ? `Thanks, ${sent.firstName}.` : "Thanks."} We got your car&rsquo;s details.
        </h2>
        <p className="sell-done-text">{replyPromise(sent?.replyBy ?? "phone")}</p>
        <p className="sell-done-ref">
          Your reference: <strong>{state.reference}</strong>
        </p>
        <div className="sell-done-actions">
          <Link href={`/${market.code}/inventory`} className="sell-btn sell-btn--primary">
            See cars for sale
          </Link>
          <Link href={`/${market.code}`} className="sell-btn sell-btn--outline">
            Back to home
          </Link>
        </div>
      </section>
    );
  }

  // ── What is on screen ─────────────────────────────────────────────────

  const generalText =
    errorFor === state && state && !state.sendFailed
      ? (state.error ?? (state.fieldErrors ? m.reload : null))
      : null;
  // Heard when a step change moves focus to a field rather than the heading.
  const stepNote =
    nav.focus && !nav.focus.startsWith("@") && nav.step !== nav.prev
      ? `Step ${nav.step} of 4: ${STEP_TITLES[nav.step]}`
      : "";

  // The way out when sending fails: a call, or a text with the car and the
  // name already written.
  const smsBody =
    `Hi, I'd like to sell my ${sent?.car || "car"}.` + (sent?.name ? ` My name is ${sent.name}.` : "");
  const telHref = contactPhone ? `tel:${contactPhone}` : null;
  // "?&body=" is the form both iPhone and Android Messages read.
  const smsHref = contactPhone ? `sms:${contactPhone}?&body=${encodeURIComponent(smsBody)}` : null;
  const callUs = (
    <div className="sell-alert-actions">
      {telHref && smsHref ? (
        <>
          <a className="sell-btn sell-btn--outline sell-btn--small" href={telHref}>
            <i className="fas fa-phone" aria-hidden="true" /> Call us
          </a>
          <a className="sell-btn sell-btn--outline sell-btn--small" href={smsHref}>
            <i className="fas fa-comment-sms" aria-hidden="true" /> Text us
          </a>
        </>
      ) : (
        <Link className="sell-btn sell-btn--outline sell-btn--small" href={`/${market.code}/contact`}>
          <i className="fas fa-envelope" aria-hidden="true" /> Contact us
        </Link>
      )}
    </div>
  );

  /** "‹ Back", on every step after the first. */
  const back = (n: Step) =>
    n > 1 ? (
      <button
        type="button"
        className="sell-back"
        disabled={!hydrated || pending}
        onClick={() => goBackTo((n - 1) as Step)}
      >
        <i className="fas fa-chevron-left" aria-hidden="true" /> Back
        <span className="sell-sr"> to {STEP_TITLES[(n - 1) as Step].toLowerCase()}</span>
      </button>
    ) : null;

  /** The step's legend and heading: where focus goes when a step opens. */
  const legend = (n: Step) => (
    <legend className="sell-legend">
      <h2
        className="sell-step-title"
        id={fid(`step-${n}`)}
        tabIndex={-1}
        ref={(el) => {
          headings.current[n] = el;
        }}
      >
        <span className="sell-step-count">Step {n} of 4</span>
        <span className="sell-sr">, </span>
        {STEP_TITLES[n]}
      </h2>
    </legend>
  );

  const nextButton = (
    <div className="sell-actions">
      <button type="button" className="sell-btn sell-btn--primary sell-btn--wide" disabled={!hydrated} onClick={next}>
        {hydrated ? "Next" : "Loading…"}
        {hydrated && <i className="fas fa-arrow-right" aria-hidden="true" />}
      </button>
    </div>
  );

  const vinMsg = lookError ?? fieldMsg("vin");
  const foundMsg =
    fieldMsg("found") ?? fieldMsg("vin") ?? fieldMsg("year") ?? fieldMsg("make") ?? fieldMsg("model");
  const confirmMsg = fieldMsg("confirm");
  const manual = mode === "manual";
  // The miles, where it is and Next come once the car is known, so each
  // moment has one thing to do: look up the VIN, answer "Is this your
  // car?", or carry on.
  const carKnown = mode === "found" || manual;

  return (
    /*
     * onSubmit, not action={…}: React resets a form after an `action` prop
     * runs, which would clear every answer the moment the server said "fix
     * this one". method="post" so that a submit before the page wakes up
     * could never put what was typed in the address bar; Next and Send are
     * disabled until then anyway. noValidate: the steps check the fields
     * themselves, with messages beside them, and a hidden step's field
     * can't show the browser's bubble.
     */
    <form
      ref={formRef}
      method="post"
      noValidate
      onSubmit={onSubmit}
      onKeyDown={onKeyDown}
      className="sell-panel sell-form"
      aria-label="Your car's details"
    >
      <input type="hidden" name="marketCode" value={market.code} />
      {/* Only a bot fills this in. */}
      <div aria-hidden="true" className="sell-trap">
        <label>
          Leave this empty <input type="text" name="leave_empty" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <noscript>
        <p className="sell-alert">
          {phoneLabel
            ? `This form needs JavaScript. Call us at ${phoneLabel} about your car.`
            : "This form needs JavaScript. Please contact us about your car."}
        </p>
      </noscript>

      <div className="sell-progress" aria-hidden="true">
        {([1, 2, 3, 4] as const).map((k) => (
          <span key={k} className={k <= step ? "is-on" : undefined} />
        ))}
      </div>

      <span className="sell-sr" role="status">
        {stepNote}
      </span>

      {/* ── Step 1: the car ───────────────────────────────────────────── */}
      <div className="sell-step" data-step="1" hidden={step !== 1}>
        <fieldset className="sell-fieldset">
          {legend(1)}
          <div className="sell-step-body">
            {us && (
              <>
                <div className="sell-field" hidden={mode !== "vin"}>
                  <label className="sell-label" htmlFor={fid("vin")}>
                    Fastest: type the VIN
                  </label>
                  <p className="sell-hint" id={fid("vin-hint")}>
                    17 letters and numbers. It&rsquo;s on the driver&rsquo;s door frame, or at the
                    bottom of the windshield.
                  </p>
                  {/* No name: only a VIN the owner has confirmed is sent, below. */}
                  <input
                    ref={vinRef}
                    id={fid("vin")}
                    className="sell-input sell-input--vin"
                    autoComplete="off"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={24}
                    enterKeyHint="search"
                    onInput={() => {
                      setLookError(null);
                      touch("vin");
                    }}
                    aria-invalid={vinMsg ? true : undefined}
                    aria-describedby={[fid("vin-hint"), vinMsg ? eid("vin") : null].filter(Boolean).join(" ")}
                  />
                  <Err id={eid("vin")} alert>
                    {vinMsg}
                  </Err>
                  <button
                    type="button"
                    className="sell-btn sell-btn--primary sell-btn--wide"
                    disabled={!hydrated || lookBusy}
                    onClick={() => void look()}
                  >
                    {lookBusy ? (
                      <>
                        <i className="fas fa-spinner fa-spin" aria-hidden="true" /> Looking it up…
                      </>
                    ) : (
                      <>
                        <i className="fas fa-magnifying-glass" aria-hidden="true" /> Look it up
                      </>
                    )}
                  </button>
                  <span className="sell-sr" role="status">
                    {lookBusy ? "Looking up your VIN…" : ""}
                  </span>
                  <button type="button" className="sell-link" disabled={!hydrated} onClick={typeInstead}>
                    No VIN? Type it in
                  </button>
                </div>

                {mode === "confirm" && looked && (
                  <div className="sell-found">
                    <h3 className="sell-found-title" ref={confirmHeading} tabIndex={-1}>
                      <span className="sell-found-ask">Is this your car?</span>{" "}
                      <span className="sell-found-car">{carName(looked)}</span>
                    </h3>
                    <p className="sell-found-vin">VIN {looked.vin}</p>
                    <div className="sell-found-actions">
                      <button
                        ref={yesRef}
                        type="button"
                        className="sell-btn sell-btn--primary"
                        onClick={confirmYes}
                        aria-describedby={confirmMsg ? eid("confirm") : undefined}
                      >
                        Yes, that&rsquo;s it
                      </button>
                      <button type="button" className="sell-btn sell-btn--outline" onClick={typeInstead}>
                        No, type it in instead
                      </button>
                    </div>
                    <Err id={eid("confirm")}>{confirmMsg}</Err>
                  </div>
                )}

                {mode === "found" && looked && (
                  <div className="sell-chosen">
                    <i className="fas fa-circle-check" aria-hidden="true" />
                    <div className="sell-chosen-text">
                      <p className="sell-chosen-car">{carName(looked)}</p>
                      <p className="sell-chosen-vin">VIN {looked.vin}</p>
                      <button
                        ref={changeRef}
                        type="button"
                        className="sell-link"
                        onClick={changeCar}
                        aria-describedby={foundMsg ? eid("found") : undefined}
                      >
                        Change<span className="sell-sr"> the car</span>
                      </button>
                      <Err id={eid("found")}>{foundMsg}</Err>
                    </div>
                    <input type="hidden" name="vin" value={looked.vin} />
                    <input type="hidden" name="year" value={looked.year} />
                    <input type="hidden" name="make" value={looked.make} />
                    <input type="hidden" name="model" value={looked.model} />
                    {looked.trim && <input type="hidden" name="trim" value={looked.trim} />}
                  </div>
                )}
              </>
            )}

            {/* Typing the car in. Disabled while the car comes from its VIN,
                so only one car is ever sent; disabled boxes keep what was
                typed in them. */}
            <div className="sell-manual" hidden={!manual}>
              <div className="sell-field">
                <label className="sell-label" htmlFor={fid("year")}>
                  Year
                </label>
                <select
                  id={fid("year")}
                  name="year"
                  className="sell-input sell-select"
                  defaultValue=""
                  disabled={!manual}
                  required
                  onChange={() => touch("year")}
                  {...describe("year")}
                >
                  <option value="">Choose the year</option>
                  {yearOptions(maxYear).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <Err id={eid("year")}>{fieldMsg("year")}</Err>
              </div>
              <div className="sell-field">
                <label className="sell-label" htmlFor={fid("make")}>
                  Make
                </label>
                <input
                  id={fid("make")}
                  name="make"
                  className="sell-input"
                  list={fid("makes")}
                  autoComplete="off"
                  autoCapitalize="words"
                  maxLength={40}
                  placeholder="For example, Toyota"
                  disabled={!manual}
                  required
                  enterKeyHint="next"
                  onInput={() => touch("make")}
                  {...describe("make")}
                />
                <datalist id={fid("makes")}>
                  {COMMON_MAKES.map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
                <Err id={eid("make")}>{fieldMsg("make")}</Err>
              </div>
              <div className="sell-field">
                <label className="sell-label" htmlFor={fid("model")}>
                  Model
                </label>
                <input
                  id={fid("model")}
                  name="model"
                  className="sell-input"
                  autoComplete="off"
                  autoCapitalize="words"
                  maxLength={60}
                  placeholder="For example, Camry"
                  disabled={!manual}
                  required
                  enterKeyHint="next"
                  onInput={() => touch("model")}
                  {...describe("model")}
                />
                <Err id={eid("model")}>{fieldMsg("model")}</Err>
              </div>
              {us && (
                <button type="button" className="sell-link" onClick={useVin}>
                  Have the VIN? Look it up
                </button>
              )}
            </div>

            <div className="sell-field" hidden={!carKnown}>
              <label className="sell-label" htmlFor={fid("mileage")}>
                {us ? "About how many miles?" : "About how many km?"}
              </label>
              <div className="sell-affix">
                <input
                  id={fid("mileage")}
                  name="mileage"
                  className="sell-input"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={12}
                  required
                  enterKeyHint="next"
                  onInput={() => touch("mileage")}
                  {...describe("mileage")}
                />
                <span className="sell-affix-after" aria-hidden="true">
                  {us ? "miles" : "km"}
                </span>
              </div>
              <Err id={eid("mileage")}>{fieldMsg("mileage")}</Err>
            </div>

            <div className="sell-field" hidden={!carKnown}>
              <label className="sell-label" htmlFor={fid("location")}>
                Where the car is <em>optional</em>
              </label>
              <input
                id={fid("location")}
                name="location"
                className="sell-input"
                autoComplete="off"
                maxLength={80}
                placeholder={us ? "City or ZIP" : "City or area"}
                enterKeyHint="next"
                onInput={() => touch("location")}
                {...describe("location")}
              />
              <Err id={eid("location")}>{fieldMsg("location")}</Err>
            </div>
          </div>
        </fieldset>
        <div hidden={!carKnown}>{nextButton}</div>
      </div>

      {/* ── Step 2: its condition ─────────────────────────────────────── */}
      <div className="sell-step" data-step="2" hidden={step !== 2}>
        {back(2)}
        <fieldset className="sell-fieldset">
          {legend(2)}
          <div className="sell-step-body">
            <Choices
              name="condition"
              legend="What shape is it in?"
              choices={CONDITIONS}
              error={fieldMsg("condition")}
              errorId={eid("condition")}
              onPick={() => touch("condition")}
            />
            <Choices
              name="accident"
              legend="Has it been in an accident?"
              hint="Any crash, even a small one."
              hintId={fid("accident-hint")}
              choices={ACCIDENT}
              compact
              error={fieldMsg("accident")}
              errorId={eid("accident")}
              onPick={() => touch("accident")}
            />
            <Choices
              name="warningLights"
              legend="Any warning lights on the dash?"
              hint="Check with the engine running."
              hintId={fid("lights-hint")}
              choices={LIGHTS}
              compact
              error={fieldMsg("warningLights")}
              errorId={eid("warningLights")}
              onPick={() => touch("warningLights")}
            />
            <Choices
              name="title"
              legend={us ? "What about the title?" : "What about the papers?"}
              choices={titleChoices(market.code)}
              error={fieldMsg("title")}
              errorId={eid("title")}
              onPick={() => touch("title")}
            />
            <Choices
              name="keys"
              legend="How many keys do you have?"
              choices={KEYS}
              compact
              error={fieldMsg("keys")}
              errorId={eid("keys")}
              onPick={() => touch("keys")}
            />
          </div>
        </fieldset>
        {nextButton}
      </div>

      {/* ── Step 3: what they want ────────────────────────────────────── */}
      <div className="sell-step" data-step="3" hidden={step !== 3}>
        {back(3)}
        <fieldset className="sell-fieldset">
          {legend(3)}
          <div className="sell-step-body">
            <Choices
              name="wants"
              legend="What would you like to do?"
              choices={WANTS}
              error={fieldMsg("wants")}
              errorId={eid("wants")}
              onPick={() => touch("wants")}
            />
            <div className="sell-field">
              <label className="sell-label" htmlFor={fid("price")}>
                Price you have in mind <em>optional</em>
              </label>
              <div className="sell-affix sell-affix--before">
                <span className="sell-affix-before" aria-hidden="true">
                  {us ? "$" : "₦"}
                </span>
                <input
                  id={fid("price")}
                  name="price"
                  className="sell-input"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={16}
                  enterKeyHint="next"
                  onInput={() => touch("price")}
                  {...describe("price", [fid("price-hint")])}
                />
              </div>
              <span className="sell-sr" id={fid("price-hint")}>
                {us ? "In dollars." : "In naira."}
              </span>
              <Err id={eid("price")}>{fieldMsg("price")}</Err>
            </div>
            <div className="sell-field">
              <label className="sell-label" htmlFor={fid("notes")}>
                Anything else? <em>optional</em>
              </label>
              <textarea
                id={fid("notes")}
                name="notes"
                className="sell-input sell-textarea"
                rows={3}
                maxLength={2000}
                placeholder="Recent repairs, new tires, anything we should know"
                onInput={() => touch("notes")}
                {...describe("notes")}
              />
              <Err id={eid("notes")}>{fieldMsg("notes")}</Err>
            </div>
          </div>
        </fieldset>
        {nextButton}
      </div>

      {/* ── Step 4: how to reach them ─────────────────────────────────── */}
      <div className="sell-step" data-step="4" hidden={step !== 4}>
        {back(4)}
        <fieldset className="sell-fieldset">
          {legend(4)}
          <div className="sell-step-body">
            <div className="sell-field">
              <label className="sell-label" htmlFor={fid("name")}>
                Your name
              </label>
              <input
                id={fid("name")}
                name="name"
                className="sell-input"
                autoComplete="name"
                autoCapitalize="words"
                maxLength={120}
                required
                enterKeyHint="next"
                onInput={() => touch("name")}
                {...describe("name")}
              />
              <Err id={eid("name")}>{fieldMsg("name")}</Err>
            </div>
            <div className="sell-field">
              <label className="sell-label" htmlFor={fid("phone")}>
                Phone number <em>{us ? "with area code" : "full number"}</em>
              </label>
              <input
                id={fid("phone")}
                name="phone"
                type="tel"
                className="sell-input"
                autoComplete="tel"
                maxLength={40}
                required
                enterKeyHint="next"
                onInput={() => touch("phone")}
                {...describe("phone")}
              />
              <Err id={eid("phone")}>{fieldMsg("phone")}</Err>
            </div>
            <div className="sell-field">
              <label className="sell-label" htmlFor={fid("email")}>
                Email <em>{replyBy === "email" ? "needed to reply by email" : "optional"}</em>
              </label>
              <input
                id={fid("email")}
                name="email"
                type="email"
                className="sell-input"
                autoComplete="email"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={254}
                required={replyBy === "email"}
                enterKeyHint="send"
                onInput={() => touch("email")}
                {...describe("email")}
              />
              <Err id={eid("email")}>{fieldMsg("email")}</Err>
            </div>
            <Choices
              name="replyBy"
              legend="Reply to me by"
              choices={replyChoices(market.code)}
              compact
              defaultValue="phone"
              error={fieldMsg("replyBy")}
              errorId={eid("replyBy")}
              onPick={(v) => {
                setReplyBy(v);
                touch("replyBy");
                // Email stops being needed, or starts: its message is stale.
                touch("email");
              }}
            />
            <p className="sell-photos">
              <i className="fas fa-camera" aria-hidden="true" /> {photosLine(replyBy)}
            </p>
          </div>
        </fieldset>

        {/* Every answer to Send, directly above it, where the owner is
            looking. A field's own message is shown on its step instead. */}
        <div className="sell-messages" ref={messagesRef}>
          {generalText && (
            <div className="sell-alert" role="alert">
              <p>{generalText}</p>
              {callUs}
            </div>
          )}
          {state?.sendFailed && (
            <div className="sell-alert" role="alert">
              <p>
                <strong>{state.sendFailed === "reload" ? "Please reload." : "No confirmation yet."}</strong>{" "}
                {state.error}
              </p>
              {state.sendFailed === "reload" ? (
                <div className="sell-alert-actions">
                  <button
                    type="button"
                    className="sell-btn sell-btn--outline sell-btn--small"
                    data-action="reload"
                    onClick={() => window.location.reload()}
                  >
                    <i className="fas fa-rotate-right" aria-hidden="true" /> Reload the page
                  </button>
                </div>
              ) : (
                callUs
              )}
            </div>
          )}
        </div>

        <div className="sell-actions">
          <button
            ref={sendRef}
            type="submit"
            className="sell-btn sell-btn--primary sell-btn--wide"
            disabled={!hydrated || pending || state?.sendFailed === "reload"}
            onClick={(e) => {
              if (performance.now() < armUntil.current) e.preventDefault();
            }}
          >
            {pending ? (
              <>
                <i className="fas fa-spinner fa-spin" aria-hidden="true" /> Sending…
              </>
            ) : state?.sendFailed === "unconfirmed" ? (
              "Try again"
            ) : (
              <>
                Send my car&rsquo;s details <i className="fas fa-paper-plane" aria-hidden="true" />
              </>
            )}
          </button>
          <span className="sell-sr" role="status">
            {pending ? "Sending your car's details…" : ""}
          </span>
        </div>
      </div>
    </form>
  );
}

/**
 * One question with big answers to tap: a fieldset of radio buttons, each
 * drawn as a card, with its legend, a hint, and its message. Not controlled
 * by React: the browser holds the answer, and the stylesheet draws the
 * chosen one from :checked.
 */
function Choices({
  name,
  legend,
  hint,
  hintId,
  choices,
  compact = false,
  defaultValue,
  error,
  errorId,
  onPick,
}: {
  name: string;
  legend: string;
  hint?: string;
  hintId?: string;
  choices: readonly Choice[];
  /** Short answers side by side ("No", "Yes"), instead of one per row. */
  compact?: boolean;
  defaultValue?: string;
  error?: string;
  errorId: string;
  onPick: (value: string) => void;
}) {
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");
  return (
    <fieldset className="sell-group" aria-describedby={describedBy || undefined}>
      <legend className="sell-group-legend">{legend}</legend>
      {hint && (
        <p className="sell-hint" id={hintId}>
          {hint}
        </p>
      )}
      <div
        className={`sell-options${compact ? ` sell-options--row sell-options--${choices.length}` : ""}`}
      >
        {choices.map((c) => (
          <label key={c.value} className={`sell-option${compact ? " sell-option--compact" : ""}`}>
            <input
              type="radio"
              name={name}
              value={c.value}
              defaultChecked={defaultValue === c.value}
              required
              onChange={() => onPick(c.value)}
            />
            {!compact && <span className="sell-dot" aria-hidden="true" />}
            <span className="sell-option-text">
              <strong>{c.label}</strong>
              {c.help && <small>{c.help}</small>}
            </span>
            {compact && <i className="fas fa-check sell-tick" aria-hidden="true" />}
          </label>
        ))}
      </div>
      <Err id={errorId}>{error}</Err>
    </fieldset>
  );
}

/**
 * A message under a field, linked to it by its id. `alert` for one that
 * appears without a submit (a lookup's answer), so a screen reader hears it.
 * Nothing at all when there is no message.
 */
function Err({ id, children, alert = false }: { id?: string; children: React.ReactNode; alert?: boolean }) {
  if (!children) return null;
  return (
    <p className="sell-error" id={id} role={alert ? "alert" : undefined}>
      <i className="fas fa-circle-exclamation" aria-hidden="true" /> {children}
    </p>
  );
}
