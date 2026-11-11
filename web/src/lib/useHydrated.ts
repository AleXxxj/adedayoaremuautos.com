import { useSyncExternalStore } from "react";

const subscribeNothing = () => () => {};

/**
 * False on the server and during hydration; true once React runs the page.
 *
 * A form's send button stays disabled until then. A press before hydration
 * is queued and replayed by React once the page wakes, by which time the
 * form's bot timer has only just started, so the message was quietly
 * dropped as a bot's.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNothing, () => true, () => false);
}
