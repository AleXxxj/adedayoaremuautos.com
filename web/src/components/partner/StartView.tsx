import { PartnerBrand, PartnerShell } from "./PartnerShell";
import { PartnerAccountForm } from "./PartnerAccountForm";
import { card, eyebrow, pageTitle } from "./ui";

/**
 * The last step: a password, and they are in.
 *
 * app/partner/start/[token]/page.tsx checks the token and passes the email
 * the account will use; this only lays the page out.
 */
export function StartView({ email, token }: { email: string; token: string }) {
  return (
    <PartnerShell narrow>
      <PartnerBrand />

      <div className="mt-7">
        <p className={eyebrow}>Partner account</p>
        <h1 className={`${pageTitle} mt-3`}>Create your partner account</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-text-secondary">
          Choose a password and your dashboard is ready. You will log in with{" "}
          <strong className="font-semibold text-text-primary [overflow-wrap:anywhere]">{email}</strong>.
        </p>
      </div>

      <div className={`${card} mt-6 p-5 sm:p-7`}>
        <PartnerAccountForm token={token} />
      </div>
    </PartnerShell>
  );
}
