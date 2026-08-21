import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, newsletterSubscribers } from "@/db/schema";
import { requireStaff, allowedMarkets } from "@/lib/auth";
import { assertSection } from "@/lib/adminNav";
import { AdminChrome } from "../layout";
import { CampaignComposer } from "@/components/admin/CampaignComposer";
import { ContinueCampaign } from "@/components/admin/ContinueCampaign";

export const dynamic = "force-dynamic";

/**
 * Broadcasts to the mailing list.
 *
 * The history below is not decoration. A business that emails its customers
 * needs to be able to answer "what did we send them, and when" — for its own
 * memory, and because that is the first question asked when somebody complains
 * about receiving something.
 */
export default async function AdminCampaignsPage() {
  const user = await requireStaff();
  assertSection(user.role, "/admin/campaigns");
  const markets = allowedMarkets(user);

  const counts = await db
    .select({
      market: newsletterSubscribers.marketCode,
      total: sql<number>`count(*)::int`,
    })
    .from(newsletterSubscribers)
    .where(isNull(newsletterSubscribers.unsubscribedAt))
    .groupBy(newsletterSubscribers.marketCode);

  const audience: Record<string, number> = {};
  for (const m of markets) audience[m] = 0;
  for (const c of counts) if (m_in(markets, c.market)) audience[c.market] = c.total;

  const history = await db
    .select()
    .from(campaigns)
    .where(inArray(campaigns.marketCode, markets))
    .orderBy(desc(campaigns.createdAt))
    .limit(30);

  return (
    <AdminChrome email={user.email} role={user.role}>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Broadcasts</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {Object.entries(audience)
              .map(([m, n]) => `${n} subscriber${n === 1 ? "" : "s"} in ${m.toUpperCase()}`)
              .join(" · ")}
          </p>
        </div>

        <CampaignComposer markets={markets} audience={audience} />

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Everything sent so far
          </h2>

          {history.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              Nothing sent yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {history.map((c) => (
                <li
                  key={c.id}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5"
                >
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{c.subject}</span>
                        <span className="text-xs uppercase text-[var(--text-muted)]">
                          {c.marketCode}
                        </span>
                        {c.status === "sending" && (
                          <span className="rounded-full border border-[var(--warning)]/40 px-2 py-0.5 text-xs text-[var(--warning)]">
                            part-sent
                          </span>
                        )}
                        {c.status === "failed" && (
                          <span className="rounded-full border border-[var(--danger)]/40 px-2 py-0.5 text-xs text-[var(--danger)]">
                            some failed
                          </span>
                        )}
                      </div>

                      <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-[var(--text-secondary)]">
                        {c.body}
                      </p>

                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        {c.createdByEmail ?? "unknown"} ·{" "}
                        {c.createdAt.toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>

                    <div className="text-right text-xs text-[var(--text-muted)]">
                      <div className="text-sm font-semibold text-[var(--text-primary)]">
                        {c.sentCount}/{c.recipientCount}
                      </div>
                      <div>delivered</div>
                      {c.failedCount > 0 && (
                        <div className="mt-1 text-[var(--danger)]">
                          {c.failedCount} failed
                        </div>
                      )}
                    </div>
                  </div>

                  {c.status === "sending" && <ContinueCampaign id={c.id} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminChrome>
  );
}

/** Narrows a market string against the markets this person may act on. */
function m_in(markets: string[], value: string): boolean {
  return markets.includes(value);
}
