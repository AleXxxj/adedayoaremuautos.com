import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { assistantConversations, assistantMessages } from "@/db/schema";
import { isMarketCode, type MarketCode } from "@/lib/market";
import { buildBusinessContext } from "@/lib/ai/context";
import { systemPrompt } from "@/lib/ai/prompt";
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
const MODEL = process.env.ASSISTANT_MODEL ?? "claude-sonnet-5";

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
  const anthropic = new Anthropic({ apiKey: key });

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 700,
    system: systemPrompt(
      market as MarketCode,
      context,
      typeof body.path === "string" ? body.path : null,
    ),
    messages: [...history, { role: "user", content: message }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      // The id goes first so the widget can keep the thread even if the
      // connection drops halfway through the answer.
      controller.enqueue(
        encoder.encode(`${JSON.stringify({ type: "id", conversationId: convId })}\n`),
      );

      let full = "";
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            full += event.delta.text;
            controller.enqueue(
              encoder.encode(`${JSON.stringify({ type: "text", text: event.delta.text })}\n`),
            );
          }
        }
      } catch (e) {
        console.error("[assistant] stream failed", e);
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              type: "error",
              error: "Something went wrong on our side. Please call us and we will help right away.",
            })}\n`,
          ),
        );
      }

      controller.close();

      // Persist after the visitor has their answer. Writing first would make
      // them wait on a database round trip for no benefit, and a lost log line
      // is a far smaller problem than a slow reply.
      try {
        await db.insert(assistantMessages).values([
          { conversationId: convId, role: "user", content: message },
          { conversationId: convId, role: "assistant", content: full },
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
