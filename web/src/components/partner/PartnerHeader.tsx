import { partnerSignOut } from "@/lib/actions/partnerAuth";
import { PartnerBrand } from "./PartnerShell";
import { eyebrow, pageTitle } from "./ui";

/**
 * Who is logged in, their code and rate, and Log out.
 *
 * Log out sits in the top corner, where people look for it, and is quieter
 * than everything a partner came to do.
 */
export function PartnerHeader({
  name,
  code,
  hireRate,
  saleRate,
  market,
  home,
}: {
  name: string;
  code: string;
  hireRate: string;
  /** null where sale commissions are paused (saleCommissionsOn). */
  saleRate: string | null;
  market: string;
  /** The public site for the partner's market. */
  home: string;
}) {
  return (
    <header>
      <div className="flex items-center justify-between gap-3">
        <PartnerBrand href={home} compact />

        {/* A plain form, so logging out works without JavaScript — and cannot
            be triggered by a prefetch, which a link would be. */}
        <form action={partnerSignOut} className="shrink-0">
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border-default px-4 text-sm font-semibold text-text-secondary transition-colors duration-200 ease-out hover:border-border-strong hover:text-text-primary motion-reduce:transition-none"
          >
            <i className="fas fa-arrow-right-from-bracket" aria-hidden="true" />
            Log out
          </button>
        </form>
      </div>

      <div className="mt-7">
        <p className={eyebrow}>Logged in as</p>
        <h1 className={`${pageTitle} mt-3 break-words`}>{name}</h1>
        {/* Each rate named for what it pays on. One figure labelled
            "commission" is how a partner works out their earnings on the
            wrong one and then asks why the number on the screen disagrees. */}
        <p className="mt-3 text-[15px] text-text-secondary">
          Code{" "}
          <code className="rounded-md bg-surface-2 px-2 py-0.5 font-bold tracking-wide text-text-primary">
            {code}
          </code>
        </p>
        <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">
          <strong className="text-text-primary">{hireRate}</strong> on car rentals
          {saleRate && (
            <>
              &nbsp;· <strong className="text-text-primary">{saleRate}</strong> on vehicle
              sales
            </>
          )}
          &nbsp;· {market}
        </p>
      </div>
    </header>
  );
}
