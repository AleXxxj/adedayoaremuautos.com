"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rentalBookings } from "@/db/schema";
import { requireStaff, assertMarketAccess } from "@/lib/auth";
import { signedLicenceUrl } from "@/lib/licence";

export interface LicenceViewResult {
  ok: boolean;
  url?: string;
  error?: string;
}

/**
 * Mints a short-lived link to a renter's licence or insurance certificate.
 *
 * Generated on demand rather than rendered into the page. A signed URL is a
 * bearer token for somebody's identity document — anyone holding it can open
 * the file — so it should not sit in the HTML of a screen that might be left
 * open on a shared counter, or in a page somebody screenshots.
 *
 * Both documents go through here. An insurance certificate carries a name, a
 * policy number and often an address, so there is no case for treating it
 * more loosely than the licence.
 */
export async function viewLicence(
  _prev: LicenceViewResult | null,
  formData: FormData,
): Promise<LicenceViewResult> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const kind = formData.get("kind") === "insurance" ? "insurance" : "licence";
  if (!id) return { ok: false, error: "Nothing to open." };

  const [booking] = await db
    .select()
    .from(rentalBookings)
    .where(eq(rentalBookings.id, id))
    .limit(1);

  if (!booking) return { ok: false, error: "That booking no longer exists." };
  assertMarketAccess(user, booking.marketCode);

  const key =
    kind === "insurance"
      ? booking.insuranceStorageKey
      : booking.licenceStorageKey;

  if (!key) {
    return {
      ok: false,
      error:
        kind === "insurance"
          ? "No proof of insurance was uploaded for this booking."
          : "No licence was uploaded for this booking.",
    };
  }

  const url = await signedLicenceUrl(key);
  if (!url) return { ok: false, error: "Could not open that file." };

  // Logged by name. Opening somebody's identity document is an act worth
  // being able to attribute afterwards.
  console.log(`[licence] ${user.email} opened the ${kind} on booking ${id}`);

  return { ok: true, url };
}
