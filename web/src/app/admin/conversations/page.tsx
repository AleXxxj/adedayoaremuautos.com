import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { assistantConversations, assistantMessages } from "@/db/schema";
import { requireStaff, allowedMarkets } from "@/lib/auth";
import { assertSection } from "@/lib/adminNav";
import { AdminChrome } from "../layout";
import { ConversationRow } from "@/components/admin/ConversationRow";

export const dynamic = "force-dynamic";

/** Enough to see the week; the transcript is the point, not the archive. */
const LIMIT = 60;

/**
 * What the assistant has been asked.
 *
 * The summary is what a salesperson reads; the full transcript is there
 * underneath for when the summary is not enough — usually when something went
 * wrong, which is exactly when a paraphrase is least useful.
 *
 * Conversations that produced contact details already appear in Leads. This
 * screen exists for the ones that did not: someone who asked whether we had a
 * seven-seater and left when the answer was no has told the business something
 * worth knowing, and there is nowhere else that would ever surface it.
 */
export default async function AdminConversationsPage() {
  const user = await requireStaff();
  assertSection(user.role, "/admin/conversations");
  const markets = allowedMarkets(user);

  const rows = await db
    .select()
    .from(assistantConversations)
    .where(inArray(assistantConversations.marketCode, markets))
    .orderBy(desc(assistantConversations.lastMessageAt))
    .limit(LIMIT);

  const ids = rows.map((r) => r.id);
  const messages = ids.length
    ? await db
        .select()
        .from(assistantMessages)
        .where(inArray(assistantMessages.conversationId, ids))
        .orderBy(asc(assistantMessages.createdAt))
    : [];

  const byConversation = new Map<string, { role: string; content: string }[]>();
  for (const m of messages) {
    const list = byConversation.get(m.conversationId) ?? [];
    list.push({ role: m.role, content: m.content });
    byConversation.set(m.conversationId, list);
  }

  const needingHuman = rows.filter((r) => r.needsHuman).length;
  const becameLeads = rows.filter((r) => r.leadId).length;

  return (
    <AdminChrome email={user.email} role={user.role}>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Assistant conversations</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {rows.length} recent
            {needingHuman > 0 && (
              <>
                {" · "}
                <span className="font-medium text-[var(--warning)]">
                  {needingHuman} need a person
                </span>
              </>
            )}
            {becameLeads > 0 && ` · ${becameLeads} became enquiries`}
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] px-6 py-16 text-center">
            <p className="font-medium">Nobody has used the assistant yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">
              It answers from live stock, rental rates and rent-to-own terms.
              When someone leaves a name and number it files an enquiry in{" "}
              <Link href="/admin/leads" className="text-[var(--link)] hover:underline">
                Leads
              </Link>{" "}
              automatically — every conversation still appears here either way.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={{
                  id: c.id,
                  marketCode: c.marketCode,
                  intent: c.intent,
                  summary: c.summary,
                  landingPath: c.landingPath,
                  needsHuman: c.needsHuman,
                  hasLead: Boolean(c.leadId),
                  messageCount: c.messageCount,
                  lastMessageAt: c.lastMessageAt.toISOString(),
                }}
                transcript={byConversation.get(c.id) ?? []}
              />
            ))}
          </ul>
        )}
      </div>
    </AdminChrome>
  );
}
