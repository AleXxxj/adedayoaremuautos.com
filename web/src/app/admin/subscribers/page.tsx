import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { newsletterSubscribers } from "@/db/schema";
import { requireStaff, allowedMarkets } from "@/lib/auth";
import { assertSection } from "@/lib/adminNav";
import { AdminChrome } from "../layout";

export const dynamic = "force-dynamic";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The mailing list, and whose birthday is coming up.
 *
 * The birthday field would be write-only without this screen: the business
 * asked for it in order to send greetings, and data nobody can see is data
 * nobody acts on. Today and this month lead, because that is the question
 * actually being asked — the full list is underneath for everything else.
 */
export default async function AdminSubscribersPage() {
  const user = await requireStaff();
  assertSection(user.role, "/admin/subscribers");
  const markets = allowedMarkets(user);

  const rows = await db
    .select()
    .from(newsletterSubscribers)
    .where(
      and(
        inArray(newsletterSubscribers.marketCode, markets),
        isNull(newsletterSubscribers.unsubscribedAt),
      ),
    )
    .orderBy(desc(newsletterSubscribers.createdAt));

  // The business's own calendar day, not the server's. A greeting sent on the
  // wrong side of midnight UTC arrives a day early in Lagos.
  const now = new Date();
  const today = { day: now.getUTCDate(), month: now.getUTCMonth() + 1 };

  const withBirthday = rows.filter((r) => r.birthDay != null && r.birthMonth != null);
  const todays = withBirthday.filter(
    (r) => r.birthDay === today.day && r.birthMonth === today.month,
  );
  // Strictly ahead of today. Listing a birthday that has already gone under a
  // heading that says "later this month" invites sending a greeting days late,
  // which is worse than sending none.
  const thisMonth = withBirthday
    .filter((r) => r.birthMonth === today.month && (r.birthDay ?? 0) > today.day)
    .sort((a, b) => (a.birthDay ?? 0) - (b.birthDay ?? 0));

  return (
    <AdminChrome email={user.email} role={user.role}>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Mailing list</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {rows.length} subscriber{rows.length === 1 ? "" : "s"}
            {withBirthday.length > 0 &&
              ` · ${withBirthday.length} shared a birthday`}
          </p>
        </div>

        {todays.length > 0 && (
          <section className="mb-6 rounded-xl border border-[var(--brand-400)]/40 bg-[var(--brand-400)]/10 p-5">
            <h2 className="font-semibold">
              🎂 Birthday today — {MONTHS[today.month - 1]} {today.day}
            </h2>
            <ul className="mt-3 space-y-2">
              {todays.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 text-sm">
                  <span className="font-medium">{r.firstName ?? "—"}</span>
                  <a
                    href={`mailto:${r.email}?subject=${encodeURIComponent("Happy birthday from Adedayo Aremu Autos")}`}
                    className="text-[var(--link)] hover:underline"
                  >
                    {r.email}
                  </a>
                  <span className="text-xs uppercase text-[var(--text-muted)]">
                    {r.marketCode}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Birthdays later this month
          </h2>
          {thisMonth.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              Nobody else has a birthday in {MONTHS[today.month - 1]}.
            </p>
          ) : (
            <ul className="space-y-2">
              {thisMonth.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-x-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2.5 text-sm"
                >
                  <span className="w-16 tabular-nums text-[var(--text-muted)]">
                    {MONTHS[(r.birthMonth ?? 1) - 1].slice(0, 3)} {r.birthDay}
                  </span>
                  <span className="font-medium">{r.firstName ?? "—"}</span>
                  <a href={`mailto:${r.email}`} className="text-[var(--link)] hover:underline">
                    {r.email}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Everyone on the list
          </h2>
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] px-6 py-12 text-center">
              <p className="font-medium">No subscribers yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">
                The newsletter box sits under the blog. Anyone who signs up
                appears here, along with a birthday if they chose to share one.
              </p>
            </div>
          ) : (
            <div className="admin-scroll rounded-xl border border-[var(--border-subtle)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-2)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Birthday</th>
                    <th className="px-4 py-3">Market</th>
                    <th className="px-4 py-3">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-[var(--border-subtle)]">
                      <td className="px-4 py-3">
                        <a href={`mailto:${r.email}`} className="text-[var(--link)] hover:underline">
                          {r.email}
                        </a>
                      </td>
                      <td className="px-4 py-3">{r.firstName ?? "—"}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {r.birthMonth != null && r.birthDay != null
                          ? `${MONTHS[r.birthMonth - 1].slice(0, 3)} ${r.birthDay}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 uppercase text-[var(--text-muted)]">
                        {r.marketCode}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">
                        {r.createdAt.toISOString().slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminChrome>
  );
}
