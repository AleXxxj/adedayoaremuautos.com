import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MARKETS, isMarketCode } from "@/lib/market";
import { FINANCE_STEPS, ELIGIBILITY, FINANCE_NOTE } from "@/content/site";
import { PaymentCalculator } from "@/components/PaymentCalculator";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  return {
    title: "Vehicle financing — Adedayo Aremu Autos",
    description:
      market === "us"
        ? "In-house vehicle financing in Greensboro, North Carolina. Work out a payment, then apply."
        : "Flexible instalment plans on quality vehicles. Work out a payment, then apply.",
    alternates: {
      canonical: `/${market}/financing`,
      languages: { "en-US": "/us/financing", "en-NG": "/ng/financing" },
    },
  };
}

export default async function FinancingPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();
  const market = MARKETS[code];

  const requirements = ELIGIBILITY[code];
  const terms = market.financing.termMonths;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-12 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight">Financing</h1>
        <p className="mt-3 text-lg text-[var(--text-secondary)]">
          {code === "us"
            ? "We arrange financing in-house, so you deal with us directly rather than being passed between offices."
            : "Instalment plans arranged in-house, over terms that suit you."}
        </p>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Terms available: {terms[0]}–{terms[terms.length - 1]} months.
        </p>
      </header>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="mb-14">
        <h2 className="mb-6 text-xl font-bold tracking-tight">How it works</h2>
        <ol className="grid gap-5 sm:grid-cols-3">
          {FINANCE_STEPS.map((s, i) => (
            <li
              key={s.title}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5"
            >
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-[var(--cta-bg)] text-sm font-bold text-[var(--cta-fg)]">
                {i + 1}
              </span>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Calculator ───────────────────────────────────────────────────── */}
      <section className="mb-14">
        <h2 className="mb-2 text-xl font-bold tracking-tight">
          Work out a payment
        </h2>
        <p className="mb-6 max-w-2xl text-sm text-[var(--text-muted)]">
          Put in your own figures. This runs the same arithmetic our sales team
          uses, so what you see here is what you will be quoted on the same terms.
        </p>
        <PaymentCalculator market={market} />
      </section>

      {/* ── Eligibility ──────────────────────────────────────────────────── */}
      <section className="mb-14">
        <h2 className="mb-2 text-xl font-bold tracking-tight">What you will need</h2>
        <p className="mb-6 text-sm text-[var(--text-muted)]">
          Have these ready and the process moves quickly.
        </p>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {requirements.map((r) => (
            <li
              key={r.title}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5"
            >
              <h3 className="font-semibold">{r.title}</h3>
              <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{r.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Apply ────────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-8">
        <h2 className="text-xl font-bold tracking-tight">Ready to apply?</h2>
        <p className="mt-2 max-w-xl text-[var(--text-secondary)]">
          Send us your details and the vehicle you are interested in. We will
          come back to you with what we can do.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/${code}/contact?type=finance`}
            className="rounded-lg bg-[var(--cta-bg)] px-6 py-3 font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)]"
          >
            Start an application
          </Link>
          <Link
            href={`/${code}/inventory`}
            className="rounded-lg border border-[var(--border-strong)] px-6 py-3 font-medium hover:bg-[var(--surface-2)]"
          >
            Browse inventory
          </Link>
        </div>

        {/*
          No application form here asks for an SSN or BVN. The legacy site
          collected both in a plain web form that posted to an unconfigured
          endpoint. Sensitive identifiers are taken in person or over a secured
          channel, never through a public form.
        */}
        <p className="mt-6 max-w-2xl text-xs leading-relaxed text-[var(--text-muted)]">
          {FINANCE_NOTE[code]} We never ask for your{" "}
          {code === "us" ? "Social Security Number" : "BVN"} through this
          website — those details are only ever taken in person or over a
          secure channel once an application is under way.
        </p>
      </section>
    </div>
  );
}
