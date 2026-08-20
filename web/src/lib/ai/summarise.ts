import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assistantConversations, assistantMessages, leads } from "@/db/schema";
import { SUMMARY_PROMPT } from "./prompt";
import { notifyStaffOfLead } from "@/lib/notify";
import { siteUrl } from "@/lib/feeds/inventory";

/** Cheap model: this is extraction from a transcript, not conversation. */
const SUMMARY_MODEL = process.env.ASSISTANT_SUMMARY_MODEL ?? "claude-haiku-4-5-20251001";

interface Extracted {
  intent?: string | null;
  summary?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  needsHuman?: boolean;
}

/** Models wrap JSON in prose often enough that this is worth doing properly. */
function parseJson(raw: string): Extracted | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Extracted;
  } catch {
    return null;
  }
}

/** A phone number the business could actually dial. */
function usablePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? raw.trim().slice(0, 40) : null;
}

/**
 * Turns a conversation into something a salesperson can act on.
 *
 * Runs after the visitor already has their reply, so a slow or failed
 * summarisation never delays the chat. If it throws, the transcript is still
 * in the database — the summary is a convenience on top of the record, never
 * the record itself.
 *
 * When contact details were given, a real lead is created so the conversation
 * lands in the same inbox as every web form rather than in a separate place
 * nobody remembers to check. The lead is created once and then updated: a
 * chat that continues must not produce five leads for one person.
 */
export async function summariseConversation(conversationId: string): Promise<void> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return;

  const [conversation] = await db
    .select()
    .from(assistantConversations)
    .where(eq(assistantConversations.id, conversationId))
    .limit(1);
  if (!conversation) return;

  const rows = await db
    .select({ role: assistantMessages.role, content: assistantMessages.content })
    .from(assistantMessages)
    .where(eq(assistantMessages.conversationId, conversationId))
    .orderBy(asc(assistantMessages.createdAt));
  if (rows.length === 0) return;

  const transcript = rows
    .map((r) => `${r.role === "assistant" ? "Assistant" : "Visitor"}: ${r.content}`)
    .join("\n");

  let extracted: Extracted | null = null;
  try {
    const anthropic = new Anthropic({ apiKey: key });
    const response = await anthropic.messages.create({
      model: SUMMARY_MODEL,
      max_tokens: 500,
      system: SUMMARY_PROMPT,
      messages: [{ role: "user", content: transcript }],
    });
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    extracted = parseJson(text);
  } catch (e) {
    console.error("[assistant] summarise failed", e);
    return;
  }

  if (!extracted?.summary) return;

  const name = extracted.name?.trim() || null;
  const phone = usablePhone(extracted.phone);
  const needsHuman = Boolean(extracted.needsHuman);

  await db
    .update(assistantConversations)
    .set({
      summary: extracted.summary.slice(0, 4000),
      intent: extracted.intent?.slice(0, 200) ?? null,
      needsHuman,
    })
    .where(eq(assistantConversations.id, conversationId));

  // A lead needs someone to call. Without a name and a number there is nothing
  // to follow up, and filing one anyway would fill the inbox with rows that
  // cannot be actioned — the conversation is still recorded either way.
  if (!name || !phone) return;

  const message =
    `[Website assistant] ${extracted.intent ?? "Enquiry"}\n\n${extracted.summary}` +
    (conversation.landingPath ? `\n\nStarted on: ${conversation.landingPath}` : "");

  if (conversation.leadId) {
    await db
      .update(leads)
      .set({ name, phone, email: extracted.email?.trim() || null, message })
      .where(eq(leads.id, conversation.leadId));
    return;
  }

  const [lead] = await db
    .insert(leads)
    .values({
      marketCode: conversation.marketCode,
      type: "contact",
      status: "new",
      name,
      phone,
      email: extracted.email?.trim() || null,
      message,
      source: "assistant",
      landingPath: conversation.landingPath,
    })
    .returning({ id: leads.id });

  await db
    .update(assistantConversations)
    .set({ leadId: lead.id })
    .where(eq(assistantConversations.id, conversationId));

  // Same alerting as any web form, so a chat at 2am reaches whoever is on call.
  try {
    await notifyStaffOfLead({
      leadId: lead.id,
      type: "assistant chat",
      market: conversation.marketCode,
      name,
      phone,
      email: extracted.email,
      message: extracted.summary,
      vehicle: extracted.intent ?? null,
      adminUrl: `${siteUrl()}/admin/conversations`,
    });
  } catch (e) {
    console.error("[assistant] notify failed", e);
  }
}
