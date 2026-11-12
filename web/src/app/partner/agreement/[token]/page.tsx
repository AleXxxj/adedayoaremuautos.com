import type { Metadata } from "next";
import { partnerByAgreementToken } from "@/lib/partner";
import { CONTACT_EMAIL } from "@/lib/contact";
import { numberedPartnerClauses, PARTNER_TERMS_VERSION } from "@/content/partnerTerms";
import {
  accountSetupLink,
  formatBps,
  governingLaw,
  referralLink,
  saleCommissionsOn,
} from "@/lib/referral";
import { siteUrl } from "@/lib/feeds/inventory";
import { AgreementDecision } from "@/components/AgreementDecision";
import { AgreementView, PartnerNotice } from "@/components/partner/AgreementView";
import { link } from "@/components/partner/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Partner agreement",
  // Never indexed. The page is reached by a private token and its content is
  // one named person's contract, not a public terms page.
  robots: { index: false, follow: false },
};

/**
 * The agreement a partner reads before their code goes live.
 *
 * No login, by design — the same reasoning as the unsubscribe page. The token
 * in the address is random and single-purpose, so it identifies the applicant
 * without putting them through an account they do not have yet. Asking someone
 * to create a login in order to read the terms of the thing they are logging
 * in for is the wrong way round.
 *
 * The terms are rendered in full on the page rather than linked as a PDF. A
 * partner who has to download a file to find out what they are agreeing to
 * mostly does not, and an agreement nobody read is worth very little when a
 * commission is argued over.
 *
 * Laid out by components/partner/AgreementView.tsx, for a phone first.
 */
export default async function PartnerAgreementPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const partner = await partnerByAgreementToken(token);

  if (!partner) {
    return (
      <PartnerNotice title="This link is not valid">
        It may have been cut short when it was copied, or the application may
        have been closed since. Nothing has changed. Email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className={`${link} [overflow-wrap:anywhere]`}>
          {CONTACT_EMAIL}
        </a>{" "}
        and we will send you a fresh one.
      </PartnerNotice>
    );
  }

  /*
   * They declined it themselves, and came back — or their browser re-rendered
   * the page, which is what a server action does to the route it was called
   * from. Either way this has to read as the decision it was. Showing the
   * generic "closed" notice here, or losing the row by clearing the token,
   * tells somebody their link is broken moments after it worked perfectly.
   */
  if (partner.agreementDeclinedAt) {
    return (
      <PartnerNotice title="You declined this agreement">
        Nothing further has happened and your referral code was not
        activated. If you declined by mistake, or you have changed your mind,
        email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className={`${link} [overflow-wrap:anywhere]`}>
          {CONTACT_EMAIL}
        </a>{" "}
        and we will reopen it.
      </PartnerNotice>
    );
  }

  if (partner.status === "declined" || partner.status === "suspended") {
    return (
      <PartnerNotice title="This agreement is closed">
        Please call us if that is not what you expected — it can be reopened.
      </PartnerNotice>
    );
  }

  const law = governingLaw(partner.marketCode);
  const already = partner.status === "active" && Boolean(partner.agreedAt);

  return (
    <AgreementView
      parties={{
        partner: `${partner.fullName}${partner.businessName ? ` (${partner.businessName})` : ""}`,
        rentalRate: formatBps(partner.rentalCommissionBps),
        saleRate: saleCommissionsOn(partner.marketCode) ? formatBps(partner.commissionBps) : null,
        code: partner.code,
        law,
        version: PARTNER_TERMS_VERSION,
      }}
      earlierVersion={
        already && partner.agreementVersion !== PARTNER_TERMS_VERSION
          ? (partner.agreementVersion ?? "")
          : null
      }
      clauses={numberedPartnerClauses(law)}
      decision={
        <AgreementDecision
          token={token}
          name={partner.fullName}
          code={partner.code}
          link={referralLink(siteUrl(), partner.code)}
          accountLink={accountSetupLink(siteUrl(), token)}
          alreadyAccepted={already}
          version={PARTNER_TERMS_VERSION}
        />
      }
    />
  );
}
