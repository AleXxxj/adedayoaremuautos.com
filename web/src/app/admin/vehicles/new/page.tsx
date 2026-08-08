import Link from "next/link";
import { requireStaff, allowedMarkets } from "@/lib/auth";
import { createVehicle } from "@/lib/actions/vehicles";
import { VehicleForm } from "@/components/admin/VehicleForm";
import { AdminChrome } from "../../layout";

export const dynamic = "force-dynamic";

export default async function NewVehiclePage() {
  const user = await requireStaff();

  return (
    <AdminChrome email={user.email} role={user.role}>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <nav className="mb-6 text-sm text-[var(--text-muted)]">
          <Link href="/admin/vehicles" className="hover:text-[var(--link)]">
            ← Inventory
          </Link>
        </nav>
        <h1 className="mb-8 text-2xl font-bold tracking-tight">Add vehicle</h1>

        <VehicleForm
          action={createVehicle}
          markets={allowedMarkets(user)}
          submitLabel="Create vehicle"
        />

        <p className="mt-6 text-sm text-[var(--text-muted)]">
          Photos can be added once the vehicle is created.
        </p>
      </div>
    </AdminChrome>
  );
}
