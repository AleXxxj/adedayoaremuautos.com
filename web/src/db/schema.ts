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
