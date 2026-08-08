import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { vehicles, vehicleMedia, auditLog } from "@/db/schema";
import { requireStaff, allowedMarkets, canAccessMarket } from "@/lib/auth";
import {
  updateVehicle,
  uploadVehiclePhotoAction,
  deleteVehiclePhotoAction,
} from "@/lib/actions/vehicles";
import { VehicleForm } from "@/components/admin/VehicleForm";
import { PhotoManager } from "@/components/admin/PhotoManager";
import { AdminChrome } from "../../layout";
import { MARKETS } from "@/lib/market";
import { toMajor, money } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function EditVehiclePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  const { created } = await searchParams;

  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, id));
  if (!vehicle) notFound();
  if (!canAccessMarket(user, vehicle.marketCode)) notFound();

  const [photos, history] = await Promise.all([
    db
      .select()
      .from(vehicleMedia)
      .where(eq(vehicleMedia.vehicleId, id))
      .orderBy(desc(vehicleMedia.isPrimary), asc(vehicleMedia.position)),
    db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, id))
      .orderBy(desc(auditLog.at))
      .limit(10),
  ]);

  const market = MARKETS[vehicle.marketCode];
  const isPublic = vehicle.status === "available" || vehicle.status === "pending";

  return (
    <AdminChrome email={user.email} role={user.role}>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <nav className="mb-6 text-sm text-[var(--text-muted)]">
          <Link href="/admin/vehicles" className="hover:text-[var(--link)]">
            ← Inventory
          </Link>
        </nav>

        {created && (
          <p className="mb-6 rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 px-4 py-3 text-sm text-[var(--success)]">
            Vehicle created. Add photos below.
          </p>
        )}

        <div className="mb-8 flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight">
            {vehicle.year} {vehicle.make} {vehicle.model} {vehicle.trim ?? ""}
          </h1>
          {isPublic && (
            <Link
              href={`/${vehicle.marketCode}/inventory/${vehicle.slug}`}
              target="_blank"
              className="shrink-0 text-sm text-[var(--link)] hover:underline"
            >
              View live listing ↗
            </Link>
          )}
        </div>

        <div className="space-y-10">
          <VehicleForm
            action={updateVehicle}
            markets={allowedMarkets(user)}
            submitLabel="Save changes"
            defaults={{
              id: vehicle.id,
              marketCode: vehicle.marketCode,
              make: vehicle.make,
              model: vehicle.model,
              trim: vehicle.trim,
              year: vehicle.year,
              vin: vehicle.vin,
              chassisNo: vehicle.chassisNo,
              stockNumber: vehicle.stockNumber,
              condition: vehicle.condition,
              mileage: vehicle.mileage,
              transmission: vehicle.transmission,
              fuelType: vehicle.fuelType,
              drivetrain: vehicle.drivetrain,
              engine: vehicle.engine,
              exteriorColor: vehicle.exteriorColor,
              interiorColor: vehicle.interiorColor,
              bodyStyle: vehicle.bodyStyle,
              priceMajor:
                vehicle.priceMinor != null
                  ? toMajor(money(vehicle.priceMinor, market.currency))
                  : null,
              headline: vehicle.headline,
              description: vehicle.description,
              historyReportUrl: vehicle.historyReportUrl,
              status: vehicle.status,
              isFeatured: vehicle.isFeatured,
            }}
          />

          <PhotoManager
            vehicleId={vehicle.id}
            photos={photos}
            upload={uploadVehiclePhotoAction}
            remove={deleteVehiclePhotoAction}
          />

          {history.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                History
              </h2>
              <ul className="space-y-2 text-sm">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="flex flex-wrap gap-x-3 border-b border-[var(--border-subtle)] pb-2 text-[var(--text-secondary)]"
                  >
                    <span className="font-medium capitalize">
                      {h.action.replace(/_/g, " ")}
                    </span>
                    <span className="text-[var(--text-muted)]">
                      {h.actorEmail}
                    </span>
                    <span className="ml-auto text-[var(--text-muted)]">
                      {new Intl.DateTimeFormat(market.locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: market.timezone,
                      }).format(h.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </AdminChrome>
  );
}
