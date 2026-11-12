import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/contact";
import { PartnerBrand, PartnerShell } from "@/components/partner/PartnerShell";
import { PartnerLoginForm } from "@/components/partner/PartnerLoginForm";
import { card, eyebrow, link, pageTitle } from "@/components/partner/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Partner log in",
  robots: { index: false, follow: false },
};

/**
 * Explains why they are here before asking them to log in again.
 *
 * `not_partner` is a member of staff who followed a partner link, and
 * `inactive` is a suspended account. Both used to be the same blank login
 * form, which tells somebody with a perfectly good password that their
 * password is the problem.
 */
const REASONS: Record<string, string> = {
  not_partner:
    "That account is not a partner account. If you are staff, log in at /admin instead.",
  inactive:
    "Your partner account is not active at the moment. Please call us and we will explain why.",
};

/** A lost password is reset by hand: the email arrives already addressed and titled. */
const RESET = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Reset my partner password")}`;

/**
 * Partner log in, built for a phone: it starts at the top of the screen with
 * the business's name, then the two fields and a full-width button, and the
 * two ways out — a lost password, or not being a partner yet — as links a
 * thumb can hit.
 */
export default async function PartnerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const reason = error ? REASONS[error] : undefined;

  return (
    <PartnerShell narrow>
      <PartnerBrand />

      <div className="mt-7">
        <p className={eyebrow}>Partners</p>
        <h1 className={`${pageTitle} mt-3`}>Log in to your partner page</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-text-secondary">
          Use your email and the password you chose.
        </p>
      </div>

      {reason && (
        <p
          role="status"
          className="mt-5 rounded-[14px] border border-warning/50 bg-warning/10 px-4 py-3 text-[15px] leading-relaxed text-accent-300"
        >
          {reason}
        </p>
      )}

      <div className={`${card} mt-6 p-5 sm:p-7`}>
        <PartnerLoginForm />
      </div>

      <div className="mt-4 grid gap-1 text-[15px]">
        <a href={RESET} className={`${link} inline-flex min-h-[44px] items-center self-start`}>
          Forgot your password?
        </a>
        <p className="flex min-h-[44px] flex-wrap items-center gap-x-1.5 text-text-secondary">
          Not a partner yet?
          <Link href="/us/referral" className={link}>
            Apply
          </Link>
        </p>
      </div>
    </PartnerShell>
  );
}
