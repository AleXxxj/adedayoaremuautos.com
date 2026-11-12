"use client";

import { PERSONA } from "@/lib/ai/persona";
import { openAssistant } from "@/lib/openAssistant";

/**
 * "Not sure where to start? Ask Ayo" under the hero's buttons. The page shows
 * it only when the assistant is switched on, and the call link otherwise.
 */
export function AskAyo({ className }: { className: string }) {
  return (
    <button
      type="button"
      className={className}
      aria-haspopup="dialog"
      onClick={() => openAssistant()}
    >
      <i className="fas fa-comments" aria-hidden="true" />
      <span>
        Not sure where to start? <strong>Ask {PERSONA.name}</strong>
      </span>
    </button>
  );
}
