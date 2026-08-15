import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Why a one-time link could not be redeemed.
 *
 * Deliberately outside /admin. The first version reported failures by
 * redirecting to /admin/login?error=..., which the proxy immediately bounced
 * to /admin for anyone who still had a session — so the owner testing a link
 * in their own browser was silently returned to Inventory and the reason was
 * never shown. A diagnostic that only appears when you are signed out is no
 * diagnostic at all.
 */
export default async function LinkProblemPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; detail?: string }>;
}) {
  const { reason, detail } = await searchParams;

  const explanation =
    reason === "bad_link"
      ? "That link is missing the part that identifies it. It may have been cut short when it was copied — these links are long, and chat apps sometimes wrap them."
      : "That link could not be redeemed. Invitation and reset links work once and expire, so the usual cause is that it has already been used or has been sitting unopened for too long.";

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-8">
        <h1 className="text-lg font-bold tracking-tight">This link did not work</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{explanation}</p>

        <p className="mt-4 text-sm text-[var(--text-muted)]">
          Ask whoever invited you to open <strong>Staff</strong> in the admin and
          generate a fresh one. Nothing is wrong with the account itself.
        </p>

        {detail && (
          <p className="mt-4 rounded-lg bg-[var(--surface-2)] px-3 py-2 font-mono text-xs break-words">
            {detail}
          </p>
        )}

        <Link
          href="/admin/login"
          className="mt-6 inline-block rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm font-medium"
        >
          Go to sign in
        </Link>
      </div>
    </div>
  );
}
