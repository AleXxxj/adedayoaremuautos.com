"use server";

import Anthropic from "@anthropic-ai/sdk";
import { assistantRequest, DEFAULT_ASSISTANT_MODEL, LEGACY_ASSISTANT_MODEL } from "@/lib/ai/request";
import { requireStaff } from "@/lib/auth";

export interface AssistantCheckResult {
  ok: boolean;
  /** Present, without ever revealing the value. */
  keyConfigured: boolean;
  keyHint?: string;
  model?: string;
  reply?: string;
  error?: string;
  /** What to actually do about it. */
  remedy?: string;
}

/**
 * Asks the model one trivial question and reports exactly what came back.
 *
 * The assistant fails silently by design: a visitor sees "something went wrong,
 * please call us" rather than a stack trace, which is right for them and
 * useless for the business. The failure could be an expired key, an exhausted
 * balance, or a model name that no longer exists, and those need completely
 * different fixes while looking identical from the chat window.
 *
 * The provider's own message is carried back. The key never is — only its last
 * four characters, which is enough to tell two keys apart and not enough to use
 * one.
 */
export async function checkAssistant(): Promise<AssistantCheckResult> {
  const user = await requireStaff();
  if (user.role === "sales") {
    return { ok: false, keyConfigured: false, error: "Owners and managers only." };
  }

  const key = process.env.ANTHROPIC_API_KEY;
  // The model the chat route uses, so this checks what visitors actually get.
  const model = process.env.ASSISTANT_MODEL ?? DEFAULT_ASSISTANT_MODEL;

  if (!key) {
    return {
      ok: false,
      keyConfigured: false,
      error: "ANTHROPIC_API_KEY is not set.",
      remedy:
        "Add it in Vercel under Settings → Environment Variables, then redeploy. Environment variables only take effect on a new build.",
    };
  }

  const keyHint = `…${key.slice(-4)}`;

  try {
    const anthropic = new Anthropic({ apiKey: key });
    // The chat's own request shape (effort, fallbacks, cached instructions),
    // so a field the model refuses shows up here rather than in a visitor's
    // chat window. Thinking counts toward max_tokens on current models, which
    // is why the old 32-token limit would have cut the answer off.
    const response = await anthropic.beta.messages
      .stream(
        assistantRequest({
          model,
          instructions: "This is a connection test from the website's admin page.",
          page: "Reply with the single word: ready",
          messages: [{ role: "user", content: "Reply with the single word: ready" }],
        }),
      )
      .finalMessage();
    const reply = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    return { ok: true, keyConfigured: true, keyHint, model, reply };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = (e as { status?: number })?.status;

    // The three failures that look identical from the chat window and need
    // entirely different fixes.
    let remedy: string;
    if (status === 401 || /authentication|invalid x-api-key|api key/i.test(message)) {
      remedy =
        "The key is being rejected. It has most likely expired or been revoked — create a new one at console.anthropic.com, update ANTHROPIC_API_KEY in Vercel, and redeploy.";
    } else if ((status === 400 || status === 404) && /model/i.test(message)) {
      remedy = `The model name "${model}" was not accepted. Clear ASSISTANT_MODEL in Vercel to fall back to the default, then redeploy. Until then the chat retries each message on ${LEGACY_ASSISTANT_MODEL}.`;
    } else if (status === 400) {
      remedy = `The request was refused. The chat retries each message in its old form on ${LEGACY_ASSISTANT_MODEL}, so visitors still get answers; the provider's message above says which field to fix.`;
    } else if (
      status === 402 ||
      /credit|balance|quota|billing|insufficient/i.test(message)
    ) {
      remedy =
        "The account is out of credit. Top up at console.anthropic.com under Billing — the assistant starts working again immediately, with no redeploy needed.";
    } else if (status === 429) {
      remedy = "Rate limited. This usually clears on its own within a minute.";
    } else {
      remedy = "Unexpected failure. The provider's message is shown above.";
    }

    return {
      ok: false,
      keyConfigured: true,
      keyHint,
      model,
      error: status ? `${status} — ${message}` : message,
      remedy,
    };
  }
}
