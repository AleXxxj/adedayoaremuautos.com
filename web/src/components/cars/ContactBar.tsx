"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitLead, type LeadResult } from "@/lib/actions/leads";
import { PERSONA } from "@/lib/ai/persona";
import type { MarketCode } from "@/lib/market";
import { openAssistant } from "@/lib/openAssistant";
import { useFormTimer } from "@/lib/useFormTimer";
import { INTEREST_CHOICES, type InterestId } from "./carData";

/**
 * A sale car's three actions: Call, Ask the assistant, and "I'm interested".
 *
 * On a phone they are a bar pinned to the bottom of the screen; on a wide
 * screen they sit under the price. The bar carries the class `booking-bar`
 * beside its own, which is what makes refine.css pin it, pad the page by its
 * height, lift the floating buttons clear of it and hide the tab bar, so the
 * two bars never stack. Its height is published as --booking-bar-h, as the
 * rental booking form does for its own bar.
 *
 * "I'm interested" is taps, not typing: a sheet with three things a buyer
 * might say, then a name and a phone number, then Send (InterestSheet).
 */
export function ContactBar({
  market,
  slug,
  carName,
  phone,
  phoneLabel,
  assistant,
  whatsapp,
}: {
  market: MarketCode;
  slug: string;
  /** "2016 Nissan Altima": how the car is named to the assistant and in the sheet. */
  carName: string;
  /** The showroom's number as dialed, or null when there is none on file. */
  phone: string | null;
  /** The same number as people read it: "(336) 207-6521". */
  phoneLabel: string | null;
  /** Whether the assistant is switched on (the layout only renders it then). */
  assistant: boolean;
  /** A WhatsApp link, where that is how the market talks (Nigeria). */
  whatsapp: string | null;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  // A new number starts the sheet again from its first step.
  const [round, setRound] = useState(0);
  const sent = useRef(false);

  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const root = document.documentElement;
    const measure = () =>
      root.style.setProperty("--booking-bar-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    measure();
    return () => {
      watch.disconnect();
      root.style.removeProperty("--booking-bar-h");
    };
  }, []);

  const open = () => {
    const dialog = sheet.current;
    if (dialog && !dialog.open) dialog.showModal();
  };

  return (
    <>
      <div
        className="booking-bar cd-bar"
        ref={bar}
        role="group"
        aria-label="Contact us about this car"
        // Three buttons need more room than two: the stylesheet shortens
        // Call to its icon sooner when all three are here.
        data-buttons={1 + (phone ? 1 : 0) + (whatsapp || assistant ? 1 : 0)}
      >
        {phone && (
          <a className="cd-btn cd-btn--call" href={`tel:${phone}`} aria-label={`Call ${phoneLabel ?? phone}`}>
            <i className="fas fa-phone" aria-hidden="true" />
            <span>Call</span>
          </a>
        )}
        {whatsapp ? (
          <a className="cd-btn" href={whatsapp} target="_blank" rel="noopener noreferrer">
            <i className="fab fa-whatsapp" aria-hidden="true" />
            <span>WhatsApp</span>
          </a>
        ) : (
          assistant && (
            <button
              type="button"
              className="cd-btn"
              aria-haspopup="dialog"
              onClick={() => openAssistant(`I'm looking at the ${carName}. `)}
            >
              <i className="fas fa-comments" aria-hidden="true" />
              <span>Ask {PERSONA.name}</span>
            </button>
          )
        )}
        <button type="button" className="cd-btn cd-btn--primary" aria-haspopup="dialog" onClick={open}>
          I&rsquo;m interested
        </button>
      </div>

      <dialog
        ref={sheet}
        className="cd-sheet"
        aria-labelledby="cd-sheet-title"
        // A tap on the dimmed page behind the sheet closes it. Judged by
        // where the tap landed: the sheet's own padding is the sheet too.
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          const box = e.currentTarget.getBoundingClientRect();
          const inside =
            e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
          if (!inside) e.currentTarget.close();
        }}
        // Closed part way, it keeps what was typed. Closed after sending, it
        // starts again from the first step next time.
        onClose={() => {
          if (!sent.current) return;
          sent.current = false;
          setRound((n) => n + 1);
        }}
      >
        <InterestSheet
          key={round}
          market={market}
          slug={slug}
          carName={carName}
          phone={phone}
          phoneLabel={phoneLabel}
          close={() => sheet.current?.close()}
          onSent={() => {
            sent.current = true;
          }}
        />
      </dialog>
    </>
  );
}

/**
 * The inside of the sheet. Step 1 is one tap on what you want to say; step 2
 * is your name and number. It sends through the same `submitLead` action as
 * every other inquiry on the site, with the car's slug and the chosen
 * sentence as the message, the same hidden field for bots and the same
 * on-screen timer (useFormTimer).
 *
 * The fields are held in state, not left to the form: React clears a form's
 * own fields after its action runs, which would wipe a name and number the
 * moment the server asked for one of them to be corrected.
 */
function InterestSheet({
  market,
  slug,
  carName,
  phone,
  phoneLabel,
  close,
  onSent,
}: {
  market: MarketCode;
  slug: string;
  carName: string;
  phone: string | null;
  phoneLabel: string | null;
  close: () => void;
  onSent: () => void;
}) {
  const [state, action, pending] = useActionState<LeadResult | null, FormData>(submitLead, null);
  // How long the form has been on screen goes with it, as the bot check.
  const { hydrated, elapsedMs } = useFormTimer();
  const [chosen, setChosen] = useState<InterestId | null>(null);
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [email, setEmail] = useState("");
  const [withEmail, setWithEmail] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const nameBox = useRef<HTMLInputElement>(null);
  const emailBox = useRef<HTMLInputElement>(null);

  const choice = INTEREST_CHOICES.find((c) => c.id === chosen) ?? null;
  const done = Boolean(state?.ok);
  const err = (field: string) => state?.fieldErrors?.[field]?.[0];

  // Each step starts where its first thing is: the name box, or the title.
  // (While the sheet is closed nothing in it can take focus, so this does
  // nothing until it is open.)
  useEffect(() => {
    (chosen && !done ? nameBox : title).current?.focus();
  }, [chosen, done]);

  useEffect(() => {
    if (done) onSent();
  }, [done, onSent]);

  useEffect(() => {
    if (withEmail) emailBox.current?.focus();
  }, [withEmail]);

  const submit = (formData: FormData) => {
    formData.set("elapsedMs", String(elapsedMs()));
    formData.set("landingPath", window.location.pathname + window.location.search);
    return action(formData);
  };

  return (
    <>
      <div className="cd-sheet-head">
        <div>
          <p className="cd-sheet-car">{carName}</p>
          <h2 className="cd-sheet-title" id="cd-sheet-title" ref={title} tabIndex={-1}>
            {done ? "Sent. We’ll call you." : choice ? "Where do we reach you?" : "What would you like?"}
          </h2>
        </div>
        <button type="button" className="cd-sheet-close" aria-label="Close" onClick={close}>
          <i className="fas fa-xmark" aria-hidden="true" />
        </button>
      </div>

      {done ? (
        <div className="cd-sheet-done" role="status">
          <p>
            {phoneLabel
              ? `In a hurry? Calling is fastest: ${phoneLabel}.`
              : "We will be in touch shortly."}
          </p>
          {phone && (
            <a className="cd-btn" href={`tel:${phone}`}>
              <i className="fas fa-phone" aria-hidden="true" />
              Call now
            </a>
          )}
          <button type="button" className="cd-btn cd-btn--primary" onClick={close}>
            Done
          </button>
        </div>
      ) : !choice ? (
        <ul className="cd-choices">
          {INTEREST_CHOICES.map((c) => (
            <li key={c.id}>
              <button type="button" className="cd-choice" onClick={() => setChosen(c.id)}>
                <i className={`fas ${c.icon}`} aria-hidden="true" />
                <span>{c.sentence}</span>
                <i className="fas fa-chevron-right" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <form className="cd-sheet-form" action={submit}>
          <input type="hidden" name="marketCode" value={market} />
          <input type="hidden" name="type" value={choice.type} />
          <input type="hidden" name="vehicleSlug" value={slug} />
          <input type="hidden" name="message" value={choice.sentence} />
          {/* Hidden from people, filled in by bots. Off-screen, not
              display:none, which some bots skip. */}
          <div aria-hidden style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}>
            <input type="text" name="leave_empty" tabIndex={-1} autoComplete="off" />
          </div>

          <p className="cd-sheet-said">
            <span>&ldquo;{choice.sentence}&rdquo;</span>
            <button type="button" className="cd-sheet-change" onClick={() => setChosen(null)}>
              Change
            </button>
          </p>

          {state?.error && (
            <p className="cd-error" role="alert">
              {state.error}
            </p>
          )}

          <div className="cd-field">
            <label htmlFor="cd-lead-name">Your name</label>
            <input
              ref={nameBox}
              id="cd-lead-name"
              name="name"
              required
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={err("name") ? true : undefined}
              aria-describedby={err("name") ? "cd-lead-name-err" : undefined}
            />
            {err("name") && (
              <p className="cd-error" id="cd-lead-name-err" role="alert">
                {err("name")}
              </p>
            )}
          </div>

          <div className="cd-field">
            <label htmlFor="cd-lead-phone">Phone</label>
            <input
              id="cd-lead-phone"
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              inputMode="tel"
              enterKeyHint="send"
              placeholder={market === "us" ? "(336) 555-0100" : "0801 234 5678"}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              aria-invalid={err("phone") ? true : undefined}
              aria-describedby={err("phone") ? "cd-lead-phone-err" : undefined}
            />
            {err("phone") && (
              <p className="cd-error" id="cd-lead-phone-err" role="alert">
                {err("phone")}
              </p>
            )}
          </div>

          {withEmail ? (
            <div className="cd-field">
              <label htmlFor="cd-lead-email">
                Email <span>(optional)</span>
              </label>
              <input
                ref={emailBox}
                id="cd-lead-email"
                name="email"
                type="email"
                autoComplete="email"
                enterKeyHint="send"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={err("email") ? true : undefined}
                aria-describedby={err("email") ? "cd-lead-email-err" : undefined}
              />
              {err("email") && (
                <p className="cd-error" id="cd-lead-email-err" role="alert">
                  {err("email")}
                </p>
              )}
            </div>
          ) : (
            <button type="button" className="cd-sheet-more" onClick={() => setWithEmail(true)}>
              Add an email (optional)
            </button>
          )}

          <button type="submit" className="cd-btn cd-btn--primary" disabled={pending || !hydrated}>
            {pending ? "Sending…" : "Send"}
          </button>
          <p className="cd-fine">We use your details only to respond to this inquiry.</p>
        </form>
      )}
    </>
  );
}
