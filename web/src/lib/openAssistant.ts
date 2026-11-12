/**
 * Opens the chat with Ayo from anywhere on the page.
 *
 * A window event rather than shared state: the widget lives in the market
 * layout and the buttons that open it live in pages, so neither has to know
 * where the other is. With no widget on the page (no API key), nothing
 * listens and nothing happens, so a caller shows its own fallback instead.
 *
 * `text` is put in the message box, ready to send, never sent for them: what
 * goes to the assistant is always something the visitor chose to send.
 */
export const OPEN_ASSISTANT_EVENT = "aaa:open-assistant";

export interface OpenAssistantDetail {
  text?: string;
}

export function openAssistant(text?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OpenAssistantDetail>(OPEN_ASSISTANT_EVENT, { detail: { text } }),
  );
}
