"use client";

import { useActionState } from "react";
import { checkAssistant, type AssistantCheckResult } from "@/lib/actions/assistantCheck";

/**
 * "Is the assistant actually working?"
 *
 * Sits on the Chats screen because that is where somebody goes when the chat
 * bubble seems dead. The visitor-facing failure is deliberately vague; this is
 * where the real reason lives.
 */
export function AssistantCheck() {
  const [state, action, pending] = useActionState<AssistantCheckResult | null, FormData>(
    async () => checkAssistant(),
    null,
  );

  return (
    <details className="mb-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-5 py-4">
      <summary className="cursor-pointer text-sm font-medium">
        <i className="fas fa-stethoscope mr-2 text-[var(--text-muted)]" aria-hidden="true" />
        Assistant — check it is working
      </summary>

      <p className="mt-3 text-sm text-[var(--text-muted)]">
        Customers see only &ldquo;something went wrong, please call us&rdquo; if
        the assistant fails — which is right for them and tells you nothing.
        This asks the model one trivial question and reports exactly what came
        back.
      </p>

      <form action={action} className="mt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-60"
        >
          {pending ? "Asking…" : "Run the check"}
        </button>
      </form>

      {state && (
        <div className="mt-4 space-y-3 text-sm">
          <dl className="space-y-1.5">
            <div className="flex gap-2">
              <dt className="text-[var(--text-muted)]">API key:</dt>
              <dd className={state.keyConfigured ? "text-[var(--success)]" : "text-[var(--warning)]"}>
                {state.keyConfigured ? `set (${state.keyHint})` : "not set"}
              </dd>
            </div>
            {state.model && (
              <div className="flex gap-2">
                <dt className="text-[var(--text-muted)]">Model:</dt>
                <dd className="font-mono text-xs">{state.model}</dd>
              </div>
            )}
          </dl>

          {state.ok ? (
            <p className="rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 px-3 py-2 text-[var(--success)]">
              Working. The model replied: &ldquo;{state.reply}&rdquo;
            </p>
          ) : (
            <>
              {state.error && (
                <div className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2">
                  <p className="text-[var(--danger)]">The model call failed.</p>
                  <p className="mt-1 font-mono text-xs break-words text-[var(--text-secondary)]">
                    {state.error}
                  </p>
                </div>
              )}
              {state.remedy && (
                <p className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-[var(--text-secondary)]">
                  <strong>What to do:</strong> {state.remedy}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </details>
  );
}
