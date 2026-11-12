import { z } from "zod";
import type { MarketCode } from "@/lib/market";
import type { LeadDraft } from "@/lib/leadIntake";
import { checkVin } from "@/lib/vin/validate";
import { digitCount } from "@/components/rentalBookingSteps";
import {
  ACCIDENT,
  CONDITIONS,
  KEYS,
  LIGHTS,
  MAX_LOCATION,
  MAX_MAKE,
  MAX_MODEL,
  MAX_NAME,
  MAX_NOTES,
  MAX_PHONE,
  SELL_SOURCE,
  WANTS,
  carName,
  composeSellMessage,
  makeName,
  maxModelYear,
  mileageProblem,
  oneLine,
  parseWhole,
  priceProblem,
  replyChoices,
  sellMessages,
  sellReference,
  stripNul,
  tidyNotes,
  titleChoices,
  valuesOf,
  yearProblem,
  type Choice,
} from "@/components/sellSteps";

/**
 * What the "Sell your car" form may send, checked on the server.
 *
 * Every message and every number rule comes from components/sellSteps.ts,
 * which the form checks each step with, so the two can't say different
 * things. Pure (no database, no request), so scripts/verify-sell.ts runs it
 * as it is.
 *
 * Built per request, not once: the answers differ by market (a title in the
 * US, papers in Nigeria; Text or WhatsApp), the newest model year moves on
 * each New Year, and the email is needed only when it is how we're to reply.
 * zod skips an object-level rule while any field has an error, so "email
 * needed" is a rule on the email field itself, decided from the reply chosen.
 */

const oneOf = (choices: readonly Choice[], message: string) =>
  z.enum(valuesOf(choices) as [string, ...string[]], { message });

/** A single-line box: flattened, then required or not, and no longer than `max`. */
function line(missing: string | null, max: number, tooLong: string, min = 1) {
  const base = missing ? z.string({ message: missing }) : z.string();
  return base.transform(oneLine).superRefine((v, ctx) => {
    if (missing && v.length < min) ctx.addIssue({ code: "custom", message: missing });
    else if (v.length > max) ctx.addIssue({ code: "custom", message: tooLong });
  });
}

/** A rule from sellSteps (null = fine) as a zod refinement. */
const rule =
  (check: (v: string) => string | null) => (v: string, ctx: z.RefinementCtx) => {
    const message = check(v);
    if (message) ctx.addIssue({ code: "custom", message });
  };

export function sellSchema(
  market: MarketCode,
  opts: { maxYear: number; emailNeeded: boolean },
) {
  const m = sellMessages(market);
  return z.object({
    marketCode: z.literal(market),

    // ── The car ───────────────────────────────────────────────────────────
    // Sent only once the owner has said "Yes, that's it" to what it decoded as.
    vin: z
      .string()
      .superRefine(rule((v) => {
        const c = checkVin(v);
        return c.wellFormed ? null : (c.message ?? m.vinMissing);
      }))
      .transform((v) => checkVin(v).vin)
      .optional(),
    year: z
      .string({ message: m.year })
      .superRefine(rule((v) => yearProblem(v, opts.maxYear, m)))
      .transform((v) => Number(v.trim())),
    make: line(m.make, MAX_MAKE, m.makeLong).transform(makeName),
    model: line(m.model, MAX_MODEL, m.modelLong),
    trim: line(null, MAX_MODEL, m.modelLong).optional(),
    mileage: z
      .string({ message: m.mileage })
      .superRefine(rule((v) => mileageProblem(v, m)))
      .transform((v) => parseWhole(v) ?? 0),
    location: line(null, MAX_LOCATION, m.location).optional(),

    // ── Its condition ─────────────────────────────────────────────────────
    condition: oneOf(CONDITIONS, m.condition),
    accident: oneOf(ACCIDENT, m.accident),
    warningLights: oneOf(LIGHTS, m.warningLights),
    title: oneOf(titleChoices(market), m.title),
    keys: oneOf(KEYS, m.keys),

    // ── What they want ────────────────────────────────────────────────────
    wants: oneOf(WANTS, m.wants),
    price: z
      .string()
      .superRefine(rule((v) => priceProblem(v, m)))
      .transform((v) => parseWhole(v))
      .optional(),
    notes: z
      .string()
      .transform(tidyNotes)
      .superRefine(rule((v) => (v.length > MAX_NOTES ? m.notes : null)))
      .optional(),

    // ── How to reach them ─────────────────────────────────────────────────
    name: line(m.name, MAX_NAME, m.nameLong, 2),
    phone: z
      .string({ message: m.phone })
      .transform((v) => v.trim())
      .superRefine(rule((v) =>
        !v ? m.phone : v.length > MAX_PHONE ? m.phoneLong : digitCount(v) < 10 ? m.phoneShort : null,
      )),
    email: opts.emailNeeded
      ? z.string({ message: m.emailNeeded }).trim().min(1, m.emailNeeded).email(m.email)
      : z.string().trim().email(m.email).optional(),
    replyBy: oneOf(replyChoices(market), m.replyBy),

    // ── Not typed by anyone ───────────────────────────────────────────────
    // The hidden field only a bot fills in, and how long the form was on
    // screen by the phone's own clock (useFormTimer).
    leave_empty: z.string().optional(),
    elapsedMs: z.coerce.number().int().min(0).optional(),
  });
}

export type SellRequest = z.output<ReturnType<typeof sellSchema>>;

export type SellParse =
  | { ok: true; data: SellRequest }
  | { ok: false; fieldErrors: Record<string, string[]> };

/**
 * The form as sent, as text: NUL characters removed, blank fields left out
 * (so a blank required field reads as missing), and anything that isn't
 * text — a file nobody asked for — dropped.
 */
export function cleanForm(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v !== "string") continue;
    const s = stripNul(v);
    if (s.trim() === "") delete out[k];
    else out[k] = s;
  }
  return out;
}

export function parseSellRequest(
  raw: Record<string, unknown>,
  now = new Date(),
): SellParse {
  const market = raw.marketCode;
  if (market !== "us" && market !== "ng") {
    return { ok: false, fieldErrors: { marketCode: [sellMessages("us").reload] } };
  }
  const schema = sellSchema(market, {
    maxYear: maxModelYear(market, now),
    emailNeeded: raw.replyBy === "email",
  });
  const r = schema.safeParse(raw);
  if (!r.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(r.error).fieldErrors as Record<string, string[]>,
    };
  }
  return { ok: true, data: r.data };
}

/**
 * The lead a checked request becomes: a trade_in, with the answers written
 * out one per line, and the car's name (never its VIN) for the alert. What
 * the action files, and what scripts/verify-sell.ts checks.
 */
export function sellLead(v: SellRequest, id: string): LeadDraft {
  return {
    id,
    type: "trade_in",
    source: SELL_SOURCE,
    name: v.name,
    email: v.email,
    message: composeSellMessage({
      ...v,
      market: v.marketCode,
      reference: sellReference(id),
      price: v.price ?? null,
    }),
    preferredContact: v.replyBy,
    vehicleLabel: carName(v),
  };
}
