"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { leads, vehicles, rentalTiers } from "@/db/schema";
import { isMarketCode } from "@/lib/market";
import { intakeLead } from "@/lib/leadIntake";

export interface LeadResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

const LEAD_TYPES = [
  "contact",
  "test_drive",
  "finance",
  "trade_in",
  "rental",
  "rent_to_own",
  "referral",
] as const;

const schema = z
  .object({
    marketCode: z.enum(["us", "ng"]),
    type: z.enum(LEAD_TYPES, { message: "Choose what you are interested in" }),
    name: z.string().trim().min(2, "Please enter your name").max(120),
    email: z.string().trim().email("That email does not look right").optional().or(z.literal("")),
    phone: z.string().trim().min(7, "Please enter a reachable phone number").max(40),
    message: z.string().trim().max(4000).optional(),
    preferredContact: z
      .enum(["phone", "whatsapp", "email"], { message: "Choose how we should reply" })
      .optional(),
    vehicleSlug: z.string().trim().max(120).optional(),
    /** Which rent-to-own category is being applied for. */
    tierSlug: z.string().trim().max(80).optional(),
    // Anti-spam. Not user-facing.
    // The honeypot is "leave_empty": any value means a bot, answered as if it
    // worked. "website" (the old name, which browsers autofill) is ignored.
    website: z.string().optional(),
    leave_empty: z.string().optional(),
    // How long the form was on screen, by the phone's own clock (useFormTimer).
    // Pages opened before it existed send none and are not timed.
    elapsedMs: z.coerce.number().int().min(0).optional(),
  })
  .refine((v) => v.preferredContact !== "email" || Boolean(v.email), {
    message: "Add an email address, or choose phone or WhatsApp instead.",
    path: ["email"],
  });

export async function submitLead(
  _prev: LeadResult | null,
  formData: FormData,
): Promise<LeadResult> {
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

  const v = parsed.data;

  // The bot checks, the per-phone limit, who introduced them, the row and
  // the alert are shared with the sell page (lib/leadIntake.ts). The lookups
  // below run only once those checks have passed.
  const outcome = await intakeLead(
    {
      marketCode: v.marketCode,
      phone: v.phone,
      leaveEmpty: v.leave_empty,
      elapsedMs: v.elapsedMs,
      raw,
    },
    async () => {
      // ── Resolve the vehicle, if any ─────────────────────────────────────
      let vehicleId: string | null = null;
      let vehicleLabel: string | null = null;
      if (v.vehicleSlug && isMarketCode(v.marketCode)) {
        const [vehicle] = await db
          .select()
          .from(vehicles)
          .where(
            and(eq(vehicles.marketCode, v.marketCode), eq(vehicles.slug, v.vehicleSlug)),
          )
          .limit(1);
        if (vehicle) {
          vehicleId = vehicle.id;
          vehicleLabel = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
        }
      }

      // ── Resolve the rent-to-own category, if any ────────────────────────
      // Recorded alongside the vehicle rather than inferred from it later:
      // these are the rates the applicant was actually shown, and a car can be
      // moved to another category or sold after the application is made.
      let rentalTierId: string | null = null;
      let tierName: string | null = null;
      if (v.tierSlug && isMarketCode(v.marketCode)) {
        const [tier] = await db
          .select({ id: rentalTiers.id, name: rentalTiers.name })
          .from(rentalTiers)
          .where(
            and(
              eq(rentalTiers.marketCode, v.marketCode),
              eq(rentalTiers.slug, v.tierSlug),
            ),
          )
          .limit(1);
        if (tier) {
          rentalTierId = tier.id;
          tierName = tier.name;
        }
      }

      return {
        type: v.type,
        source: "website",
        name: v.name,
        email: v.email,
        message: v.message,
        preferredContact: v.preferredContact,
        vehicleId,
        rentalTierId,
        vehicleLabel: tierName
          ? `${vehicleLabel ?? "No vehicle chosen"} — ${tierName} rent to own`
          : vehicleLabel,
      };
    },
  );

  switch (outcome.status) {
    case "saved":
    case "bot":
      return { ok: true };
    case "busy":
      return {
        ok: false,
        error:
          "We have already received several inquiries from this number. Please call us directly and we will help right away.",
      };
    case "failed":
      return {
        ok: false,
        error:
          "Something went wrong saving your inquiry. Please call us on (336) 207-6521 and we will help immediately.",
      };
  }
}

/* ── Admin ─────────────────────────────────────────────────────────────── */

export async function updateLeadStatus(
  _prev: LeadResult | null,
  formData: FormData,
): Promise<LeadResult> {
  const { requireStaff, assertMarketAccess } = await import("@/lib/auth");
  const user = await requireStaff();

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");

  const allowed = ["new", "contacted", "qualified", "won", "lost"];
  if (!id || !allowed.includes(status)) {
    return { ok: false, error: "Invalid status change." };
  }

  const [before] = await db.select().from(leads).where(eq(leads.id, id));
  if (!before) return { ok: false, error: "Lead not found." };
  // Staff limited to one market can see only that market's leads, so they
  // must not be able to change another market's by sending its id directly.
  assertMarketAccess(user, before.marketCode);

  await db
    .update(leads)
    .set({
      status: status as (typeof allowed)[number] as never,
      // Stamped the first time a lead leaves 'new'. Response time is the
      // metric that predicts close rate, so it is recorded automatically
      // rather than depending on anyone remembering to log it.
      firstResponseAt:
        before.firstResponseAt ?? (status !== "new" ? new Date() : null),
      closedAt:
        status === "won" || status === "lost"
          ? (before.closedAt ?? new Date())
          : null,
    })
    .where(eq(leads.id, id));

  revalidatePath("/admin/leads");
  return { ok: true };
}
