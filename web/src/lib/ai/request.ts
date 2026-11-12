import type { BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages";
import type { MessageStreamParams } from "@anthropic-ai/sdk/resources/messages/messages";

/**
 * The assistant's request to the model, built in one place.
 *
 * The model is configurable (ASSISTANT_MODEL), and the newer request fields
 * are not accepted by every model: an `effort` sent to an older model, or a
 * fallback chain to one that has none, is a 400 and a silent chat window. So
 * each field is added only for the model families known to take it, and the
 * route keeps the old plain request as a one-time retry (legacyRequest).
 *
 * Pure: no client, no database, so scripts/verify-home.ts can check it.
 */

/** The current Claude model. ASSISTANT_MODEL overrides it without a deploy. */
export const DEFAULT_ASSISTANT_MODEL = "claude-opus-5-5";

/** What the route used before; the retry when a newer request is refused. */
export const LEGACY_ASSISTANT_MODEL = "claude-sonnet-5";

/**
 * Thinking is always on for this model and counts toward max_tokens, so the
 * limit is set well above the length of a chat reply (the old limit was 700).
 */
const MAX_TOKENS = 1500;
const LEGACY_MAX_TOKENS = 700;

/** Models that take `output_config.effort`. */
const TAKES_EFFORT = /^claude-(opus-5|sonnet-5|haiku-5|fable-5|mythos-5)/;

/**
 * Models that take the server-side fallback chain. On a policy decline the
 * API re-runs the request on Anthropic's recommended model for that kind of
 * decline, inside the same call, instead of returning a refusal.
 */
const TAKES_FALLBACKS = /^(claude-opus-5-5|claude-opus-5|claude-sonnet-5-5|claude-fable-5.*)$/;
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

interface RequestInput {
  model: string;
  /** Persona, rules and business context: identical across a conversation. */
  instructions: string;
  /** "The visitor is on the page /us/rentals." Changes with every page. */
  page: string;
  messages: AssistantTurn[];
}

/**
 * The request: two system blocks, the first cached.
 *
 * The page path used to sit inside the one system string, so moving to
 * another page changed the prompt's first lines and every message paid for
 * the whole prompt again. It is now a second, uncached block after the
 * cache point, and the long part is read from the cache.
 */
export function assistantRequest({
  model,
  instructions,
  page,
  messages,
}: RequestInput): BetaMessageStreamParams {
  const params: BetaMessageStreamParams = {
    model,
    max_tokens: MAX_TOKENS,
    system: [
      { type: "text", text: instructions, cache_control: { type: "ephemeral" } },
      { type: "text", text: page },
    ],
    messages,
  };
  // A chat reply needs little thought: low effort keeps it quick and cheap.
  if (TAKES_EFFORT.test(model)) params.output_config = { effort: "low" };
  if (TAKES_FALLBACKS.test(model)) {
    params.betas = [FALLBACK_BETA];
    params.fallbacks = "default";
  }
  return params;
}

/**
 * The request as it was before this model: the model the route used, the
 * plain (non-beta) endpoint, one system string. Sent once, only when the API
 * rejects the new request before any of the reply has gone out.
 */
export function legacyRequest({
  instructions,
  page,
  messages,
}: Omit<RequestInput, "model">): MessageStreamParams {
  return {
    model: LEGACY_ASSISTANT_MODEL,
    max_tokens: LEGACY_MAX_TOKENS,
    system: `${instructions}\n\n${page}`,
    messages,
  };
}

/**
 * Sent and saved in place of a reply when the model (and its fallback)
 * declines. A person can take it from there.
 */
export const REFUSAL_REPLY =
  "I can't help with that one here. Want someone from our team to call you?";
