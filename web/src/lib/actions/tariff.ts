"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { vehicles, rentalRates, auditLog } from "@/db/schema";
import { requireStaff, assertMarketAccess } from "@/lib/auth";
import { MARKETS } from "@/lib/market";
import { fromMajor } from "@/lib/money";

export interface TariffResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

const schema = z.object({
  vehicleId: z.string().min(1),
  inFleet: z.coerce.boolean().default(false),
  daily: z.coerce.number().min(0).default(0),
  weekly: z.coerce.number().min(0).optional(),
  monthly: z.coerce.number().min(0).optional(),
  deposit: z.coerce.number().min(0).default(0),
  minDays: z.coerce.number().int().min(1).max(365).default(1),
  maxDays: z.coerce.number().int().min(1).max(365).optional(),
  withDriver: z.coerce.boolean().default(false),
  driverDaily: z.coerce.number().min(0).optional(),
});

/**
 * Sets a vehicle's hire tariff and whether it appears in the fleet.
 *
 * Removing a vehicle from the fleet keeps its rates rather than deleting them,
 * so putting a seasonal car back on hire does not mean retyping the tariff.
 */
export async function saveTariff(
  _prev: TariffResult | null,
  formData: FormData,
): Promise<TariffResult> {
  const user = await requireStaff();

  const raw = Object.fromEntries(formData.entries());
  const cleaned = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v === "" ? undefined : v]),
  );
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }
  const f = parsed.data;

  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, f.vehicleId));
  if (!vehicle) return { ok: false, error: "Vehicle not found." };
  assertMarketAccess(user, vehicle.marketCode);

  const cur = MARKETS[vehicle.marketCode].currency;
  const m = (n?: number) => (n == null ? null : fromMajor(n, cur).minor);

  if (f.inFleet && f.daily <= 0) {
    return { ok: false, fieldErrors: { daily: ["A hire vehicle needs a daily rate"] } };
  }
  if (f.maxDays != null && f.maxDays < f.minDays) {
    return { ok: false, fieldErrors: { maxDays: ["Maximum must be at least the minimum"] } };
  }
  if (f.withDriver && !f.driverDaily) {
    return { ok: false, fieldErrors: { driverDaily: ["Set a daily driver rate"] } };
  }

  try {
    await db.transaction(async (tx) => {
      if (f.daily > 0) {
        const values = {
          vehicleId: f.vehicleId,
          dailyMinor: m(f.daily)!,
          weeklyMinor: m(f.weekly),
          monthlyMinor: m(f.monthly),
          depositMinor: m(f.deposit) ?? 0,
          currency: cur,
          minDays: f.minDays,
          maxDays: f.maxDays ?? null,
          withDriverAvailable: f.withDriver,
          driverDailyMinor: f.withDriver ? m(f.driverDaily) : null,
        };
        await tx
          .insert(rentalRates)
          .values(values)
          .onConflictDoUpdate({ target: rentalRates.vehicleId, set: values });
      }

      // listingKind decides whether it shows on the rentals page, the sales
      // pages, or both.
      const kind = f.inFleet
        ? vehicle.priceMinor != null
          ? "both"
          : "rental"
        : "sale";
      await tx.update(vehicles).set({ listingKind: kind }).where(eq(vehicles.id, f.vehicleId));
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("rental_rates_non_negative")) {
      return { ok: false, error: "Rates cannot be negative." };
    }
    return { ok: false, error: `Could not save: ${msg}` };
  }

  await db.insert(auditLog).values({
    actorId: user.id,
    actorEmail: user.email,
    entity: "vehicle",
    entityId: f.vehicleId,
    action: "tariff_updated",
    diff: { inFleet: f.inFleet, daily: f.daily } as never,
  });

  revalidatePath(`/admin/vehicles/${f.vehicleId}`);
  revalidatePath(`/${vehicle.marketCode}/rentals`);
  return { ok: true };
}
