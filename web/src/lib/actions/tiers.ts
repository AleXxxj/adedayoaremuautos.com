"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { rentalTiers } from "@/db/schema";
import { requireStaff, assertMarketAccess } from "@/lib/auth";
import { MARKETS } from "@/lib/market";
import { fromMajor } from "@/lib/money";

export interface TierResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

/** Blank optional money fields arrive as "" and mean "not offered". */
const optionalMoney = z
  .union([z.literal(""), z.coerce.number().positive("Must be more than zero")])
  .transform((v) => (v === "" ? null : v))
  .optional()
  .nullable();

const schema = z
  .object({
    id: z.string().uuid().optional().or(z.literal("")),
    marketCode: z.enum(["us", "ng"]),
    name: z.string().trim().min(2, "Give the category a name").max(60),
    tagline: z.string().trim().max(160).optional().or(z.literal("")),
    position: z.coerce.number().int().min(0).max(99),
    daily: z.coerce.number().positive("A daily rate is required"),
    weekly: optionalMoney,
    monthly: optionalMoney,
    ownershipThreshold: optionalMoney,
    deposit: z.coerce.number().min(0, "Cannot be negative"),
    isActive: z.coerce.boolean().optional(),
  })
  /**
   * These two mirror the database constraints exactly.
   *
   * The database is the guarantee — it refuses bad pricing whatever writes to
   * it — but a raw constraint violation is an unreadable Postgres string. The
   * same rule stated here turns it into a sentence pointing at the field.
   */
  .refine((v) => v.weekly == null || v.weekly <= v.daily * 7, {
    message: "A week must not cost more than seven separate days, or nobody would book it",
    path: ["weekly"],
  })
  .refine((v) => v.monthly == null || v.weekly == null || v.monthly <= v.weekly * 4, {
    message: "A month must not cost more than four weeks",
    path: ["monthly"],
  });

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/**
 * Creates or updates a rent-to-own category.
 *
 * Amounts arrive in whole currency units, because that is how the owner thinks
 * about them — "forty dollars a day" — and are converted to minor units on the
 * way in. Nothing downstream ever sees a decimal.
 */
export async function saveTier(
  _prev: TierResult | null,
  formData: FormData,
): Promise<TierResult> {
  const user = await requireStaff();

  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const v = parsed.data;
  assertMarketAccess(user, v.marketCode);

  const currency = MARKETS[v.marketCode].currency;
  const minor = (major: number) => fromMajor(major, currency).minor;

  const values = {
    marketCode: v.marketCode,
    name: v.name,
    slug: slugify(v.name),
    tagline: v.tagline || null,
    position: v.position,
    dailyMinor: minor(v.daily),
    weeklyMinor: v.weekly == null ? null : minor(v.weekly),
    monthlyMinor: v.monthly == null ? null : minor(v.monthly),
    ownershipThresholdMinor:
      v.ownershipThreshold == null ? null : minor(v.ownershipThreshold),
    depositMinor: minor(v.deposit),
    currency,
    isActive: v.isActive ?? false,
  };

  try {
    if (v.id) {
      await db.update(rentalTiers).set(values).where(eq(rentalTiers.id, v.id));
    } else {
      await db.insert(rentalTiers).values(values);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // The unique index is on (market, slug), and the slug comes from the name.
    if (message.includes("rental_tiers_market_slug_unique")) {
      return {
        ok: false,
        fieldErrors: { name: ["A category with this name already exists in this market"] },
      };
    }
    if (message.includes("rental_tiers_longer_is_cheaper")) {
      return { ok: false, error: "A longer hire must never cost more than the shorter one." };
    }
    if (message.includes("rental_tiers_prices_positive")) {
      return { ok: false, error: "Rates must be more than zero." };
    }
    console.error("[tiers] save failed", e);
    return { ok: false, error: "Could not save that. Please try again." };
  }

  revalidatePath("/admin/tiers");
  revalidatePath(`/${v.marketCode}/rent-to-own`);
  revalidatePath(`/${v.marketCode}`);
  return { ok: true };
}

/**
 * Retires a category.
 *
 * Deactivates rather than deletes: a tier may already be referenced by a
 * vehicle and by whatever a customer has been quoted, and removing the row
 * would rewrite history. An inactive tier disappears from the public site and
 * stays available to anything that points at it.
 */
export async function retireTier(
  _prev: TierResult | null,
  formData: FormData,
): Promise<TierResult> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const market = String(formData.get("marketCode") ?? "");
  if (!id || (market !== "us" && market !== "ng")) {
    return { ok: false, error: "Nothing to do." };
  }
  assertMarketAccess(user, market);

  await db
    .update(rentalTiers)
    .set({ isActive: false })
    .where(and(eq(rentalTiers.id, id), eq(rentalTiers.marketCode, market)));

  revalidatePath("/admin/tiers");
  revalidatePath(`/${market}/rent-to-own`);
  return { ok: true };
}
