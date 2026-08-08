import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { leads, vehicles } from "@/db/schema";
import { requireStaff, allowedMarkets } from "@/lib/auth";
import { AdminChrome } from "../layout";
import { LeadRow } from "@/components/admin/LeadRow";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  const user = await requireStaff();
  const markets = allowedMarkets(user);

  const rows = await db
    .select({
      lead: leads,
      vehicleMake: vehicles.make,
      vehicleModel: vehicles.model,
      vehicleYear: vehicles.year,
      vehicleSlug: vehicles.slug,
    })
    .from(leads)
    .leftJoin(vehicles, eq(leads.vehicleId, vehicles.id))
    .where(
      markets.length === 1
        ? eq(leads.marketCode, markets[0])
        : inArray(leads.marketCode, markets),
    )
    .orderBy(desc(leads.createdAt))
    .limit(200);

  const newCount = rows.filter((r) => r.lead.status === "new").length;

  return (
    <AdminChrome email={user.email} role={user.role}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {rows.length} total
            {newCount > 0 && (
              <>
                {" · "}
                <span className="font-medium text-[var(--warning)]">
                  {newCount} awaiting a first response
                </span>
              </>
            )}
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] px-6 py-16 text-center">
            <p className="font-medium">No leads yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">
              Enquiries from the contact form and vehicle pages land here the
              moment they are submitted — before any email or SMS is sent, so
              nothing can be lost in delivery.
            </p>
            <Link
              href="/us/contact"
              target="_blank"
              className="mt-6 inline-block text-sm text-[var(--link)] hover:underline"
            >
              Open the public contact form ↗
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map(({ lead, vehicleMake, vehicleModel, vehicleYear, vehicleSlug }) => (
              <LeadRow
                key={lead.id}
                lead={{
                  id: lead.id,
                  marketCode: lead.marketCode,
                  type: lead.type,
                  status: lead.status,
                  name: lead.name,
                  email: lead.email,
                  phone: lead.phone,
                  message: lead.message,
                  preferredContact: lead.preferredContact,
                  source: lead.source,
                  createdAt: lead.createdAt.toISOString(),
                  firstResponseAt: lead.firstResponseAt?.toISOString() ?? null,
                }}
                vehicle={
                  vehicleMake
                    ? {
                        label: `${vehicleYear} ${vehicleMake} ${vehicleModel}`,
                        slug: vehicleSlug!,
                      }
                    : null
                }
              />
            ))}
          </ul>
        )}
      </div>
    </AdminChrome>
  );
}
