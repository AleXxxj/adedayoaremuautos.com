"use client";

import { useRef, useState } from "react";
import { resultsShown, useResultSignal } from "./tools/gameKit";

/**
 * "Send this to a friend": the phone's own share sheet where there is one,
 * and a copied link everywhere else.
 *
 * This is how a guide travels, so it is one tap and says what happened: the
 * result is announced politely ("Link copied") and stays on screen. Where
 * the browser can do neither (an old browser, a page not served over
 * HTTPS), the link is shown in a box, already selected, to copy by hand.
 *
 * Nothing is sent anywhere by this button: sharing hands the page's own
 * address to the visitor's phone, and the address holds no personal data
 * (a guide's slug, the slugs of the cars being compared, or a game's score
 * or result name after the #).
 */
export function ShareButton({
  title,
  text,
  path,
  label = "Send this to a friend",
  className = "",
  primary = false,
  withText = false,
  beat = false,
}: {
  /** The share sheet's title. */
  title: string;
  /** One line to go with the link. */
  text?: string;
  /** A path on this site; left out, the page's own address as it is now. */
  path?: string;
  label?: string;
  className?: string;
  /** The one green button on its screen: a game's result. */
  primary?: boolean;
  /**
   * Copy the line with the link ("I scored 4 of 5. Can you beat it? https://…"),
   * for a result that means nothing without its words.
   */
  withText?: boolean;
  /** Beat once when the page's tool first shows an answer: now there is something to send. */
  beat?: boolean;
}) {
  // Answers shown before this button arrived (on an earlier guide) don't count.
  const [before] = useState(() => (typeof window === "undefined" ? 0 : resultsShown()));
  const answers = useResultSignal();
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  const [manualUrl, setManualUrl] = useState("");
  const box = useRef<HTMLInputElement>(null);

  async function share() {
    const url = path ? new URL(path, window.location.origin).toString() : window.location.href;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        // Closing the share sheet is a choice, not a failure.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(withText && text ? `${text} ${url}` : url);
      setStatus("copied");
    } catch {
      setManualUrl(url);
      setStatus("manual");
      // After the box is drawn.
      requestAnimationFrame(() => box.current?.select());
    }
  }

  return (
    <div className={`gd-share ${className}`.trim()} data-beat={beat && answers > before ? "" : undefined}>
      <button type="button" className={`gd-share-btn${primary ? " gd-share-btn--primary" : ""}`} onClick={share}>
        <i className="fas fa-arrow-up-from-bracket" aria-hidden="true" />
        {label}
      </button>
      <p className="gd-share-status" role="status" aria-live="polite">
        {status === "copied" && (
          <>
            <i className="fas fa-check" aria-hidden="true" /> {withText && text ? "Copied" : "Link copied"}. Paste it in a text or a chat.
          </>
        )}
        {status === "manual" && "Copy this link:"}
      </p>
      {status === "manual" && (
        <input
          ref={box}
          className="gd-share-box"
          type="text"
          readOnly
          value={manualUrl}
          aria-label="Link to this page"
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </div>
  );
}
