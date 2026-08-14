"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { vehicles, vehicleMedia, auditLog, deals, rentalBookings } from "@/db/schema";
import { requireStaff, assertMarketAccess, type Staff } from "@/lib/auth";
import { supabaseAdmin, VEHICLE_BUCKET } from "@/lib/supabase/admin";
import { MARKETS, isMarketCode, type MarketCode } from "@/lib/market";
import { fromMajor } from "@/lib/money";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

/* ── Validation ────────────────────────────────────────────────────────────
   Mirrors the database CHECK constraints. The database is the real guarantee;
   this layer exists to return a usable message instead of a Postgres error. */

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

const baseSchema = z.object({
  marketCode: z.enum(["us", "ng"]),
  make: z.string().trim().min(1, "Make is required"),
  model: z.string().trim().min(1, "Model is required"),
  trim: z.string().trim().optional(),
  year: z.coerce
    .number()
    .int()
    .min(1900, "Year looks wrong")
    .max(new Date().getFullYear() + 2, "Year is too far in the future"),
  vin: z.string().trim().toUpperCase().optional(),
  chassisNo: z.string().trim().optional(),
  stockNumber: z.string().trim().optional(),
  condition: z.string().trim().min(1, "Condition is required"),
  mileage: z.coerce.number().int().min(0).optional(),
  transmission: z.string().trim().optional(),
  fuelType: z.string().trim().optional(),
  drivetrain: z.string().trim().optional(),
  engine: z.string().trim().optional(),
  exteriorColor: z.string().trim().optional(),
  interiorColor: z.string().trim().optional(),
  bodyStyle: z.string().trim().optional(),
  /** Entered in major units (dollars / naira), stored in minor units. */
  price: z.coerce.number().min(0).optional(),
  headline: z.string().trim().optional(),
  description: z.string().trim().optional(),
  historyReportUrl: z.string().trim().url("Must be a valid URL").optional().or(z.literal("")),
  status: z.enum(["draft", "available", "pending", "sold", "unlisted"]),
  isFeatured: z.coerce.boolean().optional(),
  /** One feature per line in the admin; stored as a jsonb array. */
  featuresText: z.string().optional(),
});

const vehicleSchema = baseSchema
  .refine(
    (v) => v.marketCode !== "us" || (v.vin && VIN_RE.test(v.vin)),
    {
      message:
        "US listings need a valid 17-character VIN (letters I, O and Q are not used).",
      path: ["vin"],
    },
  )
  .refine((v) => v.marketCode !== "ng" || v.chassisNo || v.vin, {
    message: "Nigerian listings need a chassis number.",
    path: ["chassisNo"],
  })
  .refine((v) => v.status !== "available" || v.price != null, {
    message: "A vehicle cannot be published without a price.",
    path: ["price"],
  })
  .refine(
    (v) => MARKETS[v.marketCode as MarketCode].conditions.includes(v.condition),
    { message: "Condition is not valid for this market.", path: ["condition"] },
  );

/* ── Helpers ───────────────────────────────────────────────────────────── */

function slugify(parts: (string | number | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 90);
}

/** Slugs must be unique per market; append -2, -3 … on collision. */
async function uniqueSlug(
  market: MarketCode,
  base: string,
  excludeId?: string,
): Promise<string> {
  let candidate = base;
  for (let n = 2; n < 100; n++) {
    const [clash] = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.marketCode, market), eq(vehicles.slug, candidate)))
      .limit(1);

    if (!clash || clash.id === excludeId) return candidate;
    candidate = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

async function audit(
  actor: Staff,
  entityId: string,
  action: string,
  diff: unknown,
) {
  await db.insert(auditLog).values({
    actorId: actor.id,
    actorEmail: actor.email,
    entity: "vehicle",
    entityId,
    action,
    diff: diff as never,
  });
}

function parseForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  // Empty strings become undefined so optional fields validate correctly.
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v === "" ? undefined : v]),
  );
}


/** "Leather seats\nReverse camera" -> ["Leather seats", "Reverse camera"] */
function parseFeatures(text?: string): string[] {
  if (!text) return [];
  return [...new Set(text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))].slice(0, 60);
}

/* ── Actions ───────────────────────────────────────────────────────────── */

export async function createVehicle(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaff();
  const parsed = vehicleSchema.safeParse(parseForm(formData));

  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const v = parsed.data;
  assertMarketAccess(user, v.marketCode);

  const market = MARKETS[v.marketCode];
  const slug = await uniqueSlug(
    v.marketCode,
    slugify([v.year, v.make, v.model, v.trim]),
  );

  let id: string;
  try {
    const [row] = await db
      .insert(vehicles)
      .values({
        marketCode: v.marketCode,
        make: v.make,
        model: v.model,
        trim: v.trim,
        year: v.year,
        vin: v.vin || null,
        chassisNo: v.chassisNo || null,
        stockNumber: v.stockNumber,
        condition: v.condition,
        mileage: v.mileage,
        mileageUnit: market.distanceUnit,
        transmission: v.transmission,
        fuelType: v.fuelType,
        drivetrain: v.drivetrain,
        engine: v.engine,
        exteriorColor: v.exteriorColor,
        interiorColor: v.interiorColor,
        bodyStyle: v.bodyStyle,
        priceMinor:
          v.price != null ? fromMajor(v.price, market.currency).minor : null,
        currency: market.currency,
        headline: v.headline,
        description: v.description,
        historyReportUrl: v.historyReportUrl || null,
        status: v.status,
        isFeatured: Boolean(v.isFeatured),
        features: parseFeatures(v.featuresText),
        slug,
        publishedAt: v.status === "available" ? new Date() : null,
      })
      .returning({ id: vehicles.id });
    id = row.id;
  } catch (e) {
    return { ok: false, error: friendlyDbError(e) };
  }

  await audit(user, id, "create", { slug, status: v.status });
  revalidatePath("/admin/vehicles");
  revalidatePath(`/${v.marketCode}/inventory`);
  redirect(`/admin/vehicles/${id}?created=1`);
}

export async function updateVehicle(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing vehicle id." };

  const parsed = vehicleSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const v = parsed.data;
  assertMarketAccess(user, v.marketCode);

  const [before] = await db.select().from(vehicles).where(eq(vehicles.id, id));
  if (!before) return { ok: false, error: "Vehicle not found." };
  assertMarketAccess(user, before.marketCode);

  const market = MARKETS[v.marketCode];
  const slug = await uniqueSlug(
    v.marketCode,
    slugify([v.year, v.make, v.model, v.trim]),
    id,
  );

  try {
    await db
      .update(vehicles)
      .set({
        make: v.make,
        model: v.model,
        trim: v.trim,
        year: v.year,
        vin: v.vin || null,
        chassisNo: v.chassisNo || null,
        stockNumber: v.stockNumber,
        condition: v.condition,
        mileage: v.mileage,
        transmission: v.transmission,
        fuelType: v.fuelType,
        drivetrain: v.drivetrain,
        engine: v.engine,
        exteriorColor: v.exteriorColor,
        interiorColor: v.interiorColor,
        bodyStyle: v.bodyStyle,
        priceMinor:
          v.price != null ? fromMajor(v.price, market.currency).minor : null,
        headline: v.headline,
        description: v.description,
        historyReportUrl: v.historyReportUrl || null,
        status: v.status,
        isFeatured: Boolean(v.isFeatured),
        features: parseFeatures(v.featuresText),
        slug,
        publishedAt:
          v.status === "available" && !before.publishedAt
            ? new Date()
            : before.publishedAt,
        soldAt: v.status === "sold" ? (before.soldAt ?? new Date()) : null,
      })
      .where(eq(vehicles.id, id));
  } catch (e) {
    return { ok: false, error: friendlyDbError(e) };
  }

  // Record only what changed — an audit trail of full row dumps is unreadable.
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (before.status !== v.status)
    changes.status = { from: before.status, to: v.status };
  if (before.priceMinor !== (v.price != null ? fromMajor(v.price, market.currency).minor : null))
    changes.price = { from: before.priceMinor, to: v.price };
  if (before.slug !== slug) changes.slug = { from: before.slug, to: slug };

  await audit(user, id, "update", changes);
  revalidatePath("/admin/vehicles");
  revalidatePath(`/${v.marketCode}/inventory`);
  revalidatePath(`/${v.marketCode}/inventory/${slug}`);

  return { ok: true };
}

export async function uploadVehiclePhoto(formData: FormData): Promise<ActionResult> {
  const user = await requireStaff();
  const vehicleId = String(formData.get("vehicleId") ?? "");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file selected." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: "Image must be 10 MB or smaller." };
  }

  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.id, vehicleId));
  if (!vehicle) return { ok: false, error: "Vehicle not found." };
  assertMarketAccess(user, vehicle.marketCode);

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const key = `${vehicleId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(VEHICLE_BUCKET)
    .upload(key, file, { contentType: file.type, upsert: false });

  if (error) return { ok: false, error: `Upload failed: ${error.message}` };

  // First photo becomes primary. The database enforces at most one, so this
  // cannot produce two even if two uploads race.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vehicleMedia)
    .where(eq(vehicleMedia.vehicleId, vehicleId));

  await db.insert(vehicleMedia).values({
    vehicleId,
    storageKey: key,
    alt: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    position: count,
    isPrimary: count === 0,
  });

  await audit(user, vehicleId, "photo_added", { key });
  revalidatePath(`/admin/vehicles/${vehicleId}`);
  revalidatePath(`/${vehicle.marketCode}/inventory`);
  return { ok: true };
}

export async function deleteVehiclePhoto(formData: FormData): Promise<ActionResult> {
  const user = await requireStaff();
  const mediaId = String(formData.get("mediaId") ?? "");

  const [media] = await db
    .select()
    .from(vehicleMedia)
    .where(eq(vehicleMedia.id, mediaId));
  if (!media) return { ok: false, error: "Photo not found." };

  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.id, media.vehicleId));
  if (vehicle) assertMarketAccess(user, vehicle.marketCode);

  await supabaseAdmin.storage.from(VEHICLE_BUCKET).remove([media.storageKey]);
  await db.delete(vehicleMedia).where(eq(vehicleMedia.id, mediaId));

  // Promote another photo so the listing does not lose its primary image.
  if (media.isPrimary) {
    const [next] = await db
      .select()
      .from(vehicleMedia)
      .where(eq(vehicleMedia.vehicleId, media.vehicleId))
      .limit(1);
    if (next) {
      await db
        .update(vehicleMedia)
        .set({ isPrimary: true })
        .where(eq(vehicleMedia.id, next.id));
    }
  }

  await audit(user, media.vehicleId, "photo_removed", { key: media.storageKey });
  revalidatePath(`/admin/vehicles/${media.vehicleId}`);
  return { ok: true };
}

/** Turns constraint violations into something a salesperson can act on. */
function friendlyDbError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);

  if (msg.includes("vehicles_vin_unique_idx"))
    return "That VIN is already on another listing.";
  if (msg.includes("vehicles_identity_matches_market"))
    return "US listings require a valid 17-character VIN; Nigerian listings require a chassis number.";
  if (msg.includes("vehicles_currency_matches_market"))
    return "Currency does not match the market. This is a bug — please report it.";
  if (msg.includes("vehicles_available_requires_price"))
    return "A vehicle cannot be published without a price.";
  if (msg.includes("vehicles_market_slug_idx"))
    return "Another vehicle in this market already uses that name.";

  return `Could not save: ${msg}`;
}

/* ── useActionState wrappers ───────────────────────────────────────────────
   The photo actions are called from client components via useActionState,
   which passes the previous state as the first argument. */

export async function uploadVehiclePhotoAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return uploadVehiclePhoto(formData);
}

export async function deleteVehiclePhotoAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return deleteVehiclePhoto(formData);
}

/**
 * Permanently removes a vehicle, but only when nothing depends on it.
 *
 * A vehicle that has been sold, part-exchanged or hired is part of the
 * business's history: a deal references it, and so may a rental booking. The
 * database refuses those deletes outright — both foreign keys are NO ACTION,
 * deliberately — so this checks first and explains, rather than letting a
 * constraint violation surface as an unreadable error.
 *
 * Where a record exists, the honest operation is to unlist rather than delete.
 * The listing disappears from the public site and the paperwork still points
 * at something real.
 *
 * Photographs are removed from storage before the row goes. Doing it the other
 * way round loses the storage keys and leaves files nobody can find or bill
 * for.
 */
export async function deleteVehicle(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Nothing to delete." };

  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, id));
  if (!vehicle) return { ok: false, error: "Vehicle not found." };
  assertMarketAccess(user, vehicle.marketCode);

  const [[dealCount], [bookingCount]] = await Promise.all([
    db.select({ n: count() }).from(deals).where(eq(deals.vehicleId, id)),
    db.select({ n: count() }).from(rentalBookings).where(eq(rentalBookings.vehicleId, id)),
  ]);

  const blockers: string[] = [];
  if (Number(dealCount.n) > 0) {
    blockers.push(`${dealCount.n} deal${Number(dealCount.n) === 1 ? "" : "s"}`);
  }
  if (Number(bookingCount.n) > 0) {
    blockers.push(
      `${bookingCount.n} rental booking${Number(bookingCount.n) === 1 ? "" : "s"}`,
    );
  }

  if (blockers.length > 0) {
    return {
      ok: false,
      error:
        `This vehicle is attached to ${blockers.join(" and ")}, so deleting it ` +
        `would break that record. Set its status to Unlisted instead — it ` +
        `disappears from the website and the paperwork still makes sense.`,
    };
  }

  const media = await db
    .select()
    .from(vehicleMedia)
    .where(eq(vehicleMedia.vehicleId, id));

  if (media.length > 0) {
    await supabaseAdmin.storage
      .from(VEHICLE_BUCKET)
      .remove(media.map((m) => m.storageKey));
  }

  // Written before the row goes, so the record of what was removed survives
  // the removal.
  await db.insert(auditLog).values({
    actorId: user.id,
    actorEmail: user.email,
    entity: "vehicle",
    entityId: id,
    action: "delete",
    diff: {
      vehicle: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      vin: vehicle.vin,
      stockNumber: vehicle.stockNumber,
      photosRemoved: media.length,
    } as never,
  });

  // vehicle_media and rental_rates cascade; leads, appointments and finance
  // applications null their reference and survive.
  await db.delete(vehicles).where(eq(vehicles.id, id));

  revalidatePath("/admin/vehicles");
  revalidatePath(`/${vehicle.marketCode}/inventory`);
  revalidatePath(`/${vehicle.marketCode}`);
  return { ok: true };
}
