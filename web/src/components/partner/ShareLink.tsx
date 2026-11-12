"use client";

import { useState, useSyncExternalStore } from "react";
import { btnPrimaryTight, btnSecondaryTight } from "./ui";

const subscribeNothing = () => () => {};

/**
 * Whether this browser has a share sheet (the Web Share API): phones, mostly.
 * False on the server and while the page wakes, so the button never flashes
 * up and then vanishes.
 */
export function useCanShare(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => typeof navigator.share === "function",
    () => false,
  );
}

/**
 * Opens the phone's share sheet with a message. Cancelling the sheet is not
 * an error worth showing; anything else falls back to copying.
 */
export async function shareText(text: string): Promise<"shared" | "cancelled" | "failed"> {
  try {
    // Text only, with the link inside it: some apps keep a separate `url`
    // and drop the text, which would drop the line saying the partner is
    // paid for the referral.
    await navigator.share({ text });
    return "shared";
  } catch (e) {
    return e instanceof DOMException && e.name === "AbortError" ? "cancelled" : "failed";
  }
}

/**
 * The link, with big Copy and Share buttons and the link itself still on
 * screen.
 *
 * Both, deliberately. Clipboard access is refused often enough — an insecure
 * context, a locked-down browser, a webview — that a copy button on its own
 * can leave somebody with no way to get at the one thing this page is for.
 * The link can always be pressed and held, or selected, by hand.
 *
 * Share sends `message`: the link with the line saying the partner is paid
 * for referrals (src/lib/referral.ts), the same line every car's message
 * carries. Copy copies the bare link, as it always has.
 */
export function ShareLink({
  link,
  code,
  message,
}: {
  link: string;
  code: string;
  message: string;
}) {
  const canShare = useCanShare();
  const [done, setDone] = useState<"link" | "code" | "refused" | "noshare" | null>(null);

  const copy = async (text: string, which: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(which);
      window.setTimeout(() => setDone(null), 2000);
    } catch {
      // Refused. Said, so the button doesn't look broken; the link is on
      // screen to select by hand.
      setDone("refused");
    }
  };

  const share = async () => {
    if ((await shareText(message)) === "failed") setDone("noshare");
  };

  return (
    <div>
      <p className="select-all break-all rounded-[14px] border border-border-default bg-surface-0 px-4 py-3.5 font-mono text-[15px] leading-snug text-brand-300">
        {link}
      </p>

      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(136px,1fr))] gap-2.5">
        <button type="button" onClick={() => copy(link, "link")} className={btnPrimaryTight}>
          <i className={`fas ${done === "link" ? "fa-check" : "fa-copy"}`} aria-hidden="true" />
          {done === "link" ? "Copied" : "Copy link"}
        </button>
        {canShare && (
          <button type="button" onClick={share} className={btnSecondaryTight}>
            <i className="fas fa-share-nodes" aria-hidden="true" />
            Share
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-[14px] border border-border-subtle bg-surface-0 py-2 pl-4 pr-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-text-muted">
            Your code
          </p>
          <p className="truncate font-mono text-lg font-bold tracking-wide text-text-primary">
            {code}
          </p>
        </div>
        <button
          type="button"
          onClick={() => copy(code, "code")}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full px-4 text-[15px] font-bold text-brand-300 transition-colors duration-200 ease-out hover:bg-surface-2 motion-reduce:transition-none"
        >
          <i className={`fas ${done === "code" ? "fa-check" : "fa-copy"}`} aria-hidden="true" />
          {done === "code" ? "Copied" : "Copy code"}
        </button>
      </div>

      {/* Read out when it changes; a button's own label change is not
          announced. */}
      <p
        aria-live="polite"
        className={
          done === "refused" || done === "noshare"
            ? "mt-3 text-sm leading-relaxed text-warning"
            : "sr-only"
        }
      >
        {done === "link"
          ? "Link copied."
          : done === "code"
            ? "Code copied."
            : done === "refused"
              ? "This browser won't let us copy. Press and hold the link to copy it."
              : done === "noshare"
                ? "This browser won't open its share menu. Use Copy link instead."
                : ""}
      </p>
    </div>
  );
}
