import { partnerSignOut } from "@/lib/actions/partnerAuth";

export function PartnerHeader({
  name,
  code,
  hireRate,
  saleRate,
  market,
}: {
  name: string;
  code: string;
  hireRate: string;
  saleRate: string;
  market: string;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.16em] text-[#7d7d7d]">
          Adedayo Aremu Autos · Partner
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
          {name}
        </h1>
        <p className="mt-1 text-sm text-[#9b9b9b]">
          <code className="rounded bg-[#1a1a1a] px-1.5 py-0.5 text-[#d4d4d4]">
            {code}
          </code>{" "}
          · {market}
        </p>
        {/* Both rates, spelled out. One figure labelled "commission" is how a
            partner works out their earnings on the wrong one and then asks why
            the number on the screen disagrees with theirs. */}
        <p className="mt-1 text-sm text-[#9b9b9b]">
          <strong className="text-[#d4d4d4]">{hireRate}</strong> on car hire ·{" "}
          <strong className="text-[#d4d4d4]">{saleRate}</strong> on vehicle
          sales
        </p>
      </div>

      {/* A plain form, so signing out works without JavaScript — and cannot
          be triggered by a prefetch, which a link would be. */}
      <form action={partnerSignOut}>
        <button
          type="submit"
          className="rounded-lg border border-[#333] px-3 py-1.5 text-xs text-[#b4b4b4]"
        >
          Sign out
        </button>
      </form>
    </header>
  );
}
