import "server-only";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import type { MarketCode } from "@/lib/market";
import { notifyStaffOfLead, type LeadNotification } from "@/lib/notify";
import { resolveReferralPartner } from "@/lib/partner";

/**
 * What every public lead form does once its own fields have been checked:
 * the bot checks, the per-phone limit, who introduced them, the row, and
 * the alert to staff.
 *
 * Shared by the contact form (submitLead) and the sell page
 * (submitSellRequest), so the two can't drift apart. Not a server action
 * itself: an export from a "use server" file is an endpoint anyone can call
 * with anything, and this one writes whatever it is handed.
 */

/** Lower bound on how fast a human can plausibly fill this in. */
export const MIN_FILL_MS = 1500;
/** Per-phone submission cap inside the window below. */
export const RATE_LIMIT = 5;
export const RATE_WINDOW_MS = 60 * 60 * 1000;

export interface IntakeForm {
  marketCode: MarketCode;
  /** As the form sent it, trimmed: the limit counts this exact number. */
  phone: string;
  /** The hidden field only a bot fills in ("leave_empty"). */
  leaveEmpty?: string;
  /** How long the form was on screen, by the phone's own clock (useFormTimer). */
  elapsedMs?: number;
  /** The form as sent, for the attribution fields: utm_source, utm_medium, utm_campaign, landingPath. */
  raw: Record<string, unknown>;
}

export interface LeadDraft {
  /** Chosen by the caller when it needs the id before the row exists (the sell page's reference). */
  id?: string;
  type: (typeof leads.$inferInsert)["type"];
  source: string;
  name: string;
  email?: string;
  message?: string;
  preferredContact?: string;
  vehicleId?: string | null;
  rentalTierId?: string | null;
  /** How the staff alert names the car. Never a VIN: it is in the alert's subject. */
  vehicleLabel?: string | null;
}

export type IntakeResult =
  | { status: "saved"; leadId: string }
  /** Answered as if it worked, so the bot learns nothing. Nothing is saved. */
  | { status: "bot" }
  /** Over the per-phone limit. */
  | { status: "busy" }
  /** The row could not be written. Nothing was sent to staff. */
  | { status: "failed" };

/** What only exists inside a request, handed in by scripts/verify-sell.ts. */
export interface IntakeTest {
  database: typeof db;
  headers: Headers;
  referralPartnerId: string | null;
  notify: (lead: LeadNotification) => Promise<unknown>;
}

/**
 * Files a lead. `draft` builds the row once the bot checks and the limit
 * have passed, so a caller's own lookups (the contact form's vehicle and
 * rent-to-own category) are never run for a bot or a number over its limit.
 */
export async function intakeLead(
  form: IntakeForm,
  draft: () => Promise<LeadDraft>,
  test?: IntakeTest,
): Promise<IntakeResult> {
  const database = test?.database ?? db;

  // ── Anti-spam ───────────────────────────────────────────────────────────
  // Honeypot: a field hidden from humans. Anything in it is a bot. Fail
  // silently with a success response so the bot does not learn it was caught.
  if (form.leaveEmpty) return { status: "bot" };
  if (form.elapsedMs !== undefined && form.elapsedMs < MIN_FILL_MS) return { status: "bot" };

  const h = test?.headers ?? (await headers());
  const ipCountry = h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? null;

  // ── Rate limit ──────────────────────────────────────────────────────────
  // Keyed on phone number rather than IP: shared mobile NAT in Nigeria means
  // many genuine customers can appear behind one address, and blocking by IP
  // would silently drop real leads.
  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const [{ recent }] = await database
    .select({ recent: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(eq(leads.phone, form.phone), gte(leads.createdAt, since)));
  if (recent >= RATE_LIMIT) return { status: "busy" };

  const d = await draft();

  // ── Who introduced them ─────────────────────────────────────────────────
  // Set by /r/<code> when a partner's link was followed. Looked up rather than
  // trusted: the cookie holds a code, and only an active partner earns the
  // attribution. An unknown or suspended code simply attributes to nobody.
  const referralPartnerId = test ? test.referralPartnerId : await resolveReferralPartner(form.marketCode);

  // ── Persist FIRST, notify after ─────────────────────────────────────────
  // The database write is the commitment to the customer. Notification is best
  // effort on top of it and can never cost us the lead.
  const raw = form.raw;
  let leadId: string;
  try {
    const [row] = await database
      .insert(leads)
      .values({
        ...(d.id ? { id: d.id } : {}),
        marketCode: form.marketCode,
        type: d.type,
        status: "new",
        vehicleId: d.vehicleId ?? null,
        rentalTierId: d.rentalTierId ?? null,
        referralPartnerId,
        name: d.name,
        email: d.email || null,
        phone: form.phone,
        message: d.message,
        preferredContact: d.preferredContact,
        source: d.source,
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
    console.error("[lead] insert failed:", whatFailed(e));
    return { status: "failed" };
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  try {
    await (test?.notify ?? notifyStaffOfLead)({
      leadId,
      type: d.type,
      market: form.marketCode,
      name: d.name,
      email: d.email,
      phone: form.phone,
      message: d.message,
      vehicle: d.vehicleLabel ?? null,
      adminUrl: `${site}/admin/leads`,
    });
  } catch (e) {
    // Swallowed deliberately. The lead is safe; alerting is not.
    console.error("[lead] notification failed", e);
  }

  if (!test) revalidatePath("/admin/leads");
  return { status: "saved", leadId };
}

/**
 * Why a write failed, without what was written.
 *
 * Drizzle's own message is the whole query with every value sent ("Failed
 * query: insert into … params: …"): the customer's name, phone and message,
 * and on a sell request the car's VIN. The driver's error underneath says
 * what went wrong ("invalid byte sequence", "connect ETIMEDOUT") without them.
 */
export function whatFailed(e: unknown): string {
  const inner = e instanceof Error && e.cause instanceof Error ? e.cause : e;
  if (!(inner instanceof Error)) return "unknown error";
  if (/^Failed query/i.test(inner.message)) return inner.name;
  const code = (inner as { code?: unknown }).code;
  return [inner.name, typeof code === "string" ? code : null, inner.message.slice(0, 200)]
    .filter(Boolean)
    .join(" ");
}
