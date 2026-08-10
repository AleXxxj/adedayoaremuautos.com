import { requireStaff } from "@/lib/auth";
import { listCommentsForModeration } from "@/lib/actions/blog";
import { AdminChrome } from "../layout";
import { CommentRow } from "@/components/admin/CommentRow";

export const dynamic = "force-dynamic";

/**
 * Comment moderation.
 *
 * Nothing a visitor submits appears on the site until it is approved here.
 * Pending comments are listed first, because they are the only ones that need
 * a decision.
 */
export default async function AdminCommentsPage() {
  const user = await requireStaff();
  const all = await listCommentsForModeration();

  const pending = all.filter((c) => c.status === "pending");
  const decided = all.filter((c) => c.status !== "pending");

  return (
    <AdminChrome email={user.email} role={user.role}>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Comments</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {pending.length > 0 ? (
              <span className="font-medium text-[var(--warning)]">
                {pending.length} awaiting review
              </span>
            ) : (
              "Nothing awaiting review"
            )}
            {decided.length > 0 && ` · ${decided.length} decided`}
          </p>
        </div>

        {all.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] px-6 py-12 text-center text-sm text-[var(--text-muted)]">
            No comments have been submitted yet.
          </p>
        ) : (
          <div className="space-y-8">
            {pending.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Awaiting review
                </h2>
                <div className="space-y-3">
                  {pending.map((c) => (
                    <CommentRow key={c.id} comment={c} />
                  ))}
                </div>
              </section>
            )}

            {decided.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Decided
                </h2>
                <div className="space-y-3">
                  {decided.map((c) => (
                    <CommentRow key={c.id} comment={c} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </AdminChrome>
  );
}
