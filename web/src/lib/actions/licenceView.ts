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
 * Mints a short-lived link to a renter's licence.
 *
 * Generated on demand rather than rendered into the page. A signed URL is a
 * bearer token for somebody's identity document — anyone holding it can open
 * the file — so it should not sit in the HTML of a screen that might be left
 * open on a shared counter, or in a page somebody screenshots.
 */
export async function viewLicence(
  _prev: LicenceViewResult | null,
  formData: FormData,
): Promise<LicenceViewResult> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Nothing to open." };

  const [booking] = await db
    .select()
    .from(rentalBookings)
    .where(eq(rentalBookings.id, id))
    .limit(1);

  if (!booking) return { ok: false, error: "That booking no longer exists." };
  assertMarketAccess(user, booking.marketCode);

  if (!booking.licenceStorageKey) {
    return { ok: false, error: "No licence was uploaded for this booking." };
  }

  const url = await signedLicenceUrl(booking.licenceStorageKey);
  if (!url) return { ok: false, error: "Could not open that file." };

  console.log(
    `[licence] ${user.email} opened the licence on booking ${id}`,
  );

  return { ok: true, url };
}
