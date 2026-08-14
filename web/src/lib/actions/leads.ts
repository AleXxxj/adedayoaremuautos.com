"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads, vehicles } from "@/db/schema";
import { isMarketCode } from "@/lib/market";
import { notifyStaffOfLead } from "@/lib/notify";

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
] as const;

const schema = z
  .object({
    marketCode: z.enum(["us", "ng"]),
    type: z.enum(LEAD_TYPES),
    name: z.string().trim().min(2, "Please enter your name").max(120),
    email: z.string().trim().email("That email does not look right").optional().or(z.literal("")),
    phone: z.string().trim().min(7, "Please enter a reachable phone number").max(40),
    message: z.string().trim().max(4000).optional(),
    preferredContact: z.enum(["phone", "whatsapp", "email"]).optional(),
    vehicleSlug: z.string().trim().max(120).optional(),
    // Anti-spam. Not user-facing.
    website: z.string().max(0, "Rejected").optional(),
    renderedAt: z.coerce.number().optional(),
  })
  .refine((v) => v.preferredContact !== "email" || Boolean(v.email), {
    message: "Add an email address, or choose phone or WhatsApp instead.",
    path: ["email"],
  });

/** Lower bound on how fast a human can plausibly fill this in. */
const MIN_FILL_MS = 1500;
/** Per-phone submission cap inside the window below. */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

export async function submitLead(
  _prev: LeadResult | null,
  formData: FormData,
): Promise<LeadResult> {
  const raw = Object.fromEntries(formData.entries());
  const cleaned = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v === "" && k !== "website" ? undefined : v]),
  );

  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const v = parsed.data;

  // ── Anti-spam ───────────────────────────────────────────────────────────
  // Honeypot: a field hidden from humans. Anything in it is a bot. Fail
  // silently with a success response so the bot does not learn it was caught.
  if (v.website) return { ok: true };

  if (v.renderedAt && Date.now() - v.renderedAt < MIN_FILL_MS) {
    return { ok: true };
  }

  const h = await headers();
  const ipCountry =
    h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? null;

  // ── Rate limit ──────────────────────────────────────────────────────────
  // Keyed on phone number rather than IP: shared mobile NAT in Nigeria means
  // many genuine customers can appear behind one address, and blocking by IP
  // would silently drop real leads.
  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const [{ recent }] = await db
    .select({ recent: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(eq(leads.phone, v.phone), gte(leads.createdAt, since)));

  if (recent >= RATE_LIMIT) {
    return {
      ok: false,
      error:
        "We have already received several enquiries from this number. Please call us directly and we will help right away.",
    };
  }

  // ── Resolve the vehicle, if any ─────────────────────────────────────────
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

  // ── Persist FIRST, notify after ─────────────────────────────────────────
  // The database write is the commitment to the customer. Notification is best
  // effort on top of it and can never cost us the lead.
  let leadId: string;
  try {
    const [row] = await db
      .insert(leads)
      .values({
        marketCode: v.marketCode,
        type: v.type,
        status: "new",
        vehicleId,
        name: v.name,
        email: v.email || null,
        phone: v.phone,
        message: v.message,
        preferredContact: v.preferredContact,
        source: "website",
        utmSource: String(raw.utm_source ?? "") || null,
        utmMedium: String(raw.utm_medium ?? "") || null,
        utmCampaign: String(raw.utm_campaign ?? "") || null,
        referrerUrl: h.get("referer"),
        landingPath: String(raw.landingPath ?? "") || null,
        ipCountry,
      })
      .returning({ id: leads.id });
    leadId = row.id;
  } catch (e) {
    console.error("[lead] insert failed", e);
    return {
      ok: false,
      error:
        "Something went wrong saving your enquiry. Please call us on (336) 207-6521 and we will help immediately.",
    };
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  try {
    await notifyStaffOfLead({
      leadId,
      type: v.type,
      market: v.marketCode,
      name: v.name,
      email: v.email,
      phone: v.phone,
      message: v.message,
      vehicle: vehicleLabel,
      adminUrl: `${site}/admin/leads`,
    });
  } catch (e) {
    // Swallowed deliberately. The lead is safe; alerting is not.
    console.error("[lead] notification failed", e);
  }

  revalidatePath("/admin/leads");
  return { ok: true };
}

/* ── Admin ─────────────────────────────────────────────────────────────── */

export async function updateLeadStatus(
  _prev: LeadResult | null,
  formData: FormData,
): Promise<LeadResult> {
  const { requireStaff } = await import("@/lib/auth");
  await requireStaff();

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");

  const allowed = ["new", "contacted", "qualified", "won", "lost"];
  if (!id || !allowed.includes(status)) {
    return { ok: false, error: "Invalid status change." };
  }

  const [before] = await db.select().from(leads).where(eq(leads.id, id));
  if (!before) return { ok: false, error: "Lead not found." };

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
