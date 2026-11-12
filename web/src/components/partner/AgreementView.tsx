import { PartnerBrand, PartnerShell } from "./PartnerShell";
import { card, eyebrow, pageTitle } from "./ui";

/**
 * The agreement, laid out to be read on a phone.
 *
 * Every clause in full, each under its own heading, at 17px with a line
 * length that stays readable on a wide screen. Nothing that matters is small
 * or gray. The decision comes straight after the last clause, so accepting
 * always follows the whole text, never a summary of it.
 *
 * app/partner/agreement/[token]/page.tsx looks the partner up and passes
 * what is shown; this only lays it out.
 */
export function AgreementView({
  parties,
  earlierVersion,
  clauses,
  decision,
}: {
  parties: {
    /** Their name, and their business in brackets where they gave one. */
    partner: string;
    rentalRate: string;
    /** null where sale commissions are paused (saleCommissionsOn). */
    saleRate: string | null;
    code: string;
    law: string;
    version: string;
  };
  /**
   * Set when they accepted an earlier version and are reopening their link:
   * the version they accepted, or "" when it was not recorded.
   */
  earlierVersion: string | null;
  clauses: { n: number; heading: string; body: string }[];
  /** The accept and decline controls (AgreementDecision). */
  decision: React.ReactNode;
}) {
  return (
    <PartnerShell>
      <PartnerBrand />

      <div className="mt-7">
        <p className={eyebrow}>Partner agreement</p>
        <h1 className={`${pageTitle} mt-3`}>Referral partner agreement</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-text-secondary">
          Read the {clauses.length} sections below, then accept at the end.
        </p>
      </div>

      {/* Their own name and rate, at the top. An agreement that opens "Dear
          partner" invites the entirely reasonable suspicion that it is a
          circular rather than a contract. */}
      <dl className={`${card} mt-6 grid grid-cols-2 gap-x-5 gap-y-4 p-5 sm:p-6`}>
        <Field label="Between" wide>
          Adedayo Aremu Autos
        </Field>
        <Field label="And" wide>
          {parties.partner}
        </Field>
        <Field label="Commission on rentals">{parties.rentalRate}</Field>
        {/* Sales are paused in the US (saleCommissionsOn), so no sale rate
            is offered there in writing. */}
        {parties.saleRate && <Field label="Commission on a sale">{parties.saleRate}</Field>}
        <Field label="Your referral code">
          <code className="font-mono font-bold tracking-wide">{parties.code}</code>
        </Field>
        <Field label="Governing law" wide>
          {parties.law}
        </Field>
        <Field label="Version">{parties.version}</Field>
      </dl>

      {/* Someone who accepted an earlier version, reopening their link: the
          wording below is the current one, which is not what they agreed to.
          They accept it from their partner page, where it is explained. */}
      {earlierVersion !== null && (
        <p className="mt-4 rounded-[14px] border border-warning/50 bg-warning/10 p-4 text-base leading-relaxed text-accent-300">
          You accepted an earlier version of this agreement
          {earlierVersion ? ` (${earlierVersion})` : ""}. The current version is
          below. Log in to your partner page to accept it.
        </p>
      )}

      <ol className="mt-9 max-w-[65ch] space-y-8">
        {clauses.map((c) => (
          <li key={c.n}>
            <h2 className="flex gap-2.5 font-[family-name:var(--font-space-grotesk)] text-xl font-bold leading-snug tracking-tight text-text-primary">
              <span className="shrink-0 tabular-nums text-brand-300">{c.n}.</span>
              {c.heading}
            </h2>
            <p className="mt-2 text-[17px] leading-[1.65] text-text-secondary">{c.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-10 max-w-[65ch]">{decision}</div>
    </PartnerShell>
  );
}

/** One line of the summary. `wide` ones take the whole row on a phone. */
function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`min-w-0 ${wide ? "col-span-2 sm:col-span-1" : ""}`}>
      <dt className="text-sm font-semibold text-text-secondary">{label}</dt>
      <dd className="mt-0.5 break-words text-base font-semibold text-text-primary">{children}</dd>
    </div>
  );
}

/**
 * A page that is only a message: a link that no longer works, an agreement
 * that was declined or closed, an account that already exists.
 */
export function PartnerNotice({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <PartnerShell narrow>
      <PartnerBrand />
      <div className={`${card} mt-7 p-6 sm:p-7`}>
        <h1 className={pageTitle}>{title}</h1>
        <div className="mt-3 text-[17px] leading-relaxed text-text-secondary">{children}</div>
        {action && <div className="mt-6">{action}</div>}
      </div>
    </PartnerShell>
  );
}
