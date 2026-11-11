"use client";

import { useActionToast, pushToast, dismissErrorToasts } from "@/components/Toast";

import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  useRef,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { requestRental, type RentalResult } from "@/lib/actions/rentals";
import { displayPhone } from "@/lib/phoneDisplay";
import { quoteRental, rentalDays, RentalError, type RentalTariff } from "@/lib/rental";
import { formatMoney, money } from "@/lib/money";
import type { MarketConfig } from "@/lib/market";
import { RENTAL_CLAUSES, RENTAL_TERMS_VERSION, fillClause } from "@/content/rentalTerms";
import { RentalPayButton } from "@/components/RentalPayButton";
import { RESERVATION_HOURS } from "@/lib/reservation";
import { todayIn } from "@/lib/localDate";
import { useFormTimer } from "@/lib/useFormTimer";
import {
  shrinkPhoto,
  megabytes,
  DOCUMENT_PHOTO,
  UPLOAD_LIMIT_BYTES,
  UPLOAD_LIMIT_LABEL,
} from "@/lib/shrinkPhoto";
import {
  MESSAGES,
  STEP_TITLES,
  addDaysIso,
  isDatesError,
  lengthsFor,
  overlapsTaken,
  routeForResult,
  stepProblem,
  type Problem,
  type Snapshot,
  type Step,
  type TakenWindow,
} from "@/components/rentalBookingSteps";

/**
 * "daily" -> "day" / "days".
 *
 * This was `tier.replace("ly", "")` plus an "s", which is right for weekly and
 * monthly and wrong for the rate most people book on: it printed "3 × dais".
 * Spelled out rather than patched, because there are only three of them and a
 * fourth would break the trick again.
 */
const UNITS: Record<string, [one: string, many: string]> = {
  daily: ["day", "days"],
  weekly: ["week", "weeks"],
  monthly: ["month", "months"],
};

function unitLabel(tier: string, quantity: number): string {
  const unit = UNITS[tier];
  if (!unit) return tier;
  return quantity === 1 ? unit[0] : unit[1];
}

/**
 * The booking's result, plus the failures the server never gets to report.
 *
 * "unconfirmed" is deliberately not "not sent": a phone can lose the reply
 * after the booking was saved, so the renter is told only what is known —
 * that no confirmation came back. "reload" is the page being out of date
 * after a release, when every retry from it would fail the same way.
 */
type FormState =
  | (RentalResult & { sendFailed?: "unconfirmed" | "reload" })
  | null;

type Doc = "licence" | "insurance";

/*
 * Each step gets its own history entry, at the same address, so the Back
 * gesture on a phone goes back a step instead of leaving the page with
 * everything typed. Next.js keeps entries like these through its own
 * back and forward handling; if an upgrade ever stops doing so, this one
 * switch turns step history off and the steps still work without it.
 */
const STEP_HISTORY = true;

/** Where the form is, and how it got there. Read by the step effect. */
type Nav = {
  step: Step;
  /** The step before this change. */
  prev: Step;
  /** The furthest step reached: Forward goes no further than this. */
  max: Step;
  /** A field to focus, "@…" for a button beside Reserve, or null for the step's heading. */
  focus: string | null;
  /** Counts changes, so moving to the same step again still runs the effect. */
  seq: number;
  history: "push" | "back" | "none";
};
const START: Nav = { step: 1, prev: 1, max: 1, focus: null, seq: 0, history: "none" };

/** A step's history entry, kept beside Next.js's own state. */
type StepEntry = { flow?: string; step?: number };

/** What the screen-reader-only part of each Back button adds. */
const BACK_TO: Record<Step, string> = {
  1: "",
  2: "your dates",
  3: "your details",
  4: "license and insurance",
};

/*
 * The moment this page came alive in the browser, for leaving out holds
 * that have ended since the page was cached.
 *
 * Cached, because useSyncExternalStore asks for it on every render and must
 * get the same answer each time; a fresh Date.now() per call would never
 * settle. On the server there is no "now" worth trusting — the page is
 * cached and may be served hours later — so the server snapshot is 0, which
 * means "keep everything".
 */
let loadedAt = 0;
const subscribeNothing = () => () => {};
const pageNow = () => (loadedAt ||= Date.now());
const serverNow = () => 0;

/** A real calendar day, as a date field gives it. Anything else is never date arithmetic. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const TEXT_TYPES = new Set(["text", "tel", "email", "search", "url"]);

/** A field that brings up the keyboard. Dates, ticks, choices and files don't. */
function isTextEntry(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLTextAreaElement ||
    (t instanceof HTMLInputElement && TEXT_TYPES.has(t.type))
  );
}

/** The control to focus for a field a step check or the server named. */
function controlFor(form: HTMLFormElement, field: string): HTMLElement | null {
  if (field === "insuranceChoice") {
    return (
      form.querySelector<HTMLElement>('input[name="insuranceChoice"]:checked') ??
      form.querySelector<HTMLElement>('input[name="insuranceChoice"]')
    );
  }
  if (field === "withDriver") return form.querySelector<HTMLElement>('[data-field="withDriver"]');
  const name = field === "termsVersion" ? "acceptTerms" : field;
  return form.querySelector<HTMLElement>(`[name="${name}"]`);
}

/*
 * What the renter typed, kept in this tab for up to a day.
 *
 * Phones drop pages: going to the camera for a photo of a license can be
 * enough. Text only, and only what is no risk sitting in the browser: never
 * the documents, the license or policy number, the ticks or the coverage
 * choice, which are asked for again. Cleared when the booking goes through.
 */
type Draft = { from: string; to: string; name: string; phone: string; email: string; note: string };
const DRAFT_MAX: Record<keyof Draft, number> = {
  from: 10,
  to: 10,
  name: 120,
  phone: 40,
  email: 254,
  note: 2000,
};
const DAY_MS = 86_400_000;

function loadDraft(key: string, today: string): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Record<string, unknown> | null;
    if (!saved || saved.v !== 1 || typeof saved.savedAt !== "number") return null;
    const age = Date.now() - saved.savedAt;
    if (!(age >= 0 && age < DAY_MS)) return null;
    const d = { from: "", to: "", name: "", phone: "", email: "", note: "" };
    for (const k of Object.keys(DRAFT_MAX) as (keyof Draft)[]) {
      const v = saved[k];
      if (typeof v !== "string") return null;
      d[k] = v.slice(0, DRAFT_MAX[k]);
    }
    if (!ISO_DAY.test(d.from)) d.from = "";
    if (!ISO_DAY.test(d.to)) d.to = "";
    // A pickup that has gone by takes its return date with it.
    if (d.from && d.from < today) {
      d.from = "";
      d.to = "";
    }
    if (d.to && d.to <= d.from) d.to = "";
    return Object.values(d).some(Boolean) ? d : null;
  } catch {
    return null;
  }
}

function saveDraft(key: string, d: Draft) {
  try {
    if (Object.values(d).some(Boolean)) {
      window.sessionStorage.setItem(key, JSON.stringify({ v: 1, savedAt: Date.now(), ...d }));
    } else {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Storage refused (a private window, or full): the form works without it.
  }
}

function clearDraft(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // As above.
  }
}

export function RentalBookingForm({
  market,
  vehicleSlug,
  vehicleTitle,
  contactPhone,
  payOnline,
  tariff,
  taken,
}: {
  market: MarketConfig;
  vehicleSlug: string;
  /** "2019 Toyota Camry SE", for the text-us message if sending fails. */
  vehicleTitle: string;
  /** The showroom line in +1… form, or null when none is on file. */
  contactPhone: string | null;
  /** Whether this market can take a real card online right now. */
  payOnline: boolean;
  tariff: RentalTariff;
  /** Dates already taken, [start, end), listed and checked on the first step. */
  taken: TakenWindow[];
}) {
  // The showroom line as people write it, or null when none is on file. The
  // messages below only offer a text or a call when there is a number.
  const phoneLabel = displayPhone(contactPhone, market.code);
  // Today where the business is. In UTC, Greensboro's "today" became
  // tomorrow at 7 PM, and today's date could no longer be picked.
  const today = () => todayIn(market.timezone);
  const unconfirmedMessage = phoneLabel
    ? `We couldn't confirm that your request reached us. Your details are still here. Try again, or text or call us at ${phoneLabel} and we'll check.`
    : "We couldn't confirm that your request reached us. Your details are still here. Try again, or contact us and we'll check.";
  const reloadMessage =
    "This page was updated while you had it open. Please reload it and send your request again.";

  /*
   * A request that gets no answer is caught here.
   *
   * Without this, a refused upload (Vercel's 413), a dropped connection or a
   * crash on the server threw out of the action, React handed it to the page's
   * error boundary, and the renter got "We could not load this page" with
   * everything they had typed gone — and the same again on every retry. Caught,
   * it is an ordinary message beside the button, the form keeps its contents,
   * and the renter is offered a person instead of a dead end.
   *
   * What it does not claim is that nothing was sent: the reply can be lost
   * after the booking was saved. requestRental recognizes a retry of the same
   * reservation and answers with it instead of booking twice.
   *
   * The previous state is not forwarded: requestRental never reads it, and
   * sending it would only add the last result to every request's body.
   */
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      try {
        const result = await requestRental(null, formData);
        // "—" is the quiet answer a bot gets: nothing was saved. A person
        // should never see it, but if the bot checks ever mistake one for a
        // bot, they get the text-or-call fallback rather than silence.
        if (result.ok && result.reference === "—") {
          return { ok: false, sendFailed: "unconfirmed", error: unconfirmedMessage };
        }
        return result;
      } catch (e) {
        // After a release the action's id changes, and every retry from a
        // page opened before it fails the same way until it is reloaded.
        if (unstable_isUnrecognizedActionError(e)) {
          return { ok: false, sendFailed: "reload", error: reloadMessage };
        }
        console.error("[booking] no reply from the server", e);
        return { ok: false, sendFailed: "unconfirmed", error: unconfirmedMessage };
      }
    },
    null,
  );
  // Failures only: a successful booking has its own panel, and a "Saved."
  // toast on top of it read oddly after reserving a car. Quiet, because the
  // form reads each message out where it shows it; heard twice, the second
  // copy only talked over the field it was about.
  useActionToast(state?.ok ? null : state, undefined, { quiet: true });

  /*
   * Reserve stays disabled until the page has hydrated.
   *
   * The form is submitted by onSubmit (see the <form> below), so before the
   * JavaScript runs a tap would be a plain browser submit. That used to be a
   * GET, which put the renter's name, phone and email in the address bar and
   * the server logs. The form now says method="post" as well, but nothing
   * should be submitted before the code that checks and sends it is there.
   */
  const { hydrated, elapsedMs } = useFormTimer();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [withDriver, setWithDriver] = useState(false);
  /*
   * Defaults to their own insurance, never to the paid option.
   *
   * Pre-selecting the paid option would put a charge in the total the customer
   * did not ask for and might not notice — which is exactly the pattern the
   * FTC's rule on deceptive fees is aimed at, and the opposite of what the
   * business asked for in wanting it clearly communicated.
   */
  const [insurance, setInsurance] = useState<"own" | "company" | "declined">(
    "own",
  );
  const coverOffered = (tariff.injuryCoverDailyMinor ?? 0) > 0;

  /*
   * Four steps in one form.
   *
   * Dates, then details, then license and insurance, then a review with the
   * terms. Every field stays mounted, each step a <section hidden>, so what
   * was typed or attached survives moving between steps and the server's
   * answer can name any field. Nothing is disabled to hide it — a disabled
   * field is left out of the request — and Reserve exists on the last step
   * only, so no button ever changes from "Next" into a submit under a tap.
   */
  const uid = useId();
  const fid = (n: string) => `${uid}-${n}`;
  const eid = (n: string) => `${uid}-${n}-error`;
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
  const [typing, setTyping] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [draftChecked, setDraftChecked] = useState(false);
  const [restored, setRestored] = useState(false);
  const [sendSeq, setSendSeq] = useState(0);
  const [slowFor, setSlowFor] = useState(-1);
  const now = useSyncExternalStore(subscribeNothing, pageNow, serverNow);
  const formRef = useRef<HTMLFormElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const termsRef = useRef<HTMLDetailsElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const headings = useRef<Partial<Record<Step, HTMLHeadingElement | null>>>({});
  const flow = useRef("");
  const traversing = useRef(false);
  const armUntil = useRef(0);
  const lockedRef = useRef(false);
  const doneRef = useRef(false);
  const snapRef = useRef<Snapshot | null>(null);
  const draftKey = `aaa.booking.${market.code}.${vehicleSlug}`;

  /** The renter changed this field: any message about it, ours or the server's, goes. */
  const touch = (f: string) => {
    setEdited((m) => (m[f] ? m : { ...m, [f]: true }));
    setProblem((p) => (p?.field === f ? null : p));
  };

  /*
   * Everything the customer typed or attached, held in state.
   *
   * This began as a defense against React resetting the form after its
   * action ran: a single validation failure emptied the whole thing, photos
   * included, and being asked to find your license and insurance card again
   * because you mistyped a phone number is where somebody gives up and calls
   * a competitor. The form no longer resets at all (see the <form> below),
   * but state stays the source of truth: the text-us fallback reads the name
   * from it, and the files sent are the shrunk copies held here, not the
   * full-size originals still sitting in the inputs.
   */
  const [fields, setFields] = useState<Record<string, string>>({});
  const set = (name: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setFields((f) => ({ ...f, [name]: e.target.value }));
    touch(name);
  };
  const val = (name: string) => fields[name] ?? "";

  const [licenceFile, setLicenceFile] = useState<File | null>(null);
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null);
  /*
   * One message per document, plus one for the button.
   *
   * A single shared message meant choosing the insurance card erased the
   * license's "too large" warning, and a refusal at submit appeared beside
   * the upload fields — a screen or more above the button the renter had
   * just pressed, which then seemed to do nothing.
   */
  const [docErrors, setDocErrors] = useState<{
    licence?: string;
    insurance?: string;
    submit?: string;
  }>({});
  // Held in state like the text fields, so they survive a retry.
  const [eligible, setEligible] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  /*
   * Photos are made smaller the moment they are chosen, not at submit.
   *
   * See src/lib/shrinkPhoto.ts for why: two ordinary phone photos used to add
   * up to more than the hosting platform accepts in one request. Doing it on
   * choice means "Preparing…" appears beside the field the renter just used,
   * and Reserve waits for it. The pick counters stop a slow first photo from
   * replacing a second one chosen while it was still being prepared.
   */
  const [preparing, setPreparing] = useState({ licence: false, insurance: false });
  const picks = useRef({ licence: 0, insurance: 0 });

  async function attach(which: Doc, input: HTMLInputElement) {
    const file = input.files?.[0] ?? null;
    const setFile = which === "licence" ? setLicenceFile : setInsuranceFile;
    setDocErrors((e) => ({ ...e, [which]: undefined, submit: undefined }));
    const pick = ++picks.current[which];

    if (!file) {
      // Picker cancelled. Also ends any "Preparing…" from an earlier pick,
      // which would otherwise wait on a photo nobody is sending any more.
      setFile(null);
      setPreparing((p) => ({ ...p, [which]: false }));
      return;
    }

    setPreparing((p) => ({ ...p, [which]: true }));
    let ready: File;
    try {
      ready = await shrinkPhoto(file, DOCUMENT_PHOTO);
    } catch {
      ready = file; // could not shrink it; the size check below decides
    }
    if (picks.current[which] !== pick) return; // a newer choice took over
    setPreparing((p) => ({ ...p, [which]: false }));

    if (ready.size > UPLOAD_LIMIT_BYTES) {
      // Only a large PDF, or an image this browser cannot read, gets here.
      setFile(null);
      input.value = ""; // so the picker does not show a file we are not sending
      setDocErrors((e) => ({
        ...e,
        [which]: `That file is ${megabytes(ready.size)}, over our ${UPLOAD_LIMIT_LABEL} limit. Try a screenshot of it, or a smaller photo.`,
      }));
      return;
    }
    setFile(ready);
  }

  // The insurance card only counts while "own insurance" is the choice.
  const stillPreparing =
    preparing.licence || (insurance === "own" && preparing.insurance);

  /** A refusal at submit: shown beside the button and announced as a toast. */
  function refuse(message: string) {
    setDocErrors((e) => ({ ...e, submit: message }));
    pushToast("error", message);
  }

  /*
   * The confirmation replaces the form from the top, which on a phone is
   * well above the Reserve button just pressed: without this the screen
   * seemed not to change at all. Brought into view and focused, so it is
   * seen, and read out by a screen reader.
   */
  const done = useRef<HTMLElement>(null);
  const isDone = Boolean(state?.ok && state.reference && state.reference !== "—");
  useEffect(() => {
    if (!isDone || !done.current) return;
    // An earlier "couldn't confirm" would otherwise sit over the reference
    // for the rest of its time on screen.
    dismissErrorToasts();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    done.current.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
    done.current.focus({ preventScroll: true });
  }, [isDone]);

  const submit = (formData: FormData) => {
    // How long the form has been on screen, as the bot check (useFormTimer).
    formData.set("elapsedMs", String(elapsedMs()));

    /*
     * The documents come from state, not from the inputs.
     *
     * State holds the shrunk copies the renter chose; the inputs still hold
     * the full-size originals. Checked here too, so the message is immediate
     * rather than a round trip; the server refuses them independently either
     * way.
     */
    if (stillPreparing) {
      refuse("Still preparing your photo. One moment, then tap Reserve again.");
      return;
    }
    if (!licenceFile) {
      refuse("Please attach a photo of your driver's license.");
      return;
    }
    if (insurance === "own" && !insuranceFile) {
      refuse("Please attach proof of insurance, or choose a different option above.");
      return;
    }

    /*
     * Only what this choice needs, and never more than the limit.
     *
     * A certificate attached under "own insurance" and left behind after
     * switching options used to be sent anyway, counting against the size
     * limit for nothing. The total is checked here as well as on choosing,
     * because the limit is for the whole request, not each file.
     */
    const sending = [licenceFile, insurance === "own" ? insuranceFile : null].filter(
      (f): f is File => f !== null,
    );
    const total = sending.reduce((sum, f) => sum + f.size, 0);
    if (total > UPLOAD_LIMIT_BYTES) {
      refuse(
        `Your files add up to ${megabytes(total)}, over our ${UPLOAD_LIMIT_LABEL} limit. Try a screenshot instead of a large PDF.`,
      );
      return;
    }

    setDocErrors((e) => ({ ...e, submit: undefined }));
    formData.set("licenceFile", licenceFile);
    if (insurance === "own" && insuranceFile) {
      formData.set("insuranceFile", insuranceFile);
    } else {
      // The hidden input may still hold the original, full-size file.
      formData.delete("insuranceFile");
    }
    startTransition(() => action(formData));
  };

  /*
   * The way out when sending fails: a text to the showroom with the car, the
   * dates and the name already written, so nobody has to start over.
   */
  const shortDate = (iso: string) =>
    new Intl.DateTimeFormat(market.locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${iso}T00:00:00Z`));
  const smsBody =
    `Hi, I'd like to rent the ${vehicleTitle}` +
    (from && to ? ` from ${shortDate(from)} to ${shortDate(to)}` : "") +
    "." +
    (val("name").trim() ? ` My name is ${val("name").trim()}.` : "");
  // "?&body=" is the form both iPhone and Android Messages read.
  const smsHref = contactPhone
    ? `sms:${contactPhone}?&body=${encodeURIComponent(smsBody)}`
    : null;
  const telHref = contactPhone ? `tel:${contactPhone}` : null;

  /**
   * Preview only — the server prices the booking again from the same tariff
   * before writing. A quote assembled in the browser is not a price.
   */
  const preview = useMemo(() => {
    if (!from || !to) return null;
    const days = rentalDays(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`));
    if (days <= 0) return null;
    try {
      return {
        quote: quoteRental(tariff, days, {
          withDriver,
          injuryCover: insurance === "company" && coverOffered,
        }),
        error: null as string | null,
      };
    } catch (e) {
      return { quote: null, error: e instanceof RentalError ? e.message : "Cannot price those dates." };
    }
  }, [from, to, withDriver, insurance, coverOffered, tariff]);

  // Cents only when there are cents: "$350", as the rates and the server say it.
  const fmt = (minor: number) => formatMoney(money(minor, market.currency), market.locale);

  /*
   * State that follows other state, adjusted while rendering (React's own
   * pattern for it): each block runs once for what it is watching.
   *
   * The draft comes back in the render that wakes the date fields, so
   * nothing can be typed into a field it would then overwrite. A restored
   * draft always starts on the first step.
   */
  if (hydrated && !draftChecked) {
    setDraftChecked(true);
    const d = loadDraft(draftKey, today());
    if (d) {
      setFrom(d.from);
      setTo(d.to);
      setFields((f) => ({ ...f, name: d.name, phone: d.phone, email: d.email, note: d.note }));
      if (d.note) setNoteOpen(true);
      setRestored(true);
    }
  }
  /*
   * Each answer from the server, taken to the step it is about, once. A
   * field's message goes to that field's step, with the field focused;
   * anything else is shown beside Reserve, with the button that helps.
   */
  if (state !== seen) {
    setSeen(state);
    setEdited({});
    setProblem(null);
    if (state && !isDone) {
      const target = state.fieldErrors ? routeForResult(state.fieldErrors) : null;
      if (target) {
        if (target.field === "note") setNoteOpen(true);
        setErrorFor(null);
        setNav((n) => ({ ...n, step: target.step, prev: n.step, focus: target.field, seq: n.seq + 1, history: "back" }));
      } else {
        setErrorFor(state.sendFailed ? null : state);
        const focus =
          state.sendFailed === "reload"
            ? "@reload"
            : !state.sendFailed && state.error && isDatesError(state.error)
              ? "@changeDates"
              : "@primary";
        setNav((n) => ({ ...n, step: 4, prev: n.step, focus, seq: n.seq + 1, history: "none" }));
      }
    }
  }
  // "Still preparing your photo" goes once the photo is ready.
  if (problem?.message === MESSAGES.preparing && !stillPreparing) setProblem(null);

  const days = from && to ? rentalDays(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`)) : 0;
  const overlap = Boolean(from && to && days > 0 && overlapsTaken(from, to, taken, now));
  const shownTaken = taken.filter((w) => !now || !w.heldUntil || Date.parse(w.heldUntil) > now);
  const sending = [licenceFile, insurance === "own" ? insuranceFile : null].filter(
    (f): f is File => f !== null,
  );
  const sendingBytes = sending.reduce((n, f) => n + f.size, 0);
  /** Everything the step checks read, in one place, so the listeners can read it too. */
  const snapshot: Snapshot = {
    today: hydrated ? today() : "",
    from,
    to,
    days,
    quoteError: preview?.error ?? null,
    overlap,
    name: val("name"),
    phone: val("phone"),
    email: val("email"),
    preparing: preparing.licence
      ? "licenceFile"
      : insurance === "own" && preparing.insurance
        ? "insuranceFile"
        : null,
    hasLicence: licenceFile !== null,
    own: insurance === "own",
    hasProof: insuranceFile !== null,
    sizeMessage:
      sendingBytes > UPLOAD_LIMIT_BYTES
        ? `Your files add up to ${megabytes(sendingBytes)}, over our ${UPLOAD_LIMIT_LABEL} limit. Try a screenshot instead of a large PDF.`
        : null,
    eligible,
    acceptedTerms,
  };
  // Sending, or not knowing whether it arrived: the steps stay where they are.
  const locked = pending || state?.sendFailed === "unconfirmed";
  /** A field's message: our own check's first, then the server's until the field is changed. */
  const fieldMsg = (f: string) =>
    problem?.field === f ? problem.message : edited[f] ? undefined : state?.fieldErrors?.[f]?.[0];
  /** aria-invalid and aria-describedby for a field, with any hints it has. */
  const describe = (f: string, extra: (string | false | null | undefined)[] = []) => {
    const m = fieldMsg(f);
    const ids = [...extra, m ? eid(f) : null].filter(Boolean).join(" ");
    return { "aria-invalid": m ? true : undefined, "aria-describedby": ids || undefined } as const;
  };
  // Said as the dates are picked, before anyone taps Next.
  const datesWarn =
    !from || !to
      ? null
      : days <= 0
        ? MESSAGES.returnBeforePickup
        : (preview?.error ?? (overlap ? MESSAGES.taken : null));
  const showDatesWarn =
    Boolean(datesWarn) && !["from", "to", "withDriver"].includes(problem?.field ?? "");
  const generalText =
    errorFor === state && state && !state.sendFailed
      ? (state.error ?? (state.fieldErrors ? "Please reload the page and try again." : null))
      : null;
  // Heard when a step change moves focus to a field rather than to the heading.
  const stepNote =
    nav.focus && !nav.focus.startsWith("@") && nav.step !== nav.prev
      ? `Step ${nav.step} of 4: ${STEP_TITLES[nav.step]}`
      : "";
  // One week, two weeks, 30 days, where this car allows them, at today's choices.
  const lengths = useMemo(
    () =>
      lengthsFor(tariff).flatMap((n) => {
        try {
          return [
            {
              n,
              label: n === 7 ? "1 week" : n === 14 ? "2 weeks" : "30 days",
              total: quoteRental(tariff, n, {
                withDriver,
                injuryCover: insurance === "company" && coverOffered,
              }).totalMinor,
            },
          ];
        } catch {
          return [];
        }
      }),
    [tariff, withDriver, insurance, coverOffered],
  );

  /** A check failed: its step, its field, its message. */
  function showProblem(k: Step, p: Problem) {
    setProblem(p);
    // A general error is about the last attempt; going back changes things.
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

  /** Back, Edit and Change dates. Not while sending: what was sent can't change. */
  function goBackTo(target: Step, focus: string | null) {
    if (locked || traversing.current) return;
    setProblem(null);
    setErrorFor(null);
    setNav((n) => ({ ...n, step: target, prev: n.step, focus, seq: n.seq + 1, history: "back" }));
  }

  /** Next and Review, and Enter in the last field of the first two steps. */
  function next() {
    if (!hydrated || traversing.current || performance.now() < armUntil.current) return;
    // Once the review has been reached, every step up to it is checked again,
    // then it is straight back to the review.
    const last: Step = nav.max === 4 ? 3 : nav.step;
    for (let k = nav.step; k <= last; k++) {
      const p = stepProblem(k as Step, snapshot);
      if (p) {
        showProblem(k as Step, p);
        return;
      }
    }
    const target = (last + 1) as Step;
    setProblem(null);
    const focus = target === 2 ? (["name", "phone", "email"].find((f) => !val(f).trim()) ?? null) : null;
    const go = () =>
      setNav((n) => ({
        ...n,
        step: target,
        prev: n.step,
        max: Math.max(n.max, target) as Step,
        focus,
        seq: n.seq + 1,
        history: "push",
      }));
    // Into the name field while the tap is still going on, which is what
    // lets an iPhone open the keyboard there, with AutoFill.
    if (target === 2) flushSync(go);
    else go();
  }

  /** "Pick dates": straight to the next date to choose, never an error. */
  function pickDates() {
    const el = formRef.current?.querySelector<HTMLInputElement>(
      from ? 'input[name="to"]' : 'input[name="from"]',
    );
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.focus({ preventScroll: true });
    try {
      el.showPicker();
    } catch {
      // Focused; the picker opens on a tap.
    }
  }

  function openNote() {
    setNoteOpen(true);
    setNav((n) => ({ ...n, prev: n.step, focus: "note", seq: n.seq + 1, history: "none" }));
  }

  /** The terms are long on a phone: closing them comes back to their heading. */
  function closeTerms() {
    const d = termsRef.current;
    if (!d) return;
    d.open = false;
    const s = d.querySelector("summary");
    s?.scrollIntoView({ block: "start" });
    s?.focus({ preventScroll: true });
  }

  const changeDates = () => goBackTo(1, "from");

  function chooseInsurance(choice: "own" | "company" | "declined") {
    setInsurance(choice);
    touch("insuranceChoice");
    // Which documents are needed, and how much they weigh, changes with it.
    setProblem((p) => (p?.field === "licenceFile" || p?.field === "insuranceFile" ? null : p));
  }

  /*
   * Only Reserve, on the last step, submits. The browser has already checked
   * the required fields (see the invalid listener below); the steps are
   * checked again here, because a field can be changed after its step was
   * passed. Then the existing submit(), as before.
   */
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (nav.step !== 4) return;
    for (const k of [1, 2, 3] as Step[]) {
      const p = stepProblem(k, snapshot);
      if (p) {
        showProblem(k, p);
        return;
      }
    }
    const formData = new FormData(e.currentTarget);
    // The insurer and policy belong to "my own insurance" only; typed and
    // then left behind under another choice, they are not sent.
    if (insurance !== "own") {
      formData.delete("insuranceProvider");
      formData.delete("insurancePolicyNo");
    }
    setSendSeq((n) => n + 1);
    submit(formData);
  }

  /*
   * Enter moves to the next field on its step, and from the last one on the
   * first two steps it is Next. It never submits from a step where Reserve
   * is not even showing.
   */
  function onKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    const SINGLE = ["text", "tel", "email", "date", "search", "url"];
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !SINGLE.includes(t.type)) return;
    const section = t.closest<HTMLElement>("[data-step]");
    if (!section) return;
    e.preventDefault();
    const list = [...section.querySelectorAll("input")].filter(
      (el) => SINGLE.includes(el.type) && !el.disabled && !el.closest("[hidden]"),
    );
    const i = list.indexOf(t);
    if (i >= 0 && i < list.length - 1) list[i + 1].focus();
    else if (nav.step <= 2) next();
    else t.blur();
  }

  // Copies for the listeners below, which outlive any one render.
  useEffect(() => {
    snapRef.current = snapshot;
    lockedRef.current = locked;
    doneRef.current = isDone;
  });

  useEffect(() => {
    const form = formRef.current;
    /*
     * The safety net under Reserve.
     *
     * The browser checks required fields before it submits, but one on a
     * hidden step can't show its own message there. The first field it
     * refuses is taken to its step instead, with this form's message for it
     * where there is one, and the browser's bubble is suppressed. Nothing here
     * runs a check itself.
     */
    let handled = false;
    const onInvalid = (e: Event) => {
      e.preventDefault();
      if (handled) return;
      handled = true;
      window.setTimeout(() => {
        handled = false;
      }, 0);
      const el = e.target as HTMLInputElement;
      const k = (Number(el.closest<HTMLElement>("[data-step]")?.dataset.step) || 4) as Step;
      const snap = snapRef.current;
      const p = (snap && stepProblem(k, snap)) || { field: el.name, message: el.validationMessage };
      setProblem(p);
      setNav((n) => ({
        ...n,
        step: k,
        prev: n.step,
        focus: p.field || null,
        seq: n.seq + 1,
        history: k < n.step ? "back" : "none",
      }));
    };
    form?.addEventListener("invalid", onInvalid, true);

    let onPop: ((e: PopStateEvent) => void) | null = null;
    if (STEP_HISTORY) {
      // This visit's entries, told apart from an earlier visit's.
      flow.current = window.crypto?.randomUUID?.() ?? String(Math.random()).slice(2);
      window.history.replaceState(
        { ...window.history.state, aaaBooking: { flow: flow.current, step: 1 } },
        "",
      );
      onPop = (e: PopStateEvent) => {
        // The form's own history.go, after Back or Edit: already where it should be.
        if (traversing.current) {
          traversing.current = false;
          return;
        }
        const entry = e.state?.aaaBooking as StepEntry | undefined;
        if (!entry || entry.flow !== flow.current || typeof entry.step !== "number") return;
        const s = entry.step;
        // Booked: one Back leaves the page rather than walking back through
        // steps that are gone.
        if (doneRef.current) {
          if (s > 1) window.history.go(1 - s);
          else window.history.back();
          return;
        }
        // Sending, or not knowing whether it arrived: stay on the review.
        if (lockedRef.current) return;
        setProblem(null);
        setErrorFor(null);
        setNav((n) => {
          const t = Math.min(s, n.max) as Step;
          return t === n.step
            ? n
            : { ...n, step: t, prev: n.step, focus: null, seq: n.seq + 1, history: "none" };
        });
      };
      window.addEventListener("popstate", onPop);
    }
    return () => {
      form?.removeEventListener("invalid", onInvalid, true);
      if (onPop) window.removeEventListener("popstate", onPop);
    };
  }, []);

  /*
   * After every step change, before the screen is painted: the history
   * entry, the double-tap guard, and where focus goes — a field, a button
   * beside Reserve, or the step's heading. Scrolls are instant, and
   * scroll-padding keeps what is focused clear of the header and the bar.
   */
  useLayoutEffect(() => {
    if (nav.seq === 0) return;
    if (STEP_HISTORY && flow.current) {
      const here = window.history.state?.aaaBooking as StepEntry | undefined;
      if (nav.history === "push") {
        for (let k = nav.prev + 1; k <= nav.step; k++) {
          window.history.pushState(
            { ...window.history.state, aaaBooking: { flow: flow.current, step: k } },
            "",
          );
        }
      } else if (
        nav.history === "back" &&
        here?.flow === flow.current &&
        typeof here.step === "number"
      ) {
        if (here.step > nav.step) {
          traversing.current = true;
          window.setTimeout(() => {
            traversing.current = false;
          }, 500);
          window.history.go(nav.step - here.step);
        } else if (here.step !== nav.step) {
          window.history.replaceState(
            { ...window.history.state, aaaBooking: { flow: flow.current, step: nav.step } },
            "",
          );
        }
      }
    }
    // A second tap on the same spot lands on whatever replaced the button.
    armUntil.current = performance.now() + 500;

    const form = formRef.current;
    if (!form) return;
    const f = nav.focus;
    let target: HTMLElement | null | undefined = null;
    if (f?.startsWith("@")) {
      messagesRef.current?.scrollIntoView({ block: "nearest" });
      const actionName = f === "@changeDates" ? "changeDates" : f === "@reload" ? "reload" : null;
      target =
        (actionName && form.querySelector<HTMLElement>(`[data-action="${actionName}"]`)) ||
        barRef.current?.querySelector<HTMLElement>("button");
    } else if (f) {
      target = controlFor(form, f);
      target?.scrollIntoView({ block: "center" });
    }
    if (!target) {
      form.querySelector<HTMLElement>(`[data-step="${nav.step}"]`)?.scrollIntoView({ block: "start" });
      target = headings.current[nav.step];
    }
    target?.focus({ preventScroll: true });
  }, [nav]);

  // Back presses ignored while locked leave the entry behind the step; once
  // unlocked, the entry is brought back in line with the step on screen.
  useEffect(() => {
    if (!STEP_HISTORY || locked || traversing.current || !flow.current) return;
    const here = window.history.state?.aaaBooking as StepEntry | undefined;
    if (here?.flow === flow.current && here.step !== nav.step) {
      window.history.replaceState(
        { ...window.history.state, aaaBooking: { flow: flow.current, step: nav.step } },
        "",
      );
    }
  }, [locked, nav.step]);

  /*
   * The bar's height, for the page's bottom padding and scroll-padding, and
   * whether the card fits beside the photos on a wide screen: when it is
   * taller than the window, a sticky card could never show its bottom.
   */
  useEffect(() => {
    if (isDone) return;
    const bar = barRef.current;
    const form = formRef.current;
    if (!bar || !form) return;
    const aside = form.closest<HTMLElement>(".rental-book");
    const root = document.documentElement;
    const measure = () => {
      root.style.setProperty("--booking-bar-h", `${Math.ceil(bar.getBoundingClientRect().height)}px`);
      if (aside) {
        aside.dataset.fits = String(aside.getBoundingClientRect().height <= window.innerHeight - 124);
      }
    };
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    ro.observe(form);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty("--booking-bar-h");
      if (aside) delete aside.dataset.fits;
    };
  }, [isDone]);

  const draftJson = JSON.stringify({
    from,
    to,
    name: val("name"),
    phone: val("phone"),
    email: val("email"),
    note: val("note"),
  });
  useEffect(() => {
    if (draftChecked && !isDone) saveDraft(draftKey, JSON.parse(draftJson) as Draft);
  }, [draftChecked, isDone, draftKey, draftJson]);
  useEffect(() => {
    if (isDone) clearDraft(draftKey);
  }, [isDone, draftKey]);

  // A slow send says so after 8 seconds, so a long upload isn't taken for a hang.
  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => setSlowFor(sendSeq), 8000);
    return () => window.clearTimeout(t);
  }, [pending, sendSeq]);
  const slow = pending && slowFor === sendSeq;

  // Closing the tab mid-send asks first: the request may be half sent.
  useEffect(() => {
    if (!pending) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  if (state?.ok && state.reference && state.reference !== "—") {
    const payable = state.canPay && state.bookingId && state.amount;
    return (
      // A named region, so focus landing on it reads "Reserved for you".
      <section className="booking-done" ref={done} tabIndex={-1} aria-labelledby="booking-done-title">
        <i className="fas fa-circle-check" aria-hidden="true" />
        <p className="booking-done-title" id="booking-done-title">
          {state.heldFor ? "Reserved for you" : "Request received"}
        </p>
        <p className="booking-done-body">
          Your reference is{" "}
          <strong className="booking-ref">{state.reference}</strong>.
        </p>

        {/* The hold, said plainly. This is the sentence the whole reservation
            exists for: somebody who will not pay for a car they have not seen
            needs to know it will still be there when they arrive. */}
        {state.heldFor && (
          <p className="booking-done-hold">
            <i className="fas fa-lock" aria-hidden="true" /> This vehicle is
            held for you for <strong>{state.heldFor}</strong>. Nobody else can
            book these dates in that time.
          </p>
        )}

        <p className="booking-done-body">
          {/* A retry after a lost reply, recognized by the server: the first
              request had gone through, so the renter is told it is the same
              booking rather than a new one. */}
          {state.alreadyReserved
            ? payable
              ? "We already had this reservation, so nothing was booked twice. Pay now to confirm right away, or pay when you pick it up."
              : "We already had this reservation, so nothing was booked twice. Come and see the vehicle, and pay when you pick it up."
            : payable
            ? state.heldFor
              ? state.emailed
                ? "You can come see the vehicle first — we've emailed you a link to pay from your phone when you're ready. Or pay now to confirm right away."
                : "You can come see the vehicle first and pay from the link below when you're ready. Or pay now to confirm right away."
              : "Pay now to confirm these dates right away, or we'll call you to confirm."
            : state.heldFor
              ? "Come and see the vehicle, and pay when you pick it up. We'll call you to confirm."
              : tariff.depositMinor > 0
                ? "We'll contact you shortly to confirm availability and the deposit."
                : "We'll contact you shortly to confirm availability."}
        </p>

        {/* Facts the renter would otherwise have to ask for: where the link
            went, what it costs, and what to bring. */}
        {state.emailed && !payable && (
          <p className="booking-done-body">We&rsquo;re emailing you a link to this reservation.</p>
        )}
        {state.amount && !payable && (
          <p className="booking-done-body">
            Rental total: <strong>{state.amount}</strong>
          </p>
        )}
        <p className="booking-done-body">Bring your driver&rsquo;s license when you pick it up.</p>

        {/* No email was given, so the link the customer needs to pay later
            would otherwise exist nowhere they can reach. Shown here, once,
            to the person who just made the booking — and saying so, because
            this page is the only copy they will get. */}
        {state.heldFor && !state.emailed && state.reservationUrl && (
          <p className="booking-done-link">
            <strong>Save this link</strong> — it&rsquo;s the only copy, because no
            email was provided:
            <br />
            <a href={state.reservationUrl}>{state.reservationUrl}</a>
          </p>
        )}

        {/* Offered after the request is safely recorded, never instead of it:
            somebody who abandons the checkout has still made an enquiry. */}
        {payable && (
          <RentalPayButton bookingId={state.bookingId!} amount={state.amount!} deposit={tariff.depositMinor > 0} />
        )}
      </section>
    );
  }

  /*
   * The pinned bar's words. The price is always there: the rate before any
   * dates, then the total for the dates chosen, with what it includes, and
   * the deposit on a line of its own. It never mentions holds, availability
   * or paying online; those are said once, beside Reserve.
   */
  const quote = preview?.quote ?? null;
  const rate =
    tariff.weeklyMinor != null && tariff.minDays <= 7 && (tariff.maxDays == null || tariff.maxDays >= 7)
      ? `${fmt(tariff.weeklyMinor)} a week`
      : `${fmt(tariff.dailyMinor)} a day`;
  const barWarn = Boolean(datesWarn);
  const line1 = barWarn
    ? "Check your dates"
    : quote
      ? `${fmt(quote.totalMinor)} for ${quote.days} day${quote.days === 1 ? "" : "s"}`
      : rate;
  const addOns =
    barWarn || !quote
      ? null
      : quote.driverMinor > 0 && quote.injuryCoverMinor > 0
        ? "Includes a driver and added insurance"
        : quote.driverMinor > 0
          ? "Includes a driver"
          : quote.injuryCoverMinor > 0
            ? "Includes added insurance"
            : null;
  const deposit =
    tariff.depositMinor > 0 ? `+ ${fmt(tariff.depositMinor)} refundable deposit at pickup` : null;
  const pickingDates = step === 1 && (!from || !to);
  const nextLabel = !hydrated
    ? "Loading…"
    : pickingDates
      ? "Pick dates"
      : step === 3 && stillPreparing
        ? "Preparing photo…"
        : step === 3 || nav.max === 4
          ? "Review"
          : "Next";

  // The return date's limits, from the pickup date and this car's shortest
  // and longest rentals. Only after hydration: a page served from a cache
  // must not carry yesterday's "today".
  const fromDay = ISO_DAY.test(from) ? from : "";
  const toMin = hydrated ? addDaysIso(fromDay || today(), Math.max(1, tariff.minDays)) : undefined;
  const toMax = hydrated && fromDay && tariff.maxDays ? addDaysIso(fromDay, tariff.maxDays) : undefined;
  const reviewDay = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return ISO_DAY.test(iso) && !Number.isNaN(d.getTime())
      ? new Intl.DateTimeFormat(market.locale, {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(d)
      : iso;
  };
  const reviewDates =
    from && to
      ? `${reviewDay(from)} to ${reviewDay(to)} · ${days} day${days === 1 ? "" : "s"}${withDriver ? " · with a driver" : ""}`
      : "No dates chosen";
  // Not while the request may already be in: what was sent stays as it was.
  const editable = state?.sendFailed !== "unconfirmed";
  const coverageLabel =
    insurance === "own"
      ? "I have my own insurance"
      : insurance === "company"
        ? "Add me to your insurance"
        : "I don’t have insurance, and I accept the risk";

  /** Back, and where the renter is: four marks, this step lit. */
  const stepHead = (n: Step) => (
    <div className="booking-step-head">
      {n > 1 && editable && (
        <button
          type="button"
          className="booking-back"
          disabled={!hydrated || pending}
          onClick={() => goBackTo((n - 1) as Step, null)}
        >
          <i className="fas fa-chevron-left" aria-hidden="true" /> Back
          <span className="booking-sr"> to {BACK_TO[n]}</span>
        </button>
      )}
      <div className="booking-progress" aria-hidden="true">
        {([1, 2, 3, 4] as const).map((k) => (
          <span key={k} className={k < n ? "is-done" : k === n ? "is-current" : undefined} />
        ))}
      </div>
    </div>
  );

  /** The step's heading: where focus goes when a step opens. */
  const heading = (n: Step) => (
    <h3
      className="booking-step-title"
      id={fid(`step-${n}`)}
      tabIndex={-1}
      ref={(el) => {
        headings.current[n] = el;
      }}
    >
      <span className="booking-step-count">Step {n} of 4</span>
      <span className="booking-sr">, </span>
      {STEP_TITLES[n]}
    </h3>
  );

  /** The quote, on the first step as the dates are picked and again on the review. */
  const quoteBlock = quote && (
    <div className="booking-quote">
      <dl>
        {quote.lines.map((l) => (
          <div key={l.tier}>
            <dt className="booking-quote-line">
              {l.quantity} {unitLabel(l.tier, l.quantity)} at {fmt(l.unitMinor)}
            </dt>
            <dd>{fmt(l.subtotalMinor)}</dd>
          </div>
        ))}
        {quote.driverMinor > 0 && (
          <div>
            <dt className="booking-quote-line">
              Driver × {quote.days} day{quote.days === 1 ? "" : "s"}
            </dt>
            <dd>{fmt(quote.driverMinor)}</dd>
          </div>
        )}
        {/* In the itemised quote AND inside the total below it. A fee the
            customer only meets at the counter is the thing the business
            explicitly asked to avoid. */}
        {quote.injuryCoverMinor > 0 && (
          <div className="booking-quote-cover">
            <dt className="booking-quote-line">
              Added insurance × {quote.days} day
              {quote.days === 1 ? "" : "s"}
            </dt>
            <dd>{fmt(quote.injuryCoverMinor)}</dd>
          </div>
        )}
        <div className="booking-quote-total">
          <dt>
            Total for {quote.days} day{quote.days === 1 ? "" : "s"}
          </dt>
          <dd>{fmt(quote.totalMinor)}</dd>
        </div>
        {quote.depositMinor > 0 && (
          <div className="booking-quote-deposit">
            <dt>Refundable deposit</dt>
            <dd>{fmt(quote.depositMinor)}</dd>
          </div>
        )}
      </dl>
      {quote.savingNote && <p className="booking-saving">{quote.savingNote}</p>}
    </div>
  );

  return (
    /*
     * onSubmit, not action={…}. React resets a form after an `action` prop
     * runs, by calling the browser's own form.reset(). Text fields held in
     * state survive that, but checkboxes and radio buttons do not: after any
     * round trip — a failed send, or just a "please fix this field" from the
     * server — the insurance option still looked chosen (its highlight comes
     * from state) while its radio button was cleared, so resubmitting sent no
     * choice at all and came back with an error the renter could not see a
     * reason for. Dispatching the same action from onSubmit keeps `pending`
     * and the result, without the reset. The browser still checks required
     * fields first: submit only fires for a valid form.
     *
     * method="post" because without an `action` the browser's own submit
     * would be a GET — the renter's details in the address bar and the
     * server's logs — if one ever happened before the page hydrated. Reserve
     * is also disabled until then.
     *
     * data-typing slides the pinned bar out of the keyboard's way on a phone
     * while a field that types is focused (see refine.css, section 23b).
     */
    <form
      ref={formRef}
      method="post"
      onSubmit={onSubmit}
      onKeyDown={onKeyDown}
      onFocus={(e) => setTyping(isTextEntry(e.target))}
      onBlur={(e) => {
        if (!isTextEntry(e.relatedTarget)) setTyping(false);
      }}
      className="booking-form"
      data-typing={typing ? "" : undefined}
    >
      {/* Sent with every request, whichever step it comes from. */}
      <input type="hidden" name="marketCode" value={market.code} />
      <input type="hidden" name="vehicleSlug" value={vehicleSlug} />
      {withDriver && <input type="hidden" name="withDriver" value="true" />}
      <input type="hidden" name="termsVersion" value={RENTAL_TERMS_VERSION} />

      <div
        aria-hidden
        style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}
      >
        {/* Only a bot fills this in. Not called "website": browsers autofill
            a field by that name, and a renter's booking was refused for it. */}
        <label>
          Leave this empty
          <input type="text" name="leave_empty" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <noscript>
        <p className="booking-warn">
          {phoneLabel
            ? `Booking online needs JavaScript. Call or text us at ${phoneLabel} to reserve.`
            : "Booking online needs JavaScript. Contact us to reserve."}
        </p>
      </noscript>

      <span className="booking-sr" role="status">
        {stepNote}
      </span>

      {/* ── Step 1: dates ─────────────────────────────────────────────── */}
      <section
        className="booking-step"
        data-step="1"
        hidden={step !== 1}
        aria-labelledby={fid("step-1")}
      >
        {stepHead(1)}
        {heading(1)}
        <p className="booking-step-lead">Pick your dates to see the price.</p>
        {restored && (
          <p className="booking-restored" role="status">
            We kept what you typed before. Photos and ID numbers aren&rsquo;t saved, so
            you&rsquo;ll add those again.
          </p>
        )}

        <div className="booking-dates">
          <div className="booking-field">
            <label htmlFor={fid("from")}>Pickup date</label>
            <input
              id={fid("from")}
              name="from"
              type="date"
              required
              disabled={!hydrated}
              min={hydrated ? today() : undefined}
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                touch("from");
                touch("to");
              }}
              {...describe("from", [showDatesWarn && fid("dates-warn")])}
            />
            <Err id={eid("from")}>{fieldMsg("from")}</Err>
          </div>
          <div className="booking-field">
            <label htmlFor={fid("to")}>Return date</label>
            <input
              id={fid("to")}
              name="to"
              type="date"
              required
              disabled={!hydrated}
              min={toMin}
              max={toMax}
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                touch("from");
                touch("to");
              }}
              {...describe("to", [showDatesWarn && fid("dates-warn")])}
            />
            <Err id={eid("to")}>{fieldMsg("to")}</Err>
          </div>
        </div>

        {/* Shortcuts for the usual lengths. They set the return date only
            when tapped: filling one in by itself would choose a bigger
            purchase for the renter. */}
        {hydrated && fromDay !== "" && lengths.length > 0 && (
          <div className="booking-lengths" role="group" aria-labelledby={fid("lengths")}>
            <p id={fid("lengths")}>Or pick a length</p>
            <div className="booking-lengths-row">
              {lengths.map((l) => (
                <button
                  key={l.n}
                  type="button"
                  className="booking-length"
                  aria-pressed={days === l.n}
                  onClick={() => {
                    setTo(addDaysIso(fromDay, l.n));
                    touch("from");
                    touch("to");
                  }}
                >
                  <strong>{l.label}</strong>
                  <span>{fmt(l.total)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {showDatesWarn && (
          <p className="booking-warn" id={fid("dates-warn")} role="status">
            {datesWarn}
          </p>
        )}

        {tariff.withDriverAvailable && (
          <>
            <label className="booking-driver">
              <input
                type="checkbox"
                data-field="withDriver"
                checked={withDriver}
                disabled={!hydrated}
                onChange={(e) => {
                  setWithDriver(e.target.checked);
                  touch("withDriver");
                }}
                {...describe("withDriver")}
              />
              With a driver
              {tariff.driverDailyMinor != null && (
                <span className="booking-driver-rate">+{fmt(tariff.driverDailyMinor)}/day</span>
              )}
            </label>
            <Err id={eid("withDriver")}>{fieldMsg("withDriver")}</Err>
          </>
        )}

        {/* The dates other renters have, beside the dates being chosen. A
            hold that has run out since the page was cached is left off. */}
        {shownTaken.length > 0 && (
          <div className="booking-taken">
            <h4>Already booked</h4>
            <p>You can pick up on a return date.</p>
            <ul className="rental-taken">
              {shownTaken.map((w, i) => (
                <li key={`${w.start}-${i}`}>
                  <i className="fas fa-calendar-xmark" aria-hidden="true" />
                  {w.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {quoteBlock}
      </section>

      {/* ── Step 2: who is renting ────────────────────────────────────── */}
      <section
        className="booking-step"
        data-step="2"
        hidden={step !== 2}
        aria-labelledby={fid("step-2")}
      >
        {stepHead(2)}
        {heading(2)}

        <div className="booking-field">
          <label htmlFor={fid("name")}>
            Full name <em>as on your license</em>
          </label>
          <input
            id={fid("name")}
            name="name"
            required
            autoComplete="name"
            autoCapitalize="words"
            maxLength={120}
            enterKeyHint="next"
            value={val("name")}
            onChange={set("name")}
            {...describe("name")}
          />
          <Err id={eid("name")}>{fieldMsg("name")}</Err>
        </div>

        <div className="booking-field">
          <label htmlFor={fid("phone")}>
            Phone <em>{market.code === "us" ? "with area code" : "full number"}</em>
          </label>
          <input
            id={fid("phone")}
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            maxLength={40}
            enterKeyHint="next"
            value={val("phone")}
            onChange={set("phone")}
            {...describe("phone")}
          />
          <Err id={eid("phone")}>{fieldMsg("phone")}</Err>
        </div>

        <div className="booking-field">
          <label htmlFor={fid("email")}>
            Email <em>recommended — we send your reservation link here</em>
          </label>
          <input
            id={fid("email")}
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={254}
            enterKeyHint="next"
            value={val("email")}
            onChange={set("email")}
            {...describe("email", [market.code === "ng" && payOnline && fid("email-hint")])}
          />
          {market.code === "ng" && payOnline && (
            <span className="booking-field-hint" id={fid("email-hint")}>
              Needed to pay online.
            </span>
          )}
          <Err id={eid("email")}>{fieldMsg("email")}</Err>
        </div>

        {/* Optional, so folded: always mounted, so a draft or the server can
            open it. */}
        {!noteOpen && (
          <button
            type="button"
            className="booking-note-toggle"
            aria-expanded="false"
            aria-controls={fid("note-wrap")}
            onClick={openNote}
          >
            + Add a note
          </button>
        )}
        <div className="booking-field" id={fid("note-wrap")} hidden={!noteOpen}>
          <label htmlFor={fid("note")}>
            Anything else we should know? <em>optional</em>
          </label>
          <textarea
            id={fid("note")}
            name="note"
            rows={3}
            maxLength={2000}
            value={val("note")}
            onChange={set("note")}
            {...describe("note")}
          />
          <Err id={eid("note")}>{fieldMsg("note")}</Err>
        </div>
      </section>

      {/* ── Step 3: license and insurance ─────────────────────────────────
          The order here is the point: the notice, then the choice, then the
          documents, then the declaration that the notice was read. */}
      <section
        className="booking-step"
        data-step="3"
        hidden={step !== 3}
        aria-labelledby={fid("step-3")}
      >
        {stepHead(3)}
        {heading(3)}

        {/* ── Insurance ─────────────────────────────────────────────────────
            The notice comes first, and it is shown to everybody rather than
            only to the person declining cover. What the business insures and
            what it does not is the single most consequential thing on this
            page, and a renter with their own policy still needs to know where
            our cover stops. */}
        <div className="booking-injury-notice" id={fid("injury-notice")}>
          <p className="booking-injury-notice-head">
            <i className="fas fa-triangle-exclamation" aria-hidden="true" />
            The vehicle is insured. You are not.
          </p>
          <p>
            Our insurance covers this vehicle if it is involved in an accident.
            It does <strong>not</strong> cover bodily injury to you, the renter.
            If you are injured while driving, our insurance will not pay your
            medical bills.
          </p>
        </div>

        <fieldset
          className="booking-insurance"
          aria-describedby={describe("insuranceChoice", [fid("injury-notice")])["aria-describedby"]}
        >
          <legend>How will you be covered?</legend>

          <label
            className={`booking-insurance-option${insurance === "own" ? " is-chosen" : ""}`}
          >
            <input
              type="radio"
              id={fid("insuranceChoice-own")}
              name="insuranceChoice"
              value="own"
              checked={insurance === "own"}
              onChange={() => chooseInsurance("own")}
            />
            <span className="booking-insurance-body">
              <strong>I have my own insurance</strong>
              {/* Said only beside an option that does cost extra. */}
              {coverOffered && <span className="booking-insurance-price">No extra charge</span>}
              <small>
                Attach your insurance document below for review and safety
                purposes.
              </small>
            </span>
          </label>

          {coverOffered && (
            <label
              className={`booking-insurance-option${insurance === "company" ? " is-chosen" : ""}`}
            >
              <input
                type="radio"
                id={fid("insuranceChoice-company")}
                name="insuranceChoice"
                value="company"
                checked={insurance === "company"}
                onChange={() => chooseInsurance("company")}
              />
              <span className="booking-insurance-body">
                <strong>Add me to your insurance</strong>
                {/* The figure, large and in the option itself — not in a
                    footnote, and not only in the total. */}
                <span className="booking-insurance-price booking-insurance-fee">
                  + {fmt(tariff.injuryCoverDailyMinor!)} per day
                  {preview?.quote && insurance === "company" && (
                    <em> — {fmt(preview.quote.injuryCoverMinor)} for this rental</em>
                  )}
                </span>
                {/* How it actually works, per the founder: the business does not
                    sell insurance — it has no licence to — but its licensed
                    insurer can add a renter to the business's policy for a fee.
                    Saying so is both accurate and the thing that keeps this
                    option on the right side of insurance licensing. */}
                <small>
                  We arrange with our licensed insurance company to add you as a
                  driver on our policy for the full rental period. The extra cost
                  is set by the insurer.
                </small>
              </span>
            </label>
          )}

          {/* An allowed choice, and the expected one. It is not hidden behind
              small print or made to look like a mistake — but it is explicit,
              because the point of the notice above is being able to show
              afterwards that this person read it and chose. */}
          <label
            className={`booking-insurance-option${insurance === "declined" ? " is-chosen" : ""}`}
          >
            <input
              type="radio"
              id={fid("insuranceChoice-declined")}
              name="insuranceChoice"
              value="declined"
              checked={insurance === "declined"}
              onChange={() => chooseInsurance("declined")}
            />
            <span className="booking-insurance-body">
              <strong>I don&rsquo;t have insurance, and I accept the risk</strong>
              {coverOffered && <span className="booking-insurance-price">No extra charge</span>}
              <small>
                I understand that if I am injured while driving this vehicle,
                <strong> the rental company&rsquo;s insurance does not cover me</strong>,
                and I am responsible for my own medical bills.
              </small>
            </span>
          </label>

          <Err id={eid("insuranceChoice")}>{fieldMsg("insuranceChoice")}</Err>
        </fieldset>

        <div className="booking-licence">
          <div className="booking-field">
            <label htmlFor={fid("licenceFile")}>
              Photo of your driver&rsquo;s license <em>required</em>
            </label>
            {/* No `capture`: forcing the camera meant a renter could not attach a
                photo they already had, and could never attach a screenshot or
                PDF of a digital insurance card. Staff still see the physical
                license at pickup. Plain image/* also lets an iPhone hand over
                a JPEG rather than its HEIC original. Not `required`: the
                photo sent is the shrunk copy held in state, checked by the
                step. */}
            <input
              id={fid("licenceFile")}
              type="file"
              name="licenceFile"
              accept="image/*,application/pdf"
              aria-required="true"
              onChange={(e) => {
                touch("licenceFile");
                void attach("licence", e.currentTarget);
              }}
              {...describe("licenceFile", [
                market.code === "us" && fid("licence-hint"),
                docErrors.licence && fid("licence-pick"),
              ])}
            />
            {market.code === "us" && (
              <span className="booking-field-hint" id={fid("licence-hint")}>
                License from outside the US? Bring your International Driving Permit and
                passport to pickup.
              </span>
            )}
            <span className="booking-attach-status" role="status">
              {preparing.licence ? (
                <span className="booking-attached">
                  <i className="fas fa-spinner fa-spin" aria-hidden="true" /> Preparing photo…
                </span>
              ) : (
                licenceFile && (
                  <span className="booking-attached">
                    <i className="fas fa-check" aria-hidden="true" /> {licenceFile.name}
                  </span>
                )
              )}
            </span>
            <Err id={fid("licence-pick")} alert>
              {docErrors.licence}
            </Err>
            <Err id={eid("licenceFile")}>{fieldMsg("licenceFile")}</Err>
          </div>

          {/* Asked for only from renters who say they have a policy. Demanding
              a certificate from somebody who has already said they have none
              would turn the notice above into a refusal, which is not the
              business's position. */}
          <div className="booking-field" hidden={insurance !== "own"}>
            <label htmlFor={fid("insuranceFile")}>
              Proof of insurance <em>required</em>
            </label>
            <input
              id={fid("insuranceFile")}
              type="file"
              name="insuranceFile"
              accept="image/*,application/pdf"
              aria-required="true"
              onChange={(e) => {
                touch("insuranceFile");
                void attach("insurance", e.currentTarget);
              }}
              {...describe("insuranceFile", [docErrors.insurance && fid("insurance-pick")])}
            />
            <span className="booking-attach-status" role="status">
              {preparing.insurance ? (
                <span className="booking-attached">
                  <i className="fas fa-spinner fa-spin" aria-hidden="true" /> Preparing photo…
                </span>
              ) : (
                insuranceFile && (
                  <span className="booking-attached">
                    <i className="fas fa-check" aria-hidden="true" /> {insuranceFile.name}
                  </span>
                )
              )}
            </span>
            <Err id={fid("insurance-pick")} alert>
              {docErrors.insurance}
            </Err>
            <Err id={eid("insuranceFile")}>{fieldMsg("insuranceFile")}</Err>
          </div>

          {/* Every sentence here describes something the code actually does.
              Reassurance a system does not deliver is worse than none. */}
          <p className="booking-licence-note">
            <i className="fas fa-lock" aria-hidden="true" />
            <span>
              Your documents are stored privately, never shown on this website,
              and can only be opened by our staff through a link that expires
              within minutes. We will never ask for your bank details, card
              number or {market.code === "us" ? "SSN" : "BVN"} — here or by
              email.
            </span>
          </p>

          <div className="booking-field">
            <label htmlFor={fid("licenceNo")}>
              Driver&rsquo;s license number <em>optional</em>
            </label>
            <input
              id={fid("licenceNo")}
              name="licenceNo"
              maxLength={60}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint={insurance === "own" ? "next" : "done"}
              value={val("licenceNo")}
              onChange={set("licenceNo")}
              {...describe("licenceNo")}
            />
            <Err id={eid("licenceNo")}>{fieldMsg("licenceNo")}</Err>
          </div>

          <div className="booking-field-row" hidden={insurance !== "own"}>
            <div className="booking-field">
              <label htmlFor={fid("insuranceProvider")}>
                Insurance company <em>optional</em>
              </label>
              <input
                id={fid("insuranceProvider")}
                name="insuranceProvider"
                autoComplete="off"
                maxLength={120}
                enterKeyHint="next"
                value={val("insuranceProvider")}
                onChange={set("insuranceProvider")}
                {...describe("insuranceProvider")}
              />
              <Err id={eid("insuranceProvider")}>{fieldMsg("insuranceProvider")}</Err>
            </div>
            <div className="booking-field">
              <label htmlFor={fid("insurancePolicyNo")}>
                Policy number <em>optional</em>
              </label>
              <input
                id={fid("insurancePolicyNo")}
                name="insurancePolicyNo"
                maxLength={80}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
                value={val("insurancePolicyNo")}
                onChange={set("insurancePolicyNo")}
                {...describe("insurancePolicyNo")}
              />
              <Err id={eid("insurancePolicyNo")}>{fieldMsg("insurancePolicyNo")}</Err>
            </div>
          </div>
        </div>

        {/* Declared, not collected.
            Age eligibility needs a date of birth, and the licence already
            carries one — so this is checked against the document rather than
            stored as a second copy of it. Last on the step, after the notice
            it says was read. */}
        <label className="booking-consent">
          <input
            type="checkbox"
            name="confirmEligible"
            required
            checked={eligible}
            onChange={(e) => {
              setEligible(e.target.checked);
              touch("confirmEligible");
            }}
            {...describe("confirmEligible")}
          />
          <span>
            I am 18 or older, I have a valid driver&rsquo;s license for the entire
            rental period, and the documents I attached are my own. I understand
            the vehicle will not be released until our team has reviewed them,
            and I have read the injury notice above.
          </span>
        </label>
        <Err id={eid("confirmEligible")}>{fieldMsg("confirmEligible")}</Err>
      </section>

      {/* ── Step 4: review, terms, Reserve ────────────────────────────── */}
      <section
        className="booking-step"
        data-step="4"
        hidden={step !== 4}
        aria-labelledby={fid("step-4")}
      >
        {stepHead(4)}
        {heading(4)}
        <p className="booking-step-lead">
          Check your details, then read and accept the rental terms below.
        </p>

        <dl className="booking-review">
          <div>
            <dt>Dates</dt>
            <dd>{reviewDates}</dd>
            {editable && (
              <dd className="booking-review-action">
                <button
                  type="button"
                  className="booking-review-edit"
                  disabled={pending}
                  onClick={() => goBackTo(1, "from")}
                >
                  Edit<span className="booking-sr"> dates</span>
                </button>
              </dd>
            )}
          </div>
          <div>
            <dt>Your details</dt>
            <dd>
              {val("name")}
              <br />
              {val("phone")}
              <br />
              {val("email").trim() || "No email"}
            </dd>
            {editable && (
              <dd className="booking-review-action">
                <button
                  type="button"
                  className="booking-review-edit"
                  disabled={pending}
                  onClick={() => goBackTo(2, "name")}
                >
                  Edit<span className="booking-sr"> your details</span>
                </button>
              </dd>
            )}
          </div>
          <div>
            <dt>Coverage</dt>
            <dd>{coverageLabel}</dd>
            {editable && (
              <dd className="booking-review-action">
                <button
                  type="button"
                  className="booking-review-edit"
                  disabled={pending}
                  onClick={() => goBackTo(3, "insuranceChoice")}
                >
                  Edit<span className="booking-sr"> coverage</span>
                </button>
              </dd>
            )}
          </div>
          <div>
            <dt>Documents</dt>
            <dd>
              Driver&rsquo;s license: {licenceFile ? licenceFile.name : "not attached"}
              {insurance === "own" && (
                <>
                  <br />
                  Proof of insurance: {insuranceFile ? insuranceFile.name : "not attached"}
                </>
              )}
            </dd>
            {editable && (
              <dd className="booking-review-action">
                <button
                  type="button"
                  className="booking-review-edit"
                  disabled={pending}
                  onClick={() => goBackTo(3, "licenceFile")}
                >
                  Edit<span className="booking-sr"> documents</span>
                </button>
              </dd>
            )}
          </div>
          {val("note").trim() !== "" && (
            <div>
              <dt>Note</dt>
              <dd>{val("note")}</dd>
              {editable && (
                <dd className="booking-review-action">
                  <button
                    type="button"
                    className="booking-review-edit"
                    disabled={pending}
                    onClick={() => {
                      setNoteOpen(true);
                      goBackTo(2, "note");
                    }}
                  >
                    Edit<span className="booking-sr"> note</span>
                  </button>
                </dd>
              )}
            </div>
          )}
        </dl>

        {quoteBlock}

        {/* Read before the request, not handed over at the counter. Folded so
            the form still reads as a form, and open on demand — a checkbox
            pointing at terms nobody can see is not consent. */}
        <details ref={termsRef} className="booking-terms">
          <summary>
            <i className="fas fa-file-contract" aria-hidden="true" /> Rental terms
            <span>please read before reserving</span>
          </summary>
          <div className="booking-terms-body">
            {RENTAL_CLAUSES.map((c, i) => (
              <section key={c.heading}>
                <h4>
                  {i + 1}. {c.heading}
                </h4>
                <p>
                  {fillClause(c.body, {
                    law: market.code === "us" ? "North Carolina" : "Nigerian",
                  })}
                </p>
              </section>
            ))}
            <button type="button" className="booking-terms-close" onClick={closeTerms}>
              Close terms
            </button>
          </div>
        </details>

        <label className="booking-accept">
          <input
            type="checkbox"
            name="acceptTerms"
            required
            checked={acceptedTerms}
            onChange={(e) => {
              setAcceptedTerms(e.target.checked);
              touch("acceptTerms");
            }}
            {...describe("acceptTerms")}
          />
          <span>
            I have read and agree to the rental terms above.
          </span>
        </label>
        <Err id={eid("acceptTerms")}>{fieldMsg("acceptTerms")}</Err>

        {/* Promises only what is on offer: while online payment is switched off
            (no live key yet) there is no "pay online" to choose. */}
        <p className="booking-fineprint">
          We hold the vehicle for you for up to {RESERVATION_HOURS / 24} days after
          you reserve.{" "}
          {payOnline
            ? "Pay online right away, or come see it first and pay when you pick it up."
            : "Come see it first, and pay when you pick it up."}
          {tariff.depositMinor > 0 && " The refundable deposit is taken at pickup."}
        </p>

        {/* Every answer to Reserve, directly above it, where the renter is
            looking. A field's own message is shown on its step instead. */}
        <div className="booking-messages" ref={messagesRef}>
          {generalText && (
            <div className="booking-alert" role="alert">
              <p>{generalText}</p>
              {isDatesError(generalText) && (
                <button
                  type="button"
                  className="btn btn-outline booking-change-dates"
                  data-action="changeDates"
                  onClick={changeDates}
                >
                  Change dates
                </button>
              )}
            </div>
          )}

          {state?.sendFailed && (
            <div className="booking-fallback" role="alert">
              <p>
                <strong>
                  {state.sendFailed === "reload" ? "Please reload." : "No confirmation yet."}
                </strong>{" "}
                {state.error}
              </p>
              {state.sendFailed === "reload" && (
                <div className="booking-fallback-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    data-action="reload"
                    onClick={() => window.location.reload()}
                  >
                    <i className="fas fa-rotate-right" aria-hidden="true" /> Reload the page
                  </button>
                </div>
              )}
              {state.sendFailed === "unconfirmed" && (
                <div className="booking-fallback-actions">
                  {smsHref && telHref ? (
                    <>
                      <a className="btn btn-primary" href={smsHref}>
                        <i className="fas fa-comment-sms" aria-hidden="true" /> Text us
                      </a>
                      <a className="btn btn-outline" href={telHref}>
                        <i className="fas fa-phone" aria-hidden="true" /> Call us
                      </a>
                    </>
                  ) : (
                    <a className="btn btn-outline" href={`/${market.code}/contact`}>
                      <i className="fas fa-envelope" aria-hidden="true" /> Contact us
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* A refusal at the moment of pressing Reserve, shown where the renter is
              looking. The message beside the upload field is for choosing files. */}
          {docErrors.submit && (
            <p className="booking-alert" role="alert">
              {docErrors.submit}
            </p>
          )}

          {slow && (
            <p className="booking-sending" role="status">
              Still sending. Large photos can take a minute on a slow connection. Keep
              this page open.
            </p>
          )}
        </div>
      </section>

      {/*
       * The price and the next step, pinned to the bottom of a phone's
       * screen (refine.css, section 23b) and at the end of the card on a
       * wider one. Inside the form, so Reserve is the form's own submit
       * button. Next and Reserve are two different buttons, never one that
       * changes type.
       */}
      <div className="booking-bar" ref={barRef} role="group" aria-label="Price and next step">
        <p
          className={`booking-bar-price${barWarn ? " is-warning" : ""}`}
          aria-live="polite"
          aria-atomic="true"
        >
          <strong>{line1}</strong>
          {addOns && <span className="booking-bar-addons">{addOns}</span>}
          {deposit && <span>{deposit}</span>}
        </p>
        {step < 4 ? (
          <button
            key="next"
            type="button"
            className="btn btn-primary booking-bar-btn"
            disabled={!hydrated}
            aria-disabled={step === 3 && stillPreparing ? true : undefined}
            onClick={pickingDates ? pickDates : next}
          >
            {nextLabel}
          </button>
        ) : (
          <button
            key="reserve"
            type="submit"
            className="btn btn-primary booking-bar-btn"
            // A page the server no longer recognizes can only fail again.
            disabled={!hydrated || pending || stillPreparing || state?.sendFailed === "reload"}
            onClick={(e) => {
              if (performance.now() < armUntil.current) e.preventDefault();
            }}
          >
            {pending
              ? "Reserving…"
              : stillPreparing
                ? "Preparing photo…"
                : state?.sendFailed === "unconfirmed"
                  ? "Try again"
                  : "Reserve"}{" "}
            <i className="fas fa-calendar-check" aria-hidden="true" />
          </button>
        )}
        <span className="booking-sr" role="status">
          {pending ? "Sending your request…" : ""}
        </span>
      </div>
    </form>
  );
}

/**
 * A message under a field, linked to it by its id. `alert` for ones that
 * appear without a submit — a file refused the moment it was chosen — so a
 * screen reader hears them. Nothing at all when there is no message.
 */
function Err({
  id,
  children,
  alert = false,
}: {
  id?: string;
  children: React.ReactNode;
  alert?: boolean;
}) {
  if (!children) return null;
  return (
    <span className="field-error" id={id} role={alert ? "alert" : undefined}>
      {children}
    </span>
  );
}
