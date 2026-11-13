"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MARKETS, isMarketCode } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import { notifyStaffOfLead } from "@/lib/notify";
import { extensionsEnabled } from "@/lib/extensions/pricing";
import {
  decideExtension,
  fileExtensionRequest,
  findExtensionRequest,
} from "@/lib/extensions/store";

export interface ExtensionResult {
  ok: boolean;
  error?: string;
  /** Shown as the confirmation toast. */
  message?: string;
}

const askSchema = z.object({
  token: z.string().min(20).max(200),
  marketCode: z.enum(["us", "ng"]),
  addedDays: z.coerce.number().int().min(1).max(366),
});

/**
 * The renter taps "Ask to keep it".
 *
 * Public, and guarded by the same private token as the page it is on. It
 * files a request and tells staff. It holds no dates and charges nothing:
 * staff approve, and the database's no-overlap constraint has the last word
 * on whether the days are free.
 */
export async function requestExtension(
  _prev: ExtensionResult | null,
  formData: FormData,
): Promise<ExtensionResult> {
  if (!extensionsEnabled()) {
    return { ok: false, error: "Extra days can't be requested online right now. Please call us." };
  }
  const parsed = askSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success || !isMarketCode(parsed.data.marketCode)) {
    return { ok: false, error: "Could not read that request." };
  }
  const q = parsed.data;

  let filed;
  try {
    filed = await fileExtensionRequest(q);
  } catch (e) {
    console.error("[extensions] request failed", e);
    return { ok: false, error: "Something went wrong. Please call us and we will sort it out." };
  }
  if (!filed.ok || !filed.request || !filed.booking) {
    return { ok: false, error: filed.error ?? "Could not send that request." };
  }

  // Staff hear about it through the same alert every other request uses.
  // After the reply, and never allowed to undo the request.
  const { booking: b, request: r, vehicle } = filed;
  const market = MARKETS[q.marketCode];
  const added = formatMoney(money(r.addedMinor, b.currency), market.locale);
  after(() =>
    notifyStaffOfLead({
      leadId: b.id,
      type: "rental",
      market: q.marketCode,
      name: b.customerName,
      email: b.customerEmail,
      phone: b.customerPhone,
      message:
        `Wants to keep the car ${r.addedDays} more day${r.addedDays === 1 ? "" : "s"}, ` +
        `until ${r.newEnd} (+${added}). Approve or decline in Rentals.`,
      vehicle: vehicle ?? null,
      adminUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/admin/rentals`,
    }).catch((e) => console.error("[extensions] staff alert failed", e)),
  );

  revalidatePath("/admin/rentals");
  return { ok: true, message: "Sent. We will confirm soon." };
}

const decideSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approve", "decline"]),
});

/** Staff approve or decline, one tap each. */
export async function decideExtensionRequest(
  _prev: ExtensionResult | null,
  formData: FormData,
): Promise<ExtensionResult> {
  const { requireStaff, assertMarketAccess } = await import("@/lib/auth");
  const user = await requireStaff();

  const parsed = decideSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Could not read that request." };

  const request = await findExtensionRequest(parsed.data.id);
  if (!request) return { ok: false, error: "Request not found." };
  assertMarketAccess(user, request.marketCode);

  const done = await decideExtension({
    id: parsed.data.id,
    decision: parsed.data.decision,
    staffEmail: user.email,
  });
  if (!done.ok) return { ok: false, error: done.error };

  console.log(
    `[extensions] ${user.email} ${parsed.data.decision === "approve" ? "approved" : "declined"} request ${parsed.data.id}`,
  );
  revalidatePath("/admin/rentals");
  revalidatePath(`/admin/rentals/${request.bookingId}/agreement`);
  // The vehicle's public page lists taken dates.
  if (parsed.data.decision === "approve") revalidatePath("/[market]/rentals/[slug]", "page");
  return {
    ok: true,
    message: parsed.data.decision === "approve" ? "Extended." : "Declined.",
  };
}
