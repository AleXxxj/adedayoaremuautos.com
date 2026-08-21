/**
 * Database schema — Adedayo Aremu Autos platform.
 *
 * Design notes that are easy to get wrong and expensive to fix later:
 *
 * 1. MONEY IS bigint, NOT integer.
 *    Prices are stored in minor units. ₦15,000,000 is 1,500,000,000 kobo, and
 *    Postgres `integer` tops out at 2,147,483,647 — so a ₦25m vehicle would
 *    overflow. Nigerian prices in kobo exceed int4 almost immediately.
 *
 * 2. EVERY row that represents inventory, pricing or a lead carries a market.
 *    Markets are disjoint. There is no cross-market price conversion anywhere
 *    in this system, by construction.
 *
 * 3. Rental availability is enforced by the database, not by application code.
 *    See the exclusion constraint in the migration.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ── Custom types ──────────────────────────────────────────────────────── */

/**
 * Postgres tstzrange. Drizzle has no native range type, but we need a real
 * range column for the booking exclusion constraint to work — storing start
 * and end as separate timestamps would make overlap enforcement impossible
 * at the database level.
 */
const tstzrange = customType<{ data: string }>({
  dataType: () => "tstzrange",
});

/* ── Enums ─────────────────────────────────────────────────────────────── */

export const marketCode = pgEnum("market_code", ["us", "ng"]);
export const currencyCode = pgEnum("currency_code", ["USD", "NGN"]);

export const vehicleStatus = pgEnum("vehicle_status", [
  "draft", // being prepared, not public
  "available",
  "pending", // deposit taken / sale in progress
  "sold",
  "unlisted", // withdrawn but retained for records
]);

export const listingKind = pgEnum("listing_kind", ["sale", "rental", "both"]);

export const bookingStatus = pgEnum("booking_status", [
  "quote",
  "confirmed",
  "active",
  "returned",
  "cancelled",
]);

export const leadType = pgEnum("lead_type", [
  "contact",
  "test_drive",
  "finance",
  "trade_in",
  "rental",
  "referral",
  "rent_to_own",
]);

export const leadStatus = pgEnum("lead_status", [
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
]);

export const financeStatus = pgEnum("finance_status", [
  "submitted",
  "reviewing",
  "approved",
  "declined",
  "withdrawn",
]);

export const staffRole = pgEnum("staff_role", ["owner", "manager", "sales"]);

/* ── Markets & locations ───────────────────────────────────────────────── */

export const markets = pgTable("markets", {
  code: marketCode("code").primaryKey(),
  name: text("name").notNull(),
  currency: currencyCode("currency").notNull(),
  locale: text("locale").notNull(),
  timezone: text("timezone").notNull(),
  distanceUnit: text("distance_unit").notNull(), // 'mi' | 'km'
  legalEntity: text("legal_entity"),
  isActive: boolean("is_active").notNull().default(true),
});

export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  marketCode: marketCode("market_code")
    .notNull()
    .references(() => markets.code),
  name: text("name").notNull(),
  addressLine1: text("address_line1").notNull(),
  addressLine2: text("address_line2"),
  city: text("city").notNull(),
  region: text("region"), // state / province
  postalCode: text("postal_code"),
  country: text("country").notNull(),
  phone: text("phone"),
  email: text("email"),
  /** [{ day: 1, open: "09:00", close: "18:00" }, ...] */
  hours: jsonb("hours"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  isActive: boolean("is_active").notNull().default(true),
});

/* ── Vehicles ──────────────────────────────────────────────────────────── */

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketCode: marketCode("market_code")
      .notNull()
      .references(() => markets.code),
    locationId: uuid("location_id").references(() => locations.id),

    /**
     * US vehicles carry a decodable 17-char VIN; Nigerian listings use a
     * chassis number with no public decoder. Both nullable, exactly one
     * expected per market — enforced by a CHECK in the migration.
     */
    vin: text("vin"),
    chassisNo: text("chassis_no"),
    stockNumber: text("stock_number"),

    make: text("make").notNull(),
    model: text("model").notNull(),
    trim: text("trim"),
    year: integer("year").notNull(),
    bodyStyle: text("body_style"),

    mileage: integer("mileage"),
    /** Denormalised from the market so historic rows stay truthful. */
    mileageUnit: text("mileage_unit").notNull(),

    transmission: text("transmission"),
    fuelType: text("fuel_type"),
    drivetrain: text("drivetrain"),
    engine: text("engine"),
    exteriorColor: text("exterior_color"),
    interiorColor: text("interior_color"),
    seats: integer("seats"),

    /** Market-specific vocabulary: 'Certified Pre-Owned' vs 'Foreign Used'. */
    condition: text("condition").notNull(),

    /** Minor units. bigint — see file header. */
    priceMinor: bigint("price_minor", { mode: "number" }),
    currency: currencyCode("currency").notNull(),
    /** Optional strike-through price for genuine markdowns only. */
    wasPriceMinor: bigint("was_price_minor", { mode: "number" }),

    listingKind: listingKind("listing_kind").notNull().default("sale"),
    status: vehicleStatus("status").notNull().default("draft"),

    slug: text("slug").notNull(),
    headline: text("headline"),
    description: text("description"),
    features: jsonb("features").$type<string[]>().default([]),

    /** URL of a third-party history report. US buyers expect this. */
    historyReportUrl: text("history_report_url"),
    /** Which rent-to-own category this vehicle is offered in, if any. */
    rentalTierId: uuid("rental_tier_id"),
    inspectionNotes: text("inspection_notes"),

    isFeatured: boolean("is_featured").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    soldAt: timestamp("sold_at", { withTimezone: true }),
  },
  (t) => [
    // Slugs must be unique per market, not globally — the same model can be
    // listed in both markets.
    uniqueIndex("vehicles_market_slug_idx").on(t.marketCode, t.slug),
    index("vehicles_market_status_idx").on(t.marketCode, t.status),
    index("vehicles_make_model_idx").on(t.make, t.model),
    index("vehicles_price_idx").on(t.priceMinor),
    index("vehicles_year_idx").on(t.year),
  ],
);

export const vehicleMedia = pgTable(
  "vehicle_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    alt: text("alt"),
    position: integer("position").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
    width: integer("width"),
    height: integer("height"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("vehicle_media_vehicle_idx").on(t.vehicleId, t.position)],
);

/* ── Rentals ───────────────────────────────────────────────────────────── */

export const rentalRates = pgTable("rental_rates", {
  vehicleId: uuid("vehicle_id")
    .primaryKey()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  dailyMinor: bigint("daily_minor", { mode: "number" }).notNull(),
  weeklyMinor: bigint("weekly_minor", { mode: "number" }),
  monthlyMinor: bigint("monthly_minor", { mode: "number" }),
  depositMinor: bigint("deposit_minor", { mode: "number" }).notNull().default(0),
  currency: currencyCode("currency").notNull(),
  minDays: integer("min_days").notNull().default(1),
  maxDays: integer("max_days"),
  /** Chauffeur-driven is the norm for much of the Nigerian rental market. */
  withDriverAvailable: boolean("with_driver_available")
    .notNull()
    .default(false),
  driverDailyMinor: bigint("driver_daily_minor", { mode: "number" }),
});

export const rentalBookings = pgTable(
  "rental_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    marketCode: marketCode("market_code")
      .notNull()
      .references(() => markets.code),

    /**
     * The booked window as a single range column. This is what the exclusion
     * constraint operates on — checking availability in application code is a
     * race condition, so the database owns this invariant.
     */
    period: tstzrange("period").notNull(),

    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email"),
    customerPhone: text("customer_phone").notNull(),
    driverLicenseNo: text("driver_license_no"),

    withDriver: boolean("with_driver").notNull().default(false),
    status: bookingStatus("status").notNull().default("quote"),

    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    depositMinor: bigint("deposit_minor", { mode: "number" })
      .notNull()
      .default(0),
    currency: currencyCode("currency").notNull(),

    agreementSignedAt: timestamp("agreement_signed_at", { withTimezone: true }),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("rental_bookings_vehicle_idx").on(t.vehicleId),
    index("rental_bookings_status_idx").on(t.status),
  ],
);

/* ── Leads ─────────────────────────────────────────────────────────────── */

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketCode: marketCode("market_code")
      .notNull()
      .references(() => markets.code),
    type: leadType("type").notNull(),
    status: leadStatus("status").notNull().default("new"),

    vehicleId: uuid("vehicle_id").references(() => vehicles.id, {
      onDelete: "set null",
    }),

    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    message: text("message"),
    preferredContact: text("preferred_contact"), // phone | email | whatsapp

    /** Attribution — which channel produced this lead. */
    source: text("source"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    referrerUrl: text("referrer_url"),

    /** Who introduced this enquiry, if they arrived through a partner link. */
    referralPartnerId: uuid("referral_partner_id"),

    /**
     * Which rent-to-own category was applied for. Recorded rather than derived
     * from the vehicle later: the tier's rates are what the applicant was
     * actually shown, and a vehicle can be re-tiered or sold afterwards.
     */
    rentalTierId: uuid("rental_tier_id"),
    landingPath: text("landing_path"),
    ipCountry: text("ip_country"),

    assignedTo: uuid("assigned_to"),

    /**
     * Recorded because response time predicts close rate better than almost
     * anything else in auto retail. An asset should measure what makes it money.
     */
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    lostReason: text("lost_reason"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("leads_market_status_idx").on(t.marketCode, t.status),
    index("leads_created_idx").on(t.createdAt),
    index("leads_vehicle_idx").on(t.vehicleId),
  ],
);

export const financeApplications = pgTable("finance_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id, {
    onDelete: "set null",
  }),
  marketCode: marketCode("market_code")
    .notNull()
    .references(() => markets.code),

  employmentStatus: text("employment_status"),
  employerName: text("employer_name"),
  /** Stored as a band, not an exact figure — less sensitive data at rest. */
  incomeBand: text("income_band"),

  downPaymentMinor: bigint("down_payment_minor", { mode: "number" }),
  requestedTermMonths: integer("requested_term_months"),
  currency: currencyCode("currency").notNull(),

  /**
   * Consent must be explicit, timestamped and attributable before any credit
   * check. Recording when and from where is the point.
   */
  consentCreditCheckAt: timestamp("consent_credit_check_at", {
    withTimezone: true,
  }),
  consentIp: text("consent_ip"),
  /** Which disclosure text the applicant actually saw, for the record. */
  disclosureVersion: text("disclosure_version"),

  status: financeStatus("status").notNull().default("submitted"),
  decisionNotes: text("decision_notes"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ── Staff & audit ─────────────────────────────────────────────────────── */

export const staff = pgTable("staff", {
  id: uuid("id").primaryKey(), // mirrors the Supabase auth user id
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  role: staffRole("role").notNull().default("sales"),
  /** null = all markets; otherwise scoped to one. */
  marketScope: marketCode("market_scope"),
  phone: text("phone"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id"),
    actorEmail: text("actor_email"),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(), // create | update | delete | status_change
    diff: jsonb("diff"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_entity_idx").on(t.entity, t.entityId),
    index("audit_at_idx").on(t.at),
  ],
);

/* ── Convenience types ─────────────────────────────────────────────────── */

export type Vehicle = typeof vehicles.$inferSelect;
export type NewVehicle = typeof vehicles.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type RentalBooking = typeof rentalBookings.$inferSelect;
export type NewRentalBooking = typeof rentalBookings.$inferInsert;

export const SCHEMA_VERSION_NOTE = sql`-- see src/db/migrations`;

/* ═══════════════════════════════════════════════════════════════════════════
   DEAL FLOW

   The part that turns an enquiry into a sale. The legacy site had none of it:
   a lead arrived (in theory) and then nothing was tracked until, presumably,
   a WhatsApp thread. This is where a dealership actually makes money, so it
   gets the same treatment as inventory — real states, real constraints, real
   money arithmetic.
   ═══════════════════════════════════════════════════════════════════════════ */

export const appointmentKind = pgEnum("appointment_kind", [
  "test_drive",
  "inspection",
  "delivery",
  "handover",
]);

export const appointmentStatus = pgEnum("appointment_status", [
  "scheduled",
  "confirmed",
  "completed",
  "no_show",
  "cancelled",
]);

export const dealStatus = pgEnum("deal_status", [
  "draft",       // being built by a salesperson
  "negotiating", // numbers with the customer
  "agreed",      // terms accepted, not yet papered
  "financing",   // awaiting a credit decision
  "contracted",  // signed
  "delivered",   // keys handed over — this is what marks the vehicle sold
  "lost",
]);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketCode: marketCode("market_code")
      .notNull()
      .references(() => markets.code),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, {
      onDelete: "set null",
    }),
    staffId: uuid("staff_id").references(() => staff.id),

    kind: appointmentKind("kind").notNull().default("test_drive"),
    status: appointmentStatus("status").notNull().default("scheduled"),

    /**
     * Stored as a range rather than a start time plus duration, so the same
     * exclusion-constraint trick that protects rentals also protects this:
     * one vehicle cannot be out on two test drives at once.
     */
    period: tstzrange("period").notNull(),

    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("appointments_vehicle_idx").on(t.vehicleId),
    index("appointments_staff_idx").on(t.staffId),
    index("appointments_status_idx").on(t.status),
  ],
);

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketCode: marketCode("market_code")
      .notNull()
      .references(() => markets.code),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    salespersonId: uuid("salesperson_id").references(() => staff.id),

    /**
     * Who gets paid for this sale, and how much.
     *
     * Held on the deal as well as on the lead because this is the row that
     * says money changed hands: a rate can be renegotiated and a lead can be
     * reassigned, but what was owed on a completed sale must not move
     * afterwards.
     */
    referralPartnerId: uuid("referral_partner_id"),
    referralCommissionMinor: bigint("referral_commission_minor", { mode: "number" })
      .notNull()
      .default(0),

    status: dealStatus("status").notNull().default("draft"),
    dealNumber: text("deal_number").notNull(),

    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email"),

    currency: currencyCode("currency").notNull(),

    /** Agreed selling price — not necessarily the list price. */
    vehiclePriceMinor: bigint("vehicle_price_minor", { mode: "number" }).notNull(),

    /** Trade-in. Allowance is what we credit; payoff is what we settle. */
    tradeInDescription: text("trade_in_description"),
    tradeInAllowanceMinor: bigint("trade_in_allowance_minor", { mode: "number" })
      .notNull()
      .default(0),
    tradeInPayoffMinor: bigint("trade_in_payoff_minor", { mode: "number" })
      .notNull()
      .default(0),

    downPaymentMinor: bigint("down_payment_minor", { mode: "number" })
      .notNull()
      .default(0),

    /** [{ label, amountMinor, taxable }] — doc fee, title, registration. */
    fees: jsonb("fees").$type<{ label: string; amountMinor: number; taxable: boolean }[]>().default([]),

    /** Basis points, so 3% is 300. Never a float. */
    taxRateBps: integer("tax_rate_bps").notNull().default(0),
    taxMinor: bigint("tax_minor", { mode: "number" }).notNull().default(0),

    /** Out-the-door total. */
    totalMinor: bigint("total_minor", { mode: "number" }).notNull().default(0),

    isFinanced: boolean("is_financed").notNull().default(false),
    aprBps: integer("apr_bps"),
    termMonths: integer("term_months"),
    amountFinancedMinor: bigint("amount_financed_minor", { mode: "number" }),
    monthlyPaymentMinor: bigint("monthly_payment_minor", { mode: "number" }),

    contractedAt: timestamp("contracted_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lostReason: text("lost_reason"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("deals_number_idx").on(t.dealNumber),
    index("deals_market_status_idx").on(t.marketCode, t.status),
    index("deals_vehicle_idx").on(t.vehicleId),
    index("deals_created_idx").on(t.createdAt),
  ],
);

/** Every stage change, with who did it. A deal's history is not optional. */
export const dealEvents = pgTable(
  "deal_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id"),
    actorEmail: text("actor_email"),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    note: text("note"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("deal_events_deal_idx").on(t.dealId, t.at)],
);

export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
export type Appointment = typeof appointments.$inferSelect;

/* ═══════════════════════════════════════════════════════════════════════════
   FINANCE LEDGER

   Offering 6-24 month in-house instalment plans makes this business a lender.
   A lender without a ledger loses money quietly: nobody knows who is behind,
   by how much, or since when.
   ═══════════════════════════════════════════════════════════════════════════ */

export const agreementStatus = pgEnum("agreement_status", [
  "active",
  "settled",     // paid in full
  "defaulted",
  "written_off",
]);

export const instalmentState = pgEnum("instalment_state", [
  "due",
  "paid",
  "partial",
  "late",
  "written_off",
]);

export const paymentMethod = pgEnum("payment_method", [
  "cash",
  "bank_transfer",
  "card",
  "cheque",
  "other",
]);

export const financeAgreements = pgTable(
  "finance_agreements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketCode: marketCode("market_code")
      .notNull()
      .references(() => markets.code),
    dealId: uuid("deal_id").references(() => deals.id),
    agreementNumber: text("agreement_number").notNull(),

    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),

    currency: currencyCode("currency").notNull(),
    /** Amount financed at signing. Never changes. */
    principalMinor: bigint("principal_minor", { mode: "number" }).notNull(),
    aprBps: integer("apr_bps").notNull().default(0),
    termMonths: integer("term_months").notNull(),
    /** The level payment. The final instalment may differ by a few units. */
    regularPaymentMinor: bigint("regular_payment_minor", { mode: "number" }).notNull(),
    totalInterestMinor: bigint("total_interest_minor", { mode: "number" })
      .notNull()
      .default(0),

    firstDueDate: timestamp("first_due_date", { withTimezone: true }).notNull(),
    status: agreementStatus("status").notNull().default("active"),
    settledAt: timestamp("settled_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("agreements_number_idx").on(t.agreementNumber),
    index("agreements_market_status_idx").on(t.marketCode, t.status),
    index("agreements_deal_idx").on(t.dealId),
  ],
);

export const instalments = pgTable(
  "instalments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agreementId: uuid("agreement_id")
      .notNull()
      .references(() => financeAgreements.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),

    /** Generated once at signing and never recomputed — the customer signed
        this schedule, so it is a record, not a derived value. */
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    interestMinor: bigint("interest_minor", { mode: "number" }).notNull(),
    principalMinor: bigint("principal_minor", { mode: "number" }).notNull(),
    balanceAfterMinor: bigint("balance_after_minor", { mode: "number" }).notNull(),

    paidMinor: bigint("paid_minor", { mode: "number" }).notNull().default(0),
    state: instalmentState("state").notNull().default("due"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("instalments_agreement_number_idx").on(t.agreementId, t.number),
    index("instalments_due_idx").on(t.dueDate, t.state),
  ],
);

export const financePayments = pgTable(
  "finance_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agreementId: uuid("agreement_id")
      .notNull()
      .references(() => financeAgreements.id, { onDelete: "cascade" }),

    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyCode("currency").notNull(),
    method: paymentMethod("method").notNull().default("bank_transfer"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Bank reference, teller number, receipt id. */
    reference: text("reference"),
    note: text("note"),

    recordedBy: uuid("recorded_by").references(() => staff.id),
    recordedByEmail: text("recorded_by_email"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("finance_payments_agreement_idx").on(t.agreementId, t.receivedAt)],
);

export type FinanceAgreement = typeof financeAgreements.$inferSelect;
export type Instalment = typeof instalments.$inferSelect;
export type FinancePayment = typeof financePayments.$inferSelect;

/* ── Blog ──────────────────────────────────────────────────────────────── */

/**
 * Newsletter subscribers.
 *
 * The legacy form had no action attribute, so every address typed into it was
 * discarded on submit. Consent is recorded per address: under GDPR-style rules
 * and the US CAN-SPAM Act it must be possible to show when and from where
 * someone opted in, and to honour an unsubscribe.
 */
export const newsletterSubscribers = pgTable(
  "newsletter_subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    marketCode: marketCode("market_code")
      .notNull()
      .references(() => markets.code),
    /** Where on the site they subscribed, for attribution. */
    source: text("source"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    /** Random token so an unsubscribe link needs no login and leaks no id. */
    unsubscribeToken: text("unsubscribe_token").notNull(),

    /** So a greeting opens with a name rather than "Hi there". Optional. */
    firstName: text("first_name"),

    /**
     * Birthday, day and month only — never the year.
     *
     * The request was for date of birth. The year adds nothing to a birthday
     * greeting and changes what this table is: name plus email plus full date
     * of birth is a standard building block of identity theft, and knowing a
     * subscriber is under 13 creates COPPA obligations. Day and month is the
     * whole benefit at a fraction of the risk.
     */
    birthDay: integer("birth_day"),
    birthMonth: integer("birth_month"),
    consentIp: text("consent_ip"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("newsletter_email_unique").on(t.email)],
);

export const commentStatus = pgEnum("comment_status", [
  "pending",
  "approved",
  "rejected",
]);

/**
 * Article comments, held for moderation.
 *
 * The legacy page printed three hardcoded comments from people who do not
 * exist, above a form that posted nowhere. Real comments on a dealership site
 * are a reputational surface, so nothing appears publicly until a member of
 * staff approves it — default status is `pending` and the public query filters
 * on `approved`.
 */
export const articleComments = pgTable(
  "article_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleSlug: text("article_slug").notNull(),
    marketCode: marketCode("market_code")
      .notNull()
      .references(() => markets.code),

    authorName: text("author_name").notNull(),
    authorEmail: text("author_email"),
    body: text("body").notNull(),

    status: commentStatus("status").notNull().default("pending"),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    moderatedByEmail: text("moderated_by_email"),

    authorIp: text("author_ip"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("article_comments_slug_idx").on(t.articleSlug, t.status, t.createdAt),
  ],
);

export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type ArticleComment = typeof articleComments.$inferSelect;

/* ── Rent to own ───────────────────────────────────────────────────────── */

/**
 * Rental tiers on a path to ownership.
 *
 * A tier carries its own pricing and the amount of accumulated rent at which
 * the vehicle becomes the customer's. Pricing lives on the tier rather than
 * the vehicle because the offer is sold by category — "Economy is $40 a day,
 * $250 a week, yours at $5,000" — and every vehicle in that category shares
 * the terms.
 *
 * Market-scoped and currency-bearing: $5,000 is not a threshold anyone has
 * agreed to in naira, so Nigeria has no tiers until the business sets them.
 */

/* ── Website assistant ─────────────────────────────────────────────────── */

/**
 * A conversation with the site assistant.
 *
 * Every one is kept, not just the ones that become an enquiry. What people ask
 * at 2am when nobody is on the phone is the most honest market research this
 * business will get, and a chat that ended without a lead is often the most
 * informative — it usually means the answer was no, or the car they wanted was
 * not in stock.
 */
export const assistantConversations = pgTable(
  "assistant_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketCode: marketCode("market_code")
      .notNull()
      .references(() => markets.code),

    /** Where the conversation started, so context is not lost. */
    landingPath: text("landing_path"),

    /** Written by the model, so staff read a paragraph not a transcript. */
    summary: text("summary"),
    intent: text("intent"),

    leadId: uuid("lead_id"),

    /** The visitor asked for a person, or the assistant hit its limits. */
    needsHuman: boolean("needs_human").notNull().default(false),

    /** Counted, not derived — a long chat cannot be extended by deletion. */
    messageCount: integer("message_count").notNull().default(0),

    ipHash: text("ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("assistant_conversations_recent_idx").on(t.lastMessageAt)],
);

export type AssistantConversation = typeof assistantConversations.$inferSelect;

export const assistantMessages = pgTable(
  "assistant_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => assistantConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("assistant_messages_conversation_idx").on(t.conversationId, t.createdAt)],
);


/* ── Mailing-list broadcasts ───────────────────────────────────────────── */

export const campaignStatus = pgEnum("campaign_status", [
  "draft",
  "sending",
  "sent",
  "failed",
]);

/**
 * A message sent to the mailing list.
 *
 * The least reversible thing this admin can do, so it is recorded per
 * recipient rather than fired and forgotten. That record makes sending
 * resumable when a serverless function runs out of time part-way through a
 * list, and stops anyone being emailed twice when it resumes.
 */
export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketCode: marketCode("market_code")
      .notNull()
      .references(() => markets.code),

    subject: text("subject").notNull(),
    body: text("body").notNull(),

    status: campaignStatus("status").notNull().default("draft"),

    /** Kept as an email too: staff leave, and "who sent that?" outlives them. */
    createdBy: uuid("created_by"),
    createdByEmail: text("created_by_email"),

    recipientCount: integer("recipient_count").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("campaigns_recent_idx").on(t.createdAt)],
);

export type Campaign = typeof campaigns.$inferSelect;

export const campaignRecipients = pgTable(
  "campaign_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),

    subscriberId: uuid("subscriber_id"),
    /** Denormalised: the record of having been emailed outlives the row. */
    email: text("email").notNull(),

    status: text("status").notNull().default("pending"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    index("campaign_recipients_pending_idx").on(t.campaignId, t.status),
    uniqueIndex("campaign_recipient_once").on(t.campaignId, t.email),
  ],
);

export const referralPartnerStatus = pgEnum("referral_partner_status", [
  "active",
  "suspended",
]);

/**
 * Someone who sends buyers and is paid for it.
 *
 * The site has advertised 1.5% commission and "track your referrals easily"
 * since the original build, with nothing behind either: no codes, no
 * attribution, so a commission could only be settled from memory and an
 * argument. A partner's code is what turns a claim into a record.
 *
 * There are deliberately no bank or payout details here. A public form that
 * collects account numbers makes this table worth stealing, and the business
 * speaks to a partner before paying them anyway — the same reasoning that
 * keeps SSN and BVN off the finance form.
 */
export const referralPartners = pgTable(
  "referral_partners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketCode: marketCode("market_code")
      .notNull()
      .references(() => markets.code),

    /** Short and speakable: it is read down a phone and written on receipts. */
    code: text("code").notNull(),

    fullName: text("full_name").notNull(),
    email: text("email"),
    phone: text("phone").notNull(),
    whatsapp: text("whatsapp"),

    status: referralPartnerStatus("status").notNull().default("active"),

    /** Basis points; 150 = the 1.5% the site advertises. Per partner, because
     *  volume earns a better rate and changing it must not rewrite history. */
    commissionBps: integer("commission_bps").notNull().default(150),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("referral_partners_code_unique").on(t.code)],
);

export type ReferralPartner = typeof referralPartners.$inferSelect;

export const rentalTiers = pgTable(
  "rental_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketCode: marketCode("market_code")
      .notNull()
      .references(() => markets.code),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    tagline: text("tagline"),
    /** Display order, lowest first. */
    position: integer("position").notNull().default(0),

    dailyMinor: bigint("daily_minor", { mode: "number" }).notNull(),
    weeklyMinor: bigint("weekly_minor", { mode: "number" }),
    monthlyMinor: bigint("monthly_minor", { mode: "number" }),
    /**
     * Total rent that must accumulate before ownership transfers. Null means
     * the tier is hire-only — the category exists but does not lead to
     * ownership, which the business may want for its most expensive stock.
     */
    ownershipThresholdMinor: bigint("ownership_threshold_minor", { mode: "number" }),
    depositMinor: bigint("deposit_minor", { mode: "number" }).notNull().default(0),
    currency: currencyCode("currency").notNull(),

    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("rental_tiers_market_slug_unique").on(t.marketCode, t.slug)],
);

export type RentalTier = typeof rentalTiers.$inferSelect;
