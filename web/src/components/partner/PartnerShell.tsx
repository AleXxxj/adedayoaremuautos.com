import Link from "next/link";
import { card, cardTitle } from "./ui";

/**
 * The frame every partner page sits in.
 *
 * Plain utilities and the design tokens, because these pages are outside the
 * market layout: the legacy stylesheet is not loaded here, so its reset cannot
 * strip the spacing — and nothing here should start depending on it, since the
 * partner side is the one part of the site a partner uses as a tool rather
 * than reads as a brochure.
 *
 * Phone first: content starts near the top of the screen rather than floating
 * in the middle of it, with 16px sides. `narrow` is the log in and account
 * pages, `wide` the dashboard.
 */
export function PartnerShell({
  children,
  narrow = false,
  wide = false,
}: {
  children: React.ReactNode;
  narrow?: boolean;
  wide?: boolean;
}) {
  return (
    <main className="min-h-dvh bg-surface-0 font-[family-name:var(--font-inter)] text-text-primary antialiased">
      <div
        className={`mx-auto w-full px-4 pb-16 pt-3 sm:px-6 sm:pt-8 ${
          wide ? "max-w-5xl" : narrow ? "max-w-[440px] lg:pt-14" : "max-w-3xl"
        }`}
      >
        {children}
      </div>
    </main>
  );
}

/**
 * The business name, back to the public site.
 *
 * The name is the logo, as in the site header: "ADEDAYO AREMU" with "AUTOS"
 * in green, and no separate mark. `compact` is for a row it shares with a
 * button: the name is stacked on two lines there, so it fits beside the
 * button on the narrowest phone.
 */
export function PartnerBrand({ href = "/us", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link
      href={href}
      aria-label="Back to the Adedayo Aremu Autos website"
      className="group inline-flex min-h-[44px] min-w-0 items-center gap-3 rounded-lg text-text-primary"
    >
      {/* A visible way back: the name alone didn't read as a link home. */}
      <span
        aria-hidden="true"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-secondary transition-colors duration-200 ease-out group-hover:border-brand-300 group-hover:text-text-primary motion-reduce:transition-none"
      >
        <i className="fas fa-arrow-left" />
      </span>
      <span className="min-w-0">
        <span className="block font-[family-name:var(--font-space-grotesk)] text-[16px] font-extrabold uppercase leading-[1.15] tracking-[0.02em]">
          Adedayo Aremu <span className={`text-brand-300 ${compact ? "block" : ""}`}>Autos</span>
        </span>
        <span className="mt-0.5 block text-[12px] font-semibold text-text-secondary">Back to the website</span>
      </span>
    </Link>
  );
}

/** A card with a title. The dashboard is a column of these. */
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`${card} p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className={cardTitle}>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
