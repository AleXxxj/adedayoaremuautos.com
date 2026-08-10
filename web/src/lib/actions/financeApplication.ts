"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads, vehicles, financeApplications } from "@/db/schema";
import { MARKETS, isMarketCode } from "@/lib/market";
import { fromMajor } from "@/lib/money";
import { notifyStaffOfLead } from "@/lib/notify";
import { DISCLOSURE_VERSION } from "@/lib/disclosure";

export interface ApplicationResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

const EMPLOYMENT = [
  "salaried",
  "self_employed",
  "business_owner",
  "contractor",
  "other",
] as const;

/**
 * Income arrives as a band, never an exact figure.
 *
 * A band is enough to size an instalment and is materially less damaging if it
 * ever leaks. Same reasoning as the schema: less sensitive data at rest.
 */
const INCOME_BANDS = [
  "under_1",
  "1_2",
  "2_5",
  "5_10",
  "over_10",
] as const;

const schema = z.object({
  marketCode: z.enum(["us", "ng"]),
  name: z.string().trim().min(2, "Please enter your name").max(120),
  phone: z.string().trim().min(7, "Please enter a reachable phone number").max(40),
  email: z.string().trim().email("That email does not look right").optional().or(z.literal("")),
  employment: z.enum(EMPLOYMENT, { message: "Please choose one" }),
  incomeBand: z.enum(INCOME_BANDS, { message: "Please choose a range" }),
  downPayment: z.coerce
    .number({ message: "Enter a down payment amount" })
    .min(0, "Down payment cannot be negative")
    .max(1_000_000_000, "That figure looks wrong"),
  termMonths: z.coerce.number().int().positive(),
  vehicleSlug: z.string().trim().max(120).optional(),
  preferredCar: z.string().trim().max(200).optional(),
  // Explicit, unticked by default. Nothing is submitted without it.
  consent: z.literal("yes", { message: "Please confirm to continue" }),
  website: z.string().max(0, "Rejected").optional(),
  renderedAt: z.coerce.number().optional(),
});

const MIN_FILL_MS = 2500;
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 60 * 60 * 1000;

/**
 * A financing application: a lead, plus the affordability detail behind it.
 *
 * Deliberately collects no BVN, SSN, national ID or bank account number. The
 * original form asked for "BVN / SSN" in a plain text input posting to
 * Formspree — a third party, over a form with no consent record, storing the
 * single most abusable identifier a Nigerian or US customer has. Holding those
 * numbers brings the business under the GLBA Safeguards Rule in the US and
 * makes it a serious target in Nigeria, for no operational gain: identity is
 * verified in person, on paper, at the point the deal is actually written.
 */
export async function submitFinanceApplication(
  _prev: ApplicationResult | null,
  formData: FormData,
): Promise<ApplicationResult> {
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

  if (v.website) return { ok: true };
  if (v.renderedAt && Date.now() - v.renderedAt < MIN_FILL_MS) return { ok: true };

  const h = await headers();
  const ipCountry = h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? null;
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;

  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const [{ recent }] = await db
    .select({ recent: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(eq(leads.phone, v.phone), gte(leads.createdAt, since)));

  if (recent >= RATE_LIMIT) {
    return {
      ok: false,
      error:
        "We have already received an application from this number. Please call us and we will pick it up from there.",
    };
  }

  const market = MARKETS[v.marketCode];

  let vehicleId: string | null = null;
  let vehicleLabel: string | null = v.preferredCar ?? null;
  if (v.vehicleSlug && isMarketCode(v.marketCode)) {
    const [vehicle] = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.marketCode, v.marketCode), eq(vehicles.slug, v.vehicleSlug)))
      .limit(1);
    if (vehicle) {
      vehicleId = vehicle.id;
      vehicleLabel = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    }
  }

  const message = [
    `Employment: ${v.employment.replace(/_/g, " ")}`,
    `Preferred term: ${v.termMonths} months`,
    v.preferredCar ? `Vehicle of interest: ${v.preferredCar}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // The lead and the application go in together: an application row without a
  // lead is invisible to the people who have to follow it up, and a lead
  // without its application loses the affordability detail. Either both land
  // or neither does.
  let leadId: string;
  try {
    leadId = await db.transaction(async (tx) => {
      const [lead] = await tx
        .insert(leads)
        .values({
          marketCode: v.marketCode,
          type: "finance",
          status: "new",
          vehicleId,
          name: v.name,
          email: v.email || null,
          phone: v.phone,
          message,
          preferredContact: "phone",
          source: "website",
          referrerUrl: h.get("referer"),
          landingPath: String(raw.landingPath ?? "") || null,
          ipCountry,
        })
        .returning({ id: leads.id });

      await tx.insert(financeApplications).values({
        leadId: lead.id,
        vehicleId,
        marketCode: v.marketCode,
        employmentStatus: v.employment,
        incomeBand: v.incomeBand,
        downPaymentMinor: fromMajor(v.downPayment, market.currency).minor,
        requestedTermMonths: v.termMonths,
        currency: market.currency,
        consentCreditCheckAt: new Date(),
        consentIp: ip,
        disclosureVersion: DISCLOSURE_VERSION,
      });

      return lead.id;
    });
  } catch (e) {
    console.error("[finance] application insert failed", e);
    return {
      ok: false,
      error:
        "Something went wrong saving your application. Please call us and we will take the details over the phone.",
    };
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  try {
    await notifyStaffOfLead({
      leadId,
      type: "finance",
      market: v.marketCode,
      name: v.name,
      email: v.email,
      phone: v.phone,
      message,
      vehicle: vehicleLabel,
      adminUrl: `${site}/admin/leads`,
    });
  } catch (e) {
    console.error("[finance] notification failed", e);
  }

  revalidatePath("/admin/leads");
  return { ok: true };
}
