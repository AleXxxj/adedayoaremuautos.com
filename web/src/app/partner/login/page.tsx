import type { Metadata } from "next";
import Link from "next/link";
import { PartnerShell } from "@/components/partner/PartnerShell";
import { PartnerLoginForm } from "@/components/partner/PartnerLoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Partner sign in",
  robots: { index: false, follow: false },
};

/**
 * Explains why they are here before asking them to sign in again.
 *
 * `not_partner` is a member of staff who followed a partner link, and
 * `inactive` is a suspended account. Both used to be the same blank login
 * form, which tells somebody with a perfectly good password that their
 * password is the problem.
 */
const REASONS: Record<string, string> = {
  not_partner:
    "That account is not a partner account. If you are staff, sign in at /admin instead.",
  inactive:
    "Your partner account is not active at the moment. Please call us and we will explain why.",
};

export default async function PartnerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const reason = error ? REASONS[error] : undefined;

  return (
    <PartnerShell narrow>
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#7d7d7d]">
        Adedayo Aremu Autos
      </div>
      <h1 className="mt-2 text-xl font-bold text-white">Partner sign in</h1>

      {reason && (
        <p className="mt-4 rounded-lg border border-[#6b5a22] bg-[#201c10] px-4 py-3 text-sm text-[#e0c678]">
          {reason}
        </p>
      )}

      <PartnerLoginForm />

      <p className="mt-6 text-xs leading-relaxed text-[#6f6f6f]">
        Not a partner yet?{" "}
        <Link href="/us/referral" className="text-[#4e9d76] underline">
          Apply to the referral programme
        </Link>
        . Lost your password? Email{" "}
        <a
          href="mailto:info@adedayoaremuautos.com"
          className="text-[#4e9d76] underline"
        >
          info@adedayoaremuautos.com
        </a>{" "}
        and we will reset it.
      </p>
    </PartnerShell>
  );
}
