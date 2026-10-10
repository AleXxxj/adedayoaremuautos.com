import Link from "next/link";
import type { Metadata } from "next";
import { partnerByAgreementToken } from "@/lib/partner";
import { PartnerShell } from "@/components/partner/PartnerShell";
import { PartnerAccountForm } from "@/components/partner/PartnerAccountForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create your partner account",
  robots: { index: false, follow: false },
};

/**
 * The last step: a password, and they are in.
 *
 * There is no email field. The address comes from the application the owner
 * approved, and the token is what proves the person standing here reads that
 * inbox — letting them type an address instead would hand the account to
 * whoever holds the link.
 */
export default async function PartnerStartPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const partner = await partnerByAgreementToken(token);

  if (!partner) {
    return (
      <PartnerShell narrow>
        <h1 className="text-xl font-bold text-white">This link is not valid</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#9b9b9b]">
          It may have been used already — in which case you have an account and
          can{" "}
          <Link href="/partner/login" className="text-[#4e9d76] underline">
            sign in
          </Link>
          . If not, email{" "}
          <a
            href="mailto:info@adedayoaremuautos.com"
            className="text-[#4e9d76] underline"
          >
            info@adedayoaremuautos.com
          </a>{" "}
          and we will send you a fresh one.
        </p>
      </PartnerShell>
    );
  }

  if (partner.status !== "active" || !partner.agreedAt) {
    return (
      <PartnerShell narrow>
        <h1 className="text-xl font-bold text-white">
          The agreement comes first
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#9b9b9b]">
          Your account opens once you have read and accepted the partner
          agreement. The link to it is in your email.
        </p>
      </PartnerShell>
    );
  }

  if (partner.userId) {
    return (
      <PartnerShell narrow>
        <h1 className="text-xl font-bold text-white">You already have an account</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#9b9b9b]">
          Sign in with {partner.email} and the password you chose.
        </p>
        <Link
          href="/partner/login"
          className="mt-5 block rounded-xl bg-[#2a5c42] px-5 py-3.5 text-center text-sm font-bold text-white"
        >
          Sign in
        </Link>
      </PartnerShell>
    );
  }

  return (
    <PartnerShell narrow>
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#7d7d7d]">
        Adedayo Aremu Autos
      </div>
      <h1 className="mt-2 text-xl font-bold text-white">
        Create your partner account
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[#9b9b9b]">
        Choose a password and your dashboard is ready. You will sign in with{" "}
        <strong className="text-[#d4d4d4]">{partner.email}</strong>.
      </p>

      <PartnerAccountForm token={token} />
    </PartnerShell>
  );
}
