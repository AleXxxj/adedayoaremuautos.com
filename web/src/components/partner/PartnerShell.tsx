import Image from "next/image";
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
 * The logo and the business name, back to the public site.
 *
 * The logo file is mostly transparent margin around the mark, so it is
 * cropped to the mark rather than shown whole at a size where the letters
 * would be too small to read. `compact` is for a row it shares with a
 * button: below 360px the name is left to screen readers, rather than
 * folded into three lines beside it.
 */
export function PartnerBrand({ href = "/us", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[44px] min-w-0 items-center gap-2 rounded-lg text-text-primary"
    >
      <Image
        src="/img/logo.png"
        alt=""
        width={1536}
        height={1024}
        sizes="72px"
        className="h-[30px] w-[72px] shrink-0 object-cover"
      />
      <span
        className={`min-w-0 font-[family-name:var(--font-space-grotesk)] text-[15px] font-bold leading-tight tracking-tight ${
          compact ? "sr-only min-[360px]:not-sr-only" : ""
        }`}
      >
        Adedayo Aremu Autos
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
