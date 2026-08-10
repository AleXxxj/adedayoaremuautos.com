"use client";

import { useActionState } from "react";
import { moderateComment, type BlogResult } from "@/lib/actions/blog";
import type { ArticleComment } from "@/db/schema";

const STATUS_STYLE: Record<string, string> = {
  pending: "text-[var(--warning)]",
  approved: "text-[var(--success)]",
  rejected: "text-[var(--text-muted)]",
};

export function CommentRow({ comment }: { comment: ArticleComment }) {
  const [, action, pending] = useActionState<BlogResult | null, FormData>(
    moderateComment,
    null,
  );

  return (
    <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <strong>{comment.authorName}</strong>
        {comment.authorEmail && (
          <span className="text-[var(--text-muted)]">{comment.authorEmail}</span>
        )}
        <span className={`ml-auto font-medium capitalize ${STATUS_STYLE[comment.status]}`}>
          {comment.status}
        </span>
      </div>

      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {comment.marketCode.toUpperCase()} · {comment.articleSlug} ·{" "}
        {new Intl.DateTimeFormat("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(comment.createdAt)}
      </p>

      <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
        {comment.body}
      </p>

      {comment.status === "pending" && (
        <form action={action} className="mt-4 flex gap-2">
          <input type="hidden" name="id" value={comment.id} />
          <button
            type="submit"
            name="action"
            value="approve"
            disabled={pending}
            className="rounded-lg bg-[var(--cta-bg)] px-4 py-2 text-sm font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)] disabled:opacity-60"
          >
            Approve
          </button>
          <button
            type="submit"
            name="action"
            value="reject"
            disabled={pending}
            className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm font-semibold hover:border-[var(--danger)] hover:text-[var(--danger)] disabled:opacity-60"
          >
            Reject
          </button>
        </form>
      )}

      {comment.status !== "pending" && comment.moderatedByEmail && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          {comment.status} by {comment.moderatedByEmail}
        </p>
      )}
    </article>
  );
}
