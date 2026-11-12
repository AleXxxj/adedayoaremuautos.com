"use server";

import { decodeVin } from "@/lib/vin/nhtsa";
import { spendLookup } from "@/lib/vin/usage";
import { isStaffSession, reserveCall, runEstimate } from "@/lib/vin/valueEstimate";
import type { ValueResult } from "@/components/valueSteps";

/**
 * "What's my car worth?": one dealer-price estimate from MarketCheck.
 *
 * Open to visitors only when MARKETCHECK_API_KEY is set and
 * VALUE_CHECK_PUBLIC is "1"; with the key alone, to signed-in staff. This is
 * an endpoint of its own, so every rule is checked here, whatever the page
 * showed: the switches, the visitor's daily lookups, NHTSA's decode of the
 * VIN and the month's cap on calls (src/lib/vin/valueEstimate.ts).
 *
 * The VIN arrives in the POST body and goes to MarketCheck with the miles
 * and the ZIP, and nothing else: nothing about the visitor. It is never put
 * in a URL the browser sees or in a log. What MarketCheck answers is
 * returned to the page that asked and stored nowhere.
 */
export async function estimateValue(
  _prev: ValueResult | null,
  formData: FormData,
): Promise<ValueResult> {
  return runEstimate(
    {
      vin: String(formData.get("vin") ?? ""),
      miles: String(formData.get("miles") ?? ""),
      zip: String(formData.get("zip") ?? ""),
    },
    {
      env: process.env,
      isStaff: isStaffSession,
      spend: () => spendLookup(),
      decode: decodeVin,
      reserve: (cap) => reserveCall(cap),
      now: () => new Date(),
    },
  );
}
