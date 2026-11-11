"use client";

import { useActionToast, pushToast } from "@/components/Toast";

import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useState,
  useRef,
  useSyncExternalStore,
} from "react";
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
import {
  shrinkPhoto,
  megabytes,
  DOCUMENT_PHOTO,
  UPLOAD_LIMIT_BYTES,
  UPLOAD_LIMIT_LABEL,
} from "@/lib/shrinkPhoto";

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

/** Never changes; lets useSyncExternalStore answer "has this page hydrated?". */
const subscribeNothing = () => () => {};

export function RentalBookingForm({
  market,
  vehicleSlug,
  vehicleTitle,
  contactPhone,
  payOnline,
  tariff,
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
  // toast on top of it read oddly after reserving a car.
  useActionToast(state?.ok ? null : state);

  /*
   * Reserve stays disabled until the page has hydrated.
   *
   * The form is submitted by onSubmit (see the <form> below), so before the
   * JavaScript runs a tap would be a plain browser submit. That used to be a
   * GET, which put the renter's name, phone and email in the address bar and
   * the server logs. The form now says method="post" as well, but nothing
   * should be submitted before the code that checks and sends it is there.
   */
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

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
  ) => setFields((f) => ({ ...f, [name]: e.target.value }));
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
   * When the form came alive, kept in a ref; the time since then goes with
   * the request, as the bot check.
   *
   * Sent as a duration, measured on this phone's clock alone. It used to be
   * the phone's clock reading, compared with the server's: a phone whose
   * clock ran fast looked like a bot, and its booking was quietly dropped
   * while the renter was told it had been saved.
   */
  const mountedAt = useRef(0);

  /*
   * The confirmation replaces the form from the top, which on a phone is
   * well above the Reserve button just pressed: without this the screen
   * seemed not to change at all. Brought into view and focused, so it is
   * seen, and read out by a screen reader.
   */
  const done = useRef<HTMLDivElement>(null);
  const isDone = Boolean(state?.ok && state.reference && state.reference !== "—");
  useEffect(() => {
    if (!isDone || !done.current) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    done.current.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
    done.current.focus({ preventScroll: true });
  }, [isDone]);
  useEffect(() => {
    mountedAt.current = performance.now();
  }, []);

  const submit = (formData: FormData) => {
    // A monotonic clock: the wall clock can jump while the form is open.
    formData.set("elapsedMs", String(Math.round(performance.now() - mountedAt.current)));

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

  const fmt = (minor: number) =>
    formatMoney(money(minor, market.currency), market.locale, { showDecimals: true });

  if (state?.ok && state.reference && state.reference !== "—") {
    const payable = state.canPay && state.bookingId && state.amount;
    return (
      <div className="booking-done" ref={done} tabIndex={-1}>
        <i className="fas fa-circle-check" aria-hidden="true" />
        <p className="booking-done-title">
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
          <RentalPayButton bookingId={state.bookingId!} amount={state.amount!} />
        )}
      </div>
    );
  }

  const err = (f: string) => state?.fieldErrors?.[f]?.[0];

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
     */
    <form
      method="post"
      onSubmit={(e) => {
        e.preventDefault();
        submit(new FormData(e.currentTarget));
      }}
      className="booking-form"
    >
      <input type="hidden" name="marketCode" value={market.code} />
      <input type="hidden" name="vehicleSlug" value={vehicleSlug} />
      {withDriver && <input type="hidden" name="withDriver" value="true" />}

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

      {/* A send that failed is reported beside the button instead, with a way
          to reach a person; this spot is several screens above it. */}
      {state?.error && !state.sendFailed && (
        <p className="booking-alert" role="alert">
          {state.error}
        </p>
      )}

      <div className="booking-dates">
        <label className="booking-field">
          <span>Pickup date</span>
          <input
            name="from"
            type="date"
            required
            min={today()}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            
          />
          {err("from") && <Err>{err("from")}</Err>}
        </label>
        <label className="booking-field">
          <span>Return date</span>
          <input
            name="to"
            type="date"
            required
            min={from || today()}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            
          />
          {err("to") && <Err>{err("to")}</Err>}
        </label>
      </div>

      {tariff.withDriverAvailable && (
        <label className="booking-driver">
          <input
            type="checkbox"
            checked={withDriver}
            onChange={(e) => setWithDriver(e.target.checked)}
            
          />
          With a driver
          {tariff.driverDailyMinor != null && (
            <span className="booking-driver-rate">+{fmt(tariff.driverDailyMinor)}/day</span>
          )}
        </label>
      )}

      {/* Live quote */}
      {preview?.error && (
        <p className="booking-warn">
          {preview.error}
        </p>
      )}
      {preview?.quote && (
        <div className="booking-quote">
          <dl>
            {preview.quote.lines.map((l) => (
              <div key={l.tier}>
                <dt className="booking-quote-line">
                  {l.quantity} × {unitLabel(l.tier, l.quantity)} @ {fmt(l.unitMinor)}
                </dt>
                <dd>{fmt(l.subtotalMinor)}</dd>
              </div>
            ))}
            {preview.quote.driverMinor > 0 && (
              <div>
                <dt className="booking-quote-line">Driver × {preview.quote.days} days</dt>
                <dd>{fmt(preview.quote.driverMinor)}</dd>
              </div>
            )}
            {/* In the itemised quote AND inside the total below it. A fee the
                customer only meets at the counter is the thing the business
                explicitly asked to avoid. */}
            {preview.quote.injuryCoverMinor > 0 && (
              <div className="booking-quote-cover">
                <dt className="booking-quote-line">
                  Added insurance × {preview.quote.days} day
                  {preview.quote.days === 1 ? "" : "s"}
                </dt>
                <dd>{fmt(preview.quote.injuryCoverMinor)}</dd>
              </div>
            )}
            <div className="booking-quote-total">
              <dt>
                Total for {preview.quote.days} day{preview.quote.days === 1 ? "" : "s"}
              </dt>
              <dd>{fmt(preview.quote.totalMinor)}</dd>
            </div>
            {preview.quote.depositMinor > 0 && (
              <div className="booking-quote-deposit">
                <dt>Refundable deposit</dt>
                <dd>{fmt(preview.quote.depositMinor)}</dd>
              </div>
            )}
          </dl>
          {preview.quote.savingNote && (
            <p className="booking-saving">{preview.quote.savingNote}</p>
          )}
        </div>
      )}

      <label className="booking-field">
        <span>Your name</span>
        <input name="name" required autoComplete="name" value={val("name")} onChange={set("name")} />
        {err("name") && <Err>{err("name")}</Err>}
      </label>

      <label className="booking-field">
        <span>Phone</span>
        <input name="phone" type="tel" required autoComplete="tel" value={val("phone")} onChange={set("phone")} />
        {err("phone") && <Err>{err("phone")}</Err>}
      </label>

      <label className="booking-field">
        <span>
          Email <em>recommended — we send your reservation link here</em>
        </span>
        <input name="email" type="email" autoComplete="email" value={val("email")} onChange={set("email")} />
        {err("email") && <Err>{err("email")}</Err>}
      </label>

      {/* ── Insurance ─────────────────────────────────────────────────────
          The notice comes first, and it is shown to everybody rather than
          only to the person declining cover. What the business insures and
          what it does not is the single most consequential thing on this
          page, and a renter with their own policy still needs to know where
          our cover stops. */}
      <div className="booking-injury-notice">
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

      <fieldset className="booking-insurance">
        <legend>How will you be covered?</legend>

        <label
          className={`booking-insurance-option${insurance === "own" ? " is-chosen" : ""}`}
        >
          <input
            type="radio"
            name="insuranceChoice"
            value="own"
            checked={insurance === "own"}
            onChange={() => setInsurance("own")}
          />
          <span className="booking-insurance-body">
            <strong>I have my own insurance</strong>
            <span className="booking-insurance-price">No extra charge</span>
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
              name="insuranceChoice"
              value="company"
              checked={insurance === "company"}
              onChange={() => setInsurance("company")}
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
            name="insuranceChoice"
            value="declined"
            checked={insurance === "declined"}
            onChange={() => setInsurance("declined")}
          />
          <span className="booking-insurance-body">
            <strong>I don&rsquo;t have insurance, and I accept the risk</strong>
            <span className="booking-insurance-price">No extra charge</span>
            <small>
              I understand that if I am injured while driving this vehicle,
              <strong> the rental company&rsquo;s insurance does not cover me</strong>,
              and I am responsible for my own medical bills.
            </small>
          </span>
        </label>

        {err("insuranceChoice") && <Err>{err("insuranceChoice")}</Err>}
      </fieldset>

      <div className="booking-licence">
        <label className="booking-field">
          <span>
            Photo of your driver&rsquo;s license <em>required</em>
          </span>
          {/* No `capture`: forcing the camera meant a renter could not attach a
              photo they already had, and could never attach a screenshot or
              PDF of a digital insurance card. Staff still see the physical
              license at pickup. Plain image/* also lets an iPhone hand over
              a JPEG rather than its HEIC original. */}
          <input
            type="file"
            name="licenceFile"
            accept="image/*,application/pdf"
            onChange={(e) => void attach("licence", e.currentTarget)}
          />
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
          {docErrors.licence && <Err alert>{docErrors.licence}</Err>}
          {err("licenceFile") && <Err>{err("licenceFile")}</Err>}
        </label>

        {/* Asked for only from renters who say they have a policy. Demanding
            a certificate from somebody who has already said they have none
            would turn the notice above into a refusal, which is not the
            business's position. */}
        <label
          className="booking-field"
          hidden={insurance !== "own"}
          aria-hidden={insurance !== "own"}
        >
          <span>
            Proof of insurance <em>required</em>
          </span>
          <input
            type="file"
            name="insuranceFile"
            accept="image/*,application/pdf"
            onChange={(e) => void attach("insurance", e.currentTarget)}
          />
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
          {docErrors.insurance && <Err alert>{docErrors.insurance}</Err>}
          {err("insuranceFile") && <Err>{err("insuranceFile")}</Err>}
        </label>

        {/* Every sentence here describes something the code actually does.
            Reassurance a system does not deliver is worse than none. */}
        <p className="booking-licence-note">
          <i className="fas fa-lock" aria-hidden="true" />
          <span>
            Uploading now saves time at pickup. Your documents are stored
            privately, never shown on this website, and can only be opened by
            our staff through a link that expires within minutes. We will never
            ask for your bank details, card number, SSN or BVN — here or by
            email.
          </span>
        </p>

        <label className="booking-field">
          <span>
            Driver&rsquo;s license number <em>optional</em>
          </span>
          <input name="licenceNo" value={val("licenceNo")} onChange={set("licenceNo")} />
        </label>

        <div className="booking-field-row">
          <label className="booking-field">
            <span>
              Insurance company <em>optional</em>
            </span>
            <input name="insuranceProvider" autoComplete="organization" value={val("insuranceProvider")} onChange={set("insuranceProvider")} />
          </label>
          <label className="booking-field">
            <span>
              Policy number <em>optional</em>
            </span>
            <input name="insurancePolicyNo" value={val("insurancePolicyNo")} onChange={set("insurancePolicyNo")} />
          </label>
        </div>
      </div>

      {/* Declared, not collected.
          Age eligibility needs a date of birth, and the licence already
          carries one — so this is checked against the document rather than
          stored as a second copy of it. */}
      <label className="booking-consent">
        <input
          type="checkbox"
          name="confirmEligible"
          required
          checked={eligible}
          onChange={(e) => setEligible(e.target.checked)}
        />
        <span>
          I am 18 or older, I have a valid driver&rsquo;s license for the entire
          rental period, and the documents I attached are my own. I understand
          the vehicle will not be released until our team has reviewed them,
          and I have read the injury notice above.
        </span>
      </label>
      {err("confirmEligible") && <Err>{err("confirmEligible")}</Err>}

      <label className="booking-field">
        <span>
          Anything else we should know? <em>optional</em>
        </span>
        <textarea name="note" rows={3} value={val("note")} onChange={set("note")} />
      </label>

      {/* Read before the request, not handed over at the counter. Folded so
          the form still reads as a form, and open on demand — a checkbox
          pointing at terms nobody can see is not consent. */}
      <details className="booking-terms">
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
        </div>
      </details>

      <input type="hidden" name="termsVersion" value={RENTAL_TERMS_VERSION} />

      <label className="booking-accept">
        <input
          type="checkbox"
          name="acceptTerms"
          required
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
        />
        <span>
          I have read and agree to the rental terms above.
        </span>
      </label>
      {err("acceptTerms") && <Err>{err("acceptTerms")}</Err>}

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
              <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
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

      <button
        type="submit"
        // A page the server no longer recognizes can only fail again.
        disabled={!hydrated || pending || stillPreparing || state?.sendFailed === "reload"}
        className="btn btn-primary booking-submit"
      >
        {pending
          ? "Reserving…"
          : stillPreparing
            ? "Preparing photo…"
            : "Reserve this vehicle"}{" "}
        <i className="fas fa-calendar-check" />
      </button>

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
    </form>
  );
}

/**
 * A message under a field. `alert` for ones that appear without a submit —
 * a file refused the moment it was chosen — so a screen reader hears them.
 */
function Err({ children, alert = false }: { children: React.ReactNode; alert?: boolean }) {
  return (
    <span className="field-error" role={alert ? "alert" : undefined}>
      {children}
    </span>
  );
}
