import Link from "next/link";
import { notFound } from "next/navigation";
import { MARKETS, MARKET_CODES, isMarketCode } from "@/lib/market";
import {
  listLocations,
  summariseHours,
  formatPhone,
  type OpeningHour,
} from "@/lib/repositories/locations";

export function generateStaticParams() {
  return MARKET_CODES.map((market) => ({ market }));
}

export default async function MarketLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ market: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();

  const market = MARKETS[code];
  const other = MARKET_CODES.filter((c) => c !== code);
  const sites = await listLocations(code);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--surface-0)]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
          <Link href={`/${code}`} className="font-semibold tracking-tight">
            ADEDAYO AREMU <span className="text-[var(--brand-400)]">AUTOS</span>
          </Link>

          {/*
            Only routes that exist are linked. Financing and About get added
            here as they are built — the legacy site's habit of linking to pages
            that 404 is what produced five straight commits titled "Update
            footer links to point to correct pages".
          */}
          <nav className="hidden gap-5 text-sm text-[var(--text-secondary)] md:flex">
            <Link href={`/${code}/inventory`} className="hover:text-[var(--text-primary)]">
              Inventory
            </Link>
            <Link href={`/${code}/rentals`} className="hover:text-[var(--text-primary)]">
              Rentals
            </Link>
            <Link href={`/${code}/financing`} className="hover:text-[var(--text-primary)]">
              Financing
            </Link>
            <Link href={`/${code}/about`} className="hover:text-[var(--text-primary)]">
              About
            </Link>
            <Link href={`/${code}/blog`} className="hover:text-[var(--text-primary)]">
              Guides
            </Link>
            <Link href={`/${code}/contact`} className="hover:text-[var(--text-primary)]">
              Contact
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {/*
              Switching market switches inventory, not currency. The label names
              the place, so it never reads as a price-conversion control.
            */}
            {other.map((c) => (
              <Link
                key={c}
                href={`/${c}`}
                className="rounded-full border border-[var(--border-default)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
              >
                Go to {MARKETS[c].name}
              </Link>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-[var(--border-subtle)] bg-[var(--surface-1)]">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="font-semibold tracking-tight">
                ADEDAYO AREMU{" "}
                <span className="text-[var(--brand-400)]">AUTOS</span>
              </p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Vehicle sales, rental and financing.
              </p>
            </div>

            {/* Real locations from the database. Nothing here is hardcoded, so
                a change of address is a data edit, not a nineteen-file
                find-and-replace. */}
            {sites.map((site) => {
              const hours = summariseHours(
                site.hours as OpeningHour[] | null,
                market.locale,
              );
              const phone = formatPhone(site.phone);
              return (
                <address key={site.id} className="text-sm not-italic">
                  <p className="font-medium text-[var(--text-primary)]">
                    {site.name}
                  </p>
                  <p className="mt-1 text-[var(--text-muted)]">
                    {site.addressLine1}
                    {site.addressLine2 && <>, {site.addressLine2}</>}
                    <br />
                    {site.city}
                    {site.region && <>, {site.region}</>} {site.postalCode}
                  </p>
                  {phone && (
                    <p className="mt-2">
                      <a
                        href={`tel:${site.phone}`}
                        className="text-[var(--link)] hover:underline"
                      >
                        {phone}
                      </a>
                    </p>
                  )}
                  {hours && (
                    <p className="mt-1 text-[var(--text-muted)]">{hours}</p>
                  )}
                </address>
              );
            })}
          </div>

          <p className="mt-10 border-t border-[var(--border-subtle)] pt-6 text-sm text-[var(--text-muted)]">
            © {new Date().getFullYear()} Adedayo Aremu Autos. All rights
            reserved. Prices shown in {market.currency}.
          </p>
        </div>
      </footer>
    </div>
  );
}
