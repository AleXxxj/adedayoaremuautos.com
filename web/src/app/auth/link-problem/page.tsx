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

  /*
   * Supabase answers "Email link is invalid or has expired" for a token that
   * was truncated, one that was never valid, one already used, and one that
   * genuinely timed out. Four different situations, one sentence, and no way
   * from here to tell them apart.
   *
   * The page used to name expiry as "the usual cause", which was a guess
   * presented as a diagnosis — and the wrong one. A link cut short in copying
   * fails this way while never being redeemed at all, so the account stays
   * unconfirmed, every freshly generated link fails identically, and the
   * expiry story explains none of it. Now the causes are listed in the order
   * they actually occur, and none of them is asserted.
   */
  const explanation =
    reason === "bad_link"
      ? "That link is missing the part that identifies it, so it was almost certainly cut short somewhere between being created and reaching you."
      : "That link was not accepted. This one message covers several causes, and there is no way to tell from here which applies:";

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-8">
        <h1 className="text-lg font-bold tracking-tight">This link did not work</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{explanation}</p>

        {reason !== "bad_link" && (
          <ul className="mt-3 space-y-1.5 text-sm text-[var(--text-muted)]">
            <li className="flex gap-2">
              <span aria-hidden>•</span>
              <span>
                The link was not copied in full. These are long, and a selection
                that stops even one character short fails exactly like this.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden>•</span>
              <span>It has already been used — they work once.</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden>•</span>
              <span>It sat unopened long enough to expire.</span>
            </li>
          </ul>
        )}

        <p className="mt-4 text-sm text-[var(--text-muted)]">
          Ask whoever invited you to open <strong>Staff</strong> in the admin and
          send it again — it will be emailed straight to you, which avoids the
          copying problem entirely. Nothing is wrong with the account itself.
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
