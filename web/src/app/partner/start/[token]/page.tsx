import Link from "next/link";
import type { Metadata } from "next";
import { partnerByAgreementToken } from "@/lib/partner";
import { CONTACT_EMAIL } from "@/lib/contact";
import { PartnerNotice } from "@/components/partner/AgreementView";
import { StartView } from "@/components/partner/StartView";
import { btnPrimary, link } from "@/components/partner/ui";

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
      <PartnerNotice title="This link is not valid">
        It may have been used already — in which case you have an account and
        can{" "}
        <Link href="/partner/login" className={link}>
          log in
        </Link>
        . If not, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className={`${link} [overflow-wrap:anywhere]`}>
          {CONTACT_EMAIL}
        </a>{" "}
        and we will send you a fresh one.
      </PartnerNotice>
    );
  }

  if (partner.status !== "active" || !partner.agreedAt) {
    return (
      <PartnerNotice title="The agreement comes first">
        Your account opens once you have read and accepted the partner
        agreement. The link to it is in your email.
      </PartnerNotice>
    );
  }

  if (partner.userId) {
    return (
      <PartnerNotice
        title="You already have an account"
        action={
          <Link href="/partner/login" className={`${btnPrimary} w-full`}>
            Log in
          </Link>
        }
      >
        Log in with <strong className="text-text-primary [overflow-wrap:anywhere]">{partner.email}</strong>{" "}
        and the password you chose.
      </PartnerNotice>
    );
  }

  return <StartView email={partner.email ?? ""} token={token} />;
}
