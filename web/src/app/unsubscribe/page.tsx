import Link from "next/link";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { newsletterSubscribers } from "@/db/schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe — Adedayo Aremu Autos",
  robots: { index: false, follow: false },
};

/**
 * One click, no login, no questions.
 *
 * Tokens were generated and stored from the day the newsletter shipped and
 * nothing ever consumed them — there was no way off the list at all. That is
 * not a missing nicety: a marketing email without a working opt-out breaks
 * CAN-SPAM in the United States, where the penalty is assessed per message,
 * and Gmail and Yahoo now reject bulk senders that omit one-click unsubscribe.
 *
 * The token is random and unguessable, which is why this needs no login: it
 * identifies the row without exposing an id and without the link telling an
 * interceptor anything about the subscriber.
 *
 * Idempotent by construction. Someone who clicks twice — or whose mail client
 * pre-fetches links — must see "you are unsubscribed" both times rather than
 * an error implying it did not work.
 *
 * Styled with utilities rather than the site's own classes: this page sits
 * outside the market layout, so the legacy stylesheet is not loaded here and
 * its reset cannot strip the spacing.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  let done = false;
  if (token) {
    const [row] = await db
      .update(newsletterSubscribers)
      .set({ unsubscribedAt: new Date() })
      .where(eq(newsletterSubscribers.unsubscribeToken, token))
      .returning({ email: newsletterSubscribers.email });
    done = Boolean(row);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-6 py-16 text-[#e8e8e8]">
      <div className="w-full max-w-md rounded-2xl border border-[#262626] bg-[#101010] p-8 text-center">
        <div className="text-4xl">{done ? "✅" : "❔"}</div>

        <h1 className="mt-4 text-xl font-bold tracking-tight text-white">
          {done ? "You are unsubscribed" : "This link is not valid"}
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-[#9b9b9b]">
          {done ? (
            <>
              We will not send you any more newsletters. You will still hear
              from us if you contact us about a vehicle — that is a reply, not
              marketing.
            </>
          ) : (
            <>
              It may have already been used, or been cut short when it was
              copied. Nothing has changed. Email{" "}
              <a
                href="mailto:info@adedayoaremuautos.com"
                className="text-[#4e9d76] underline"
              >
                info@adedayoaremuautos.com
              </a>{" "}
              and we will take you off the list by hand.
            </>
          )}
        </p>

        <Link
          href="/us"
          className="mt-7 inline-block rounded-lg border border-[#333] px-4 py-2 text-sm font-medium text-[#e8e8e8]"
        >
          Back to the website
        </Link>
      </div>
    </main>
  );
}
