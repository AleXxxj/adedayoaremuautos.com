import type { Metadata } from "next";
import { partnerByAgreementToken } from "@/lib/partner";
import { numberedPartnerClauses, PARTNER_TERMS_VERSION } from "@/content/partnerTerms";
import {
  accountSetupLink,
  formatBps,
  governingLaw,
  referralLink,
} from "@/lib/referral";
import { siteUrl } from "@/lib/feeds/inventory";
import { AgreementDecision } from "@/components/AgreementDecision";

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
 * Styled with plain utilities: this sits outside the market layout, so the
 * legacy stylesheet is not loaded and its reset cannot strip the spacing.
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
      <Shell>
        <h1 className="text-xl font-bold text-white">This link is not valid</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#9b9b9b]">
          It may have been cut short when it was copied, or the application may
          have been closed since. Nothing has changed. Email{" "}
          <a
            href="mailto:info@adedayoaremuautos.com"
            className="text-[#4e9d76] underline"
          >
            info@adedayoaremuautos.com
          </a>{" "}
          and we will send you a fresh one.
        </p>
      </Shell>
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
      <Shell>
        <h1 className="text-xl font-bold text-white">You declined this agreement</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#9b9b9b]">
          Nothing further has happened and your referral code was not
          activated. If you declined by mistake, or you have changed your mind,
          email{" "}
          <a
            href="mailto:info@adedayoaremuautos.com"
            className="text-[#4e9d76] underline"
          >
            info@adedayoaremuautos.com
          </a>{" "}
          and we will reopen it.
        </p>
      </Shell>
    );
  }

  if (partner.status === "declined" || partner.status === "suspended") {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-white">This agreement is closed</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#9b9b9b]">
          Please call us if that is not what you expected — it can be reopened.
        </p>
      </Shell>
    );
  }

  const clauses = numberedPartnerClauses(governingLaw(partner.marketCode));
  const already = partner.status === "active" && Boolean(partner.agreedAt);

  return (
    <Shell wide>
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#7d7d7d]">
        Adedayo Aremu Autos
      </div>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
        Referral partner agreement
      </h1>

      {/* Their own name and rate, at the top. An agreement that opens "Dear
          partner" invites the entirely reasonable suspicion that it is a
          circular rather than a contract. */}
      <dl className="mt-5 grid gap-x-6 gap-y-3 rounded-xl border border-[#262626] bg-[#141414] p-5 text-sm sm:grid-cols-2">
        <Field label="Between">Adedayo Aremu Autos</Field>
        <Field label="And">
          {partner.fullName}
          {partner.businessName ? ` (${partner.businessName})` : ""}
        </Field>
        <Field label="Your commission">{formatBps(partner.commissionBps)}</Field>
        <Field label="Your referral code">
          <code className="text-[#e8e8e8]">{partner.code}</code>
        </Field>
        <Field label="Governing law">{governingLaw(partner.marketCode)}</Field>
        <Field label="Version">{partner.agreementVersion ?? PARTNER_TERMS_VERSION}</Field>
      </dl>

      <ol className="mt-7 space-y-5">
        {clauses.map((c) => (
          <li key={c.n} className="flex gap-3">
            <span className="mt-0.5 shrink-0 text-xs font-bold tabular-nums text-[#7d7d7d]">
              {c.n}.
            </span>
            <div>
              <h2 className="text-sm font-semibold text-white">{c.heading}</h2>
              <p className="mt-1 text-sm leading-relaxed text-[#b4b4b4]">{c.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-8 border-t border-[#262626] pt-6">
        <AgreementDecision
          token={token}
          name={partner.fullName}
          code={partner.code}
          link={referralLink(siteUrl(), partner.code)}
          accountLink={accountSetupLink(siteUrl(), token)}
          alreadyAccepted={already}
        />
      </div>
    </Shell>
  );
}

function Shell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <main className="min-h-screen bg-[#0a0a0a] px-5 py-12 text-[#e8e8e8]">
      <div
        className={`mx-auto w-full rounded-2xl border border-[#262626] bg-[#101010] p-7 sm:p-9 ${
          wide ? "max-w-2xl" : "max-w-md text-center"
        }`}
      >
        {children}
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.12em] text-[#7d7d7d]">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium text-[#e8e8e8]">{children}</dd>
    </div>
  );
}
