"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rentalBookings } from "@/db/schema";
import { requireStaff, assertMarketAccess } from "@/lib/auth";
import { fromMajor } from "@/lib/money";
import { MARKETS } from "@/lib/market";

export interface AgreementResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

const schema = z.object({
  id: z.string().uuid(),
  renterLegalName: z.string().trim().max(160).optional(),
  authorizedUse: z.string().trim().max(400).optional(),
  pickupLocation: z.string().trim().max(300).optional(),
  mileageAllowancePerDay: z.coerce.number().int().min(0).max(100000).optional(),
  /** Entered in dollars/naira per mile; stored in minor units. */
  excessMileRate: z.coerce.number().min(0).max(1000).optional(),
  startOdometer: z.coerce.number().int().min(0).max(10000000).optional(),
  endOdometer: z.coerce.number().int().min(0).max(10000000).optional(),
});

/** An untouched number field posts "", which coerces to 0 — not the same as absent. */
function blankToUndefined(v: unknown): unknown {
  return typeof v === "string" && v.trim() === "" ? undefined : v;
}

/**
 * Records the terms that vary per agreement.
 *
 * These are the lines the hand-made document left blank for someone to fill in
 * with a pen. Holding them on the booking means the printed page comes out
 * complete, and — for the odometer readings — that excess mileage can be
 * worked out from the record rather than from a note in a drawer.
 */
export async function saveAgreementTerms(
  _prev: AgreementResult | null,
  formData: FormData,
): Promise<AgreementResult> {
  const user = await requireStaff();

  const raw = Object.fromEntries(formData.entries());
  const cleaned = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, blankToUndefined(v)]),
  );

  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }
  const v = parsed.data;

  const [booking] = await db
    .select()
    .from(rentalBookings)
    .where(eq(rentalBookings.id, v.id))
    .limit(1);
  if (!booking) return { ok: false, error: "That booking no longer exists." };
  assertMarketAccess(user, booking.marketCode);

  // Refused rather than silently stored: a return reading below the pickup
  // reading means one of them was mistyped, and excess mileage is billed from
  // the difference.
  if (
    v.startOdometer != null &&
    v.endOdometer != null &&
    v.endOdometer < v.startOdometer
  ) {
    return {
      ok: false,
      fieldErrors: {
        endOdometer: ["The return reading cannot be lower than the pickup reading."],
      },
    };
  }

  const currency = MARKETS[booking.marketCode].currency;

  await db
    .update(rentalBookings)
    .set({
      renterLegalName: v.renterLegalName || null,
      authorizedUse: v.authorizedUse || null,
      pickupLocation: v.pickupLocation || null,
      mileageAllowancePerDay: v.mileageAllowancePerDay ?? null,
      excessMileRateMinor:
        v.excessMileRate == null ? null : fromMajor(v.excessMileRate, currency).minor,
      startOdometer: v.startOdometer ?? null,
      endOdometer: v.endOdometer ?? null,
    })
    .where(eq(rentalBookings.id, v.id));

  revalidatePath(`/admin/rentals/${v.id}/agreement`);
  revalidatePath("/admin/rentals");
  return { ok: true };
}

/** Records that both parties signed, and when. */
export async function markAgreementSigned(
  _prev: AgreementResult | null,
  formData: FormData,
): Promise<AgreementResult> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const undo = String(formData.get("undo") ?? "") === "true";
  if (!id) return { ok: false, error: "Nothing to do." };

  const [booking] = await db
    .select()
    .from(rentalBookings)
    .where(eq(rentalBookings.id, id))
    .limit(1);
  if (!booking) return { ok: false, error: "That booking no longer exists." };
  assertMarketAccess(user, booking.marketCode);

  await db
    .update(rentalBookings)
    .set({ agreementSignedAt: undo ? null : new Date() })
    .where(eq(rentalBookings.id, id));

  revalidatePath(`/admin/rentals/${id}/agreement`);
  revalidatePath("/admin/rentals");
  return { ok: true };
}
