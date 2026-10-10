/**
 * The frame every partner page sits in.
 *
 * Plain utilities and explicit colours, because these pages are outside the
 * market layout: the legacy stylesheet is not loaded here, so its reset cannot
 * strip the spacing — and nothing here should start depending on it, since the
 * partner side is the one part of the site a partner uses as a tool rather
 * than reads as a brochure.
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
    <main className="min-h-screen bg-[#0a0a0a] px-5 py-10 text-[#e8e8e8]">
      <div
        className={`mx-auto w-full ${
          wide ? "max-w-5xl" : narrow ? "max-w-md" : "max-w-3xl"
        }`}
      >
        {narrow ? (
          <div className="rounded-2xl border border-[#262626] bg-[#101010] p-7 sm:p-9">
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </main>
  );
}

/** A panel. The dashboard is a column of these. */
export function Panel({
  title,
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#262626] bg-[#101010] p-5 sm:p-6">
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && (
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7d7d7d]">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
