"use server";

import { randomUUID } from "node:crypto";
import { intakeLead } from "@/lib/leadIntake";
import { cleanForm, parseSellRequest, sellLead } from "@/lib/sellRequest";
import { sellReference } from "@/components/sellSteps";

export interface SellResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** "S-4F2A": shown on the confirmation, and on the staff's copy of the request. */
  reference?: string;
}

/**
 * "Sell your car": an owner asks us to look at their car and make an offer.
 *
 * Filed as a trade_in lead, so it reaches the same inbox and the same alerts
 * as every other form, with the answers written out one per line in the
 * message (components/sellSteps.ts, composeSellMessage). There is no price
 * here: nobody is quoted anything until someone has seen the car.
 *
 * The VIN, when the owner gives one, is stored in that message: they are
 * asking us to buy that car. It travels only in this POST's body. It is never
 * put in a URL or a log line, and the staff alert's subject names the car,
 * not its VIN.
 */
export async function submitSellRequest(
  _prev: SellResult | null,
  formData: FormData,
): Promise<SellResult> {
  const raw = cleanForm(formData);
  const parsed = parseSellRequest(raw);
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };
  const v = parsed.data;

  // Chosen here rather than by the database, so the reference the owner is
  // given is also the first line of what staff read.
  const id = randomUUID();
  const reference = sellReference(id);

  const outcome = await intakeLead(
    {
      marketCode: v.marketCode,
      phone: v.phone,
      leaveEmpty: v.leave_empty,
      elapsedMs: v.elapsedMs,
      raw,
    },
    async () => sellLead(v, id),
  );

  switch (outcome.status) {
    case "saved":
      return { ok: true, reference };
    case "bot":
      // No reference: a person mistaken for a bot is offered a call instead.
      return { ok: true };
    case "busy":
      return {
        ok: false,
        error: "We already have several requests from this number. Please call us and we'll help right away.",
      };
    case "failed":
      return {
        ok: false,
        error: "We couldn't save your car's details. Please try again, or call us.",
      };
  }
}
