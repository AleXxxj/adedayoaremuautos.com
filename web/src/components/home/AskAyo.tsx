"use client";

import { PERSONA } from "@/lib/ai/persona";
import { openAssistant } from "@/lib/openAssistant";

/**
 * "Not sure where to start? Ask Miles" under the hero's buttons, with the
 * assistant's name taken from PERSONA. The page shows it only when the
 * assistant is switched on, and the call link otherwise. Silver words with
 * the part to press in white and underlined (home.css, .hh-link).
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
