import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageStream } from "@anthropic-ai/sdk/lib/BetaMessageStream";
import type { MessageStream } from "@anthropic-ai/sdk/lib/MessageStream";
import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { assistantConversations, assistantMessages } from "@/db/schema";
import { isMarketCode, type MarketCode } from "@/lib/market";
import { buildBusinessContext } from "@/lib/ai/context";
import { pageNote, systemPrompt } from "@/lib/ai/prompt";
import {
  DEFAULT_ASSISTANT_MODEL,
  REFUSAL_REPLY,
  assistantRequest,
  legacyRequest,
  type AssistantTurn,
} from "@/lib/ai/request";
import { summariseConversation } from "@/lib/ai/summarise";

/**
 * The assistant endpoint.
 *
 * Streams the reply so the widget shows words as they arrive — a chat that
 * sits blank for four seconds reads as broken, and this one is answering from
 * a database read plus a model call.
 */

/** A conversation cannot run forever; each message costs money. */
const MAX_MESSAGES = 40;
/** Per IP per hour, so one visitor cannot run up the API bill. */
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_INPUT = 2000;

/** The model is configurable so cost and quality can be traded without a deploy. */
const MODEL = process.env.ASSISTANT_MODEL || DEFAULT_ASSISTANT_MODEL;

const STREAM_ERROR =
  "Something went wrong on our side. Please call us and we will help right away.";

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  // Hashed, not stored: rate limiting needs to recognise a repeat visitor, it
  // does not need to know where they live.
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export async function POST(request: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "The assistant is not configured yet." },
      { status: 503 },
    );
  }

  let body: {
    message?: string;
    conversationId?: string;
    market?: string;
    path?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const message = String(body.message ?? "").trim();
  const market = String(body.market ?? "");
  if (!message || !isMarketCode(market)) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (message.length > MAX_INPUT) {
    return NextResponse.json(
      { error: "That message is too long — could you shorten it?" },
      { status: 400 },
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip");
  const ipHash = hashIp(ip);

  // ── Rate limit ──────────────────────────────────────────────────────────
  if (ipHash) {
    const since = new Date(Date.now() - RATE_WINDOW_MS);
    const [{ recent }] = await db
      .select({ recent: sql<number>`coalesce(sum(${assistantConversations.messageCount}), 0)::int` })
      .from(assistantConversations)
      .where(
        and(
          eq(assistantConversations.ipHash, ipHash),
          gte(assistantConversations.lastMessageAt, since),
        ),
      );
    if (recent >= RATE_LIMIT) {
      return NextResponse.json(
        {
          error:
            "You have reached the limit for now. Please call us — we would rather talk to you anyway.",
        },
        { status: 429 },
      );
    }
  }

  // ── Find or start the conversation ──────────────────────────────────────
  let conversationId = body.conversationId;
  let history: { role: "user" | "assistant"; content: string }[] = [];

  if (conversationId) {
    const [existing] = await db
      .select()
      .from(assistantConversations)
      .where(eq(assistantConversations.id, conversationId))
      .limit(1);

    // An unknown id is treated as a fresh conversation rather than an error:
    // the widget keeps the id in the browser, and a wiped database or an
    // expired row must not leave someone unable to type.
    if (!existing) {
      conversationId = undefined;
    } else if (existing.messageCount >= MAX_MESSAGES) {
      return NextResponse.json(
        {
          error:
            "This conversation has gone on a while — let us pick it up by phone. Someone will call if you left your number.",
          needsHuman: true,
        },
        { status: 409 },
      );
    } else {
      const rows = await db
        .select({ role: assistantMessages.role, content: assistantMessages.content })
        .from(assistantMessages)
        .where(eq(assistantMessages.conversationId, conversationId))
        .orderBy(asc(assistantMessages.createdAt));
      history = rows.map((r) => ({
        role: r.role === "assistant" ? "assistant" : "user",
        content: r.content,
      }));
    }
  }

  if (!conversationId) {
    const [created] = await db
      .insert(assistantConversations)
      .values({
        marketCode: market as MarketCode,
        landingPath: typeof body.path === "string" ? body.path.slice(0, 300) : null,
        ipHash,
      })
      .returning({ id: assistantConversations.id });
    conversationId = created.id;
  }

  const convId = conversationId;

  // ── Ask the model ───────────────────────────────────────────────────────
  const context = await buildBusinessContext(market as MarketCode);
  const instructions = systemPrompt(market as MarketCode, context);
  const page = pageNote(body.path);
  const thread: AssistantTurn[] = [...history, { role: "user", content: message }];
  const anthropic = new Anthropic({ apiKey: key });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      // The id goes first so the widget can keep the thread even if the
      // connection drops halfway through the answer.
      emit({ type: "id", conversationId: convId });

      // What the visitor has been shown, which is also what is saved.
      const reply = { text: "", sent: false };

      // Passes on the words of a reply as they arrive. Thinking and fallback
      // blocks are not words for the visitor and are skipped. Resolves with
      // the reason the reply stopped.
      const relay = async (stream: BetaMessageStream<unknown> | MessageStream<unknown>) => {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            reply.text += event.delta.text;
            reply.sent = true;
            emit({ type: "text", text: event.delta.text });
          }
        }
        return (await stream.finalMessage()).stop_reason;
      };

      try {
        let stopReason: string | null;
        try {
          stopReason = await relay(
            anthropic.beta.messages.stream(
              assistantRequest({ model: MODEL, instructions, page, messages: thread }),
            ),
          );
        } catch (e) {
          // A request the API turns down as malformed (a field this model
          // does not take, say) is sent once more in the old plain shape, but
          // only if nothing has gone out yet: a second answer after half of a
          // first would be worse than an error.
          if (!(e instanceof Anthropic.BadRequestError) || reply.sent) throw e;
          console.error("[assistant] request rejected; retrying the plain request", e);
          stopReason = await relay(
            anthropic.messages.stream(legacyRequest({ instructions, page, messages: thread })),
          );
        }

        if (stopReason === "refusal") {
          // Declined by the model and by its fallback. A part-reply streamed
          // before the decline is replaced rather than left as half an answer.
          emit({ type: reply.sent ? "replace" : "text", text: REFUSAL_REPLY });
          reply.text = REFUSAL_REPLY;
        } else if (!reply.text) {
          emit({ type: "error", error: STREAM_ERROR });
        }
      } catch (e) {
        console.error("[assistant] stream failed", e);
        emit({ type: "error", error: STREAM_ERROR });
      }

      controller.close();

      // Persist after the visitor has their answer. Writing first would make
      // them wait on a database round trip for no benefit, and a lost log line
      // is a far smaller problem than a slow reply.
      try {
        await db.insert(assistantMessages).values([
          { conversationId: convId, role: "user", content: message },
          { conversationId: convId, role: "assistant", content: reply.text },
        ]);
        await db
          .update(assistantConversations)
          .set({
            messageCount: sql`${assistantConversations.messageCount} + 2`,
            lastMessageAt: new Date(),
          })
          .where(eq(assistantConversations.id, convId));

        // Summarise as the conversation develops, so a visitor who closes the
        // tab without saying goodbye still leaves the staff something to act
        // on. Re-run periodically because the useful summary is the last one.
        const turns = history.length / 2 + 1;
        if (turns >= 2 && turns % 2 === 0) {
          await summariseConversation(convId);
        }
      } catch (e) {
        console.error("[assistant] persist failed", e);
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
