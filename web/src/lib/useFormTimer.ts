import { useCallback, useEffect, useRef } from "react";
import { useHydrated } from "./useHydrated";

/**
 * How long a public form has been on screen, for the bot check, with whether
 * the page has woken up yet (its send button stays disabled until then).
 *
 * Timed from when a person could first see the form. A form that came with
 * the page was on screen from the moment the page began to load, and people
 * fill it in while the page's scripts are still arriving. Timed from when the
 * scripts woke it instead, a tap soon after the button came alive looked like
 * a script posting instantly, and the message was dropped while the person
 * was shown "Thank you". So a form that was already on the page when React
 * started is timed from the page's start (performance.now() counts from
 * there), and one that appeared later, after moving between pages on the
 * site, from when it appeared.
 *
 * Measured on this phone's own monotonic clock. Comparing the phone's clock
 * with the server's dropped real messages from phones whose clocks ran fast,
 * and the wall clock can jump while a form is open.
 */
export function useFormTimer(): { hydrated: boolean; elapsedMs: () => number } {
  const hydrated = useHydrated();
  // Read on the first render only: false there means React is waking up a
  // page the server sent, so the form has been visible since the page began.
  const cameWithPage = useRef(!hydrated);
  const shownAt = useRef<number | null>(null);
  useEffect(() => {
    shownAt.current = cameWithPage.current ? 0 : performance.now();
  }, []);
  const elapsedMs = useCallback(() => {
    const now = performance.now();
    return Math.max(0, Math.round(now - (shownAt.current ?? now)));
  }, []);
  return { hydrated, elapsedMs };
}
