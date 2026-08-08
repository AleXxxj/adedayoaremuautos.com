import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { MARKETS, isMarketCode } from "@/lib/market";
import {
  listLocations,
  summariseHours,
  formatPhone,
  type OpeningHour,
} from "@/lib/repositories/locations";
import { LeadForm } from "@/components/LeadForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contact — Adedayo Aremu Autos",
  description: "Talk to us about buying, renting or financing a vehicle.",
};

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string }>;
  searchParams: Promise<{ vehicle?: string; type?: string }>;
}) {
  const { market: code } = await params;
  if (!isMarketCode(code)) notFound();
  const market = MARKETS[code];

  const { vehicle: vehicleSlug, type } = await searchParams;

  const [sites, vehicleRow] = await Promise.all([
    listLocations(code),
    vehicleSlug
      ? db
          .select()
          .from(vehicles)
          .where(and(eq(vehicles.marketCode, code), eq(vehicles.slug, vehicleSlug)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const vehicle = vehicleRow[0];
  const primary = sites[0];

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-10 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight">Get in touch</h1>
        <p className="mt-3 text-[var(--text-secondary)]">
          {code === "us"
            ? "Call, message, or send the form below. We answer quickly during opening hours."
            : "Call, WhatsApp, or send the form below and we will get straight back to you."}
        </p>
      </header>

      <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6 sm:p-8">
          <LeadForm
            market={market}
            defaultType={type ?? "contact"}
            vehicleSlug={vehicle?.slug}
            vehicleLabel={
              vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : undefined
            }
            phone={primary ? formatPhone(primary.phone) : null}
          />
        </div>

        <aside className="space-y-8">
          {sites.length > 0 ? (
            sites.map((site) => {
              const hours = summariseHours(site.hours as OpeningHour[] | null, market.locale);
              const tel = formatPhone(site.phone);
              return (
                <div key={site.id}>
                  <h2 className="text-lg font-semibold">{site.name}</h2>
                  <address className="mt-2 text-sm not-italic text-[var(--text-secondary)]">
                    {site.addressLine1}
                    <br />
                    {site.city}
                    {site.region && <>, {site.region}</>} {site.postalCode}
                  </address>

                  {tel && (
                    <a
                      href={`tel:${site.phone}`}
                      className="mt-4 block rounded-lg bg-[var(--cta-bg)] py-3 text-center font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)]"
                    >
                      Call {tel}
                    </a>
                  )}

                  {hours && (
                    <p className="mt-3 text-sm text-[var(--text-muted)]">{hours}</p>
                  )}

                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(
                      `${site.addressLine1}, ${site.city}, ${site.region ?? ""} ${site.postalCode ?? ""}`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-sm text-[var(--link)] hover:underline"
                  >
                    Get directions ↗
                  </a>
                </div>
              );
            })
          ) : (
            // No invented address. Nigeria has no showroom record yet.
            <p className="text-sm text-[var(--text-muted)]">
              Send the form and we will call you back.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
