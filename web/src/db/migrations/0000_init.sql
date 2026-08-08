CREATE TYPE "public"."booking_status" AS ENUM('quote', 'confirmed', 'active', 'returned', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."currency_code" AS ENUM('USD', 'NGN');--> statement-breakpoint
CREATE TYPE "public"."finance_status" AS ENUM('submitted', 'reviewing', 'approved', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'qualified', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."lead_type" AS ENUM('contact', 'test_drive', 'finance', 'trade_in', 'rental', 'referral');--> statement-breakpoint
CREATE TYPE "public"."listing_kind" AS ENUM('sale', 'rental', 'both');--> statement-breakpoint
CREATE TYPE "public"."market_code" AS ENUM('us', 'ng');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('owner', 'manager', 'sales');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('draft', 'available', 'pending', 'sold', 'unlisted');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_email" text,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"diff" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"market_code" "market_code" NOT NULL,
	"employment_status" text,
	"employer_name" text,
	"income_band" text,
	"down_payment_minor" bigint,
	"requested_term_months" integer,
	"currency" "currency_code" NOT NULL,
	"consent_credit_check_at" timestamp with time zone,
	"consent_ip" text,
	"disclosure_version" text,
	"status" "finance_status" DEFAULT 'submitted' NOT NULL,
	"decision_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_code" "market_code" NOT NULL,
	"type" "lead_type" NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"vehicle_id" uuid,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"message" text,
	"preferred_contact" text,
	"source" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"referrer_url" text,
	"landing_path" text,
	"ip_country" text,
	"assigned_to" uuid,
	"first_response_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"lost_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_code" "market_code" NOT NULL,
	"name" text NOT NULL,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"city" text NOT NULL,
	"region" text,
	"postal_code" text,
	"country" text NOT NULL,
	"phone" text,
	"email" text,
	"hours" jsonb,
	"latitude" text,
	"longitude" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"code" "market_code" PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"currency" "currency_code" NOT NULL,
	"locale" text NOT NULL,
	"timezone" text NOT NULL,
	"distance_unit" text NOT NULL,
	"legal_entity" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"market_code" "market_code" NOT NULL,
	"period" "tstzrange" NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text,
	"customer_phone" text NOT NULL,
	"driver_license_no" text,
	"with_driver" boolean DEFAULT false NOT NULL,
	"status" "booking_status" DEFAULT 'quote' NOT NULL,
	"total_minor" bigint NOT NULL,
	"deposit_minor" bigint DEFAULT 0 NOT NULL,
	"currency" "currency_code" NOT NULL,
	"agreement_signed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_rates" (
	"vehicle_id" uuid PRIMARY KEY NOT NULL,
	"daily_minor" bigint NOT NULL,
	"weekly_minor" bigint,
	"monthly_minor" bigint,
	"deposit_minor" bigint DEFAULT 0 NOT NULL,
	"currency" "currency_code" NOT NULL,
	"min_days" integer DEFAULT 1 NOT NULL,
	"max_days" integer,
	"with_driver_available" boolean DEFAULT false NOT NULL,
	"driver_daily_minor" bigint
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"role" "staff_role" DEFAULT 'sales' NOT NULL,
	"market_scope" "market_code",
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vehicle_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"alt" text,
	"position" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_code" "market_code" NOT NULL,
	"location_id" uuid,
	"vin" text,
	"chassis_no" text,
	"stock_number" text,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"trim" text,
	"year" integer NOT NULL,
	"body_style" text,
	"mileage" integer,
	"mileage_unit" text NOT NULL,
	"transmission" text,
	"fuel_type" text,
	"drivetrain" text,
	"engine" text,
	"exterior_color" text,
	"interior_color" text,
	"seats" integer,
	"condition" text NOT NULL,
	"price_minor" bigint,
	"currency" "currency_code" NOT NULL,
	"was_price_minor" bigint,
	"listing_kind" "listing_kind" DEFAULT 'sale' NOT NULL,
	"status" "vehicle_status" DEFAULT 'draft' NOT NULL,
	"slug" text NOT NULL,
	"headline" text,
	"description" text,
	"features" jsonb DEFAULT '[]'::jsonb,
	"history_report_url" text,
	"inspection_notes" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"sold_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "finance_applications" ADD CONSTRAINT "finance_applications_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_applications" ADD CONSTRAINT "finance_applications_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_applications" ADD CONSTRAINT "finance_applications_market_code_markets_code_fk" FOREIGN KEY ("market_code") REFERENCES "public"."markets"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_market_code_markets_code_fk" FOREIGN KEY ("market_code") REFERENCES "public"."markets"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_market_code_markets_code_fk" FOREIGN KEY ("market_code") REFERENCES "public"."markets"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_bookings" ADD CONSTRAINT "rental_bookings_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_bookings" ADD CONSTRAINT "rental_bookings_market_code_markets_code_fk" FOREIGN KEY ("market_code") REFERENCES "public"."markets"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_rates" ADD CONSTRAINT "rental_rates_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_media" ADD CONSTRAINT "vehicle_media_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_market_code_markets_code_fk" FOREIGN KEY ("market_code") REFERENCES "public"."markets"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "leads_market_status_idx" ON "leads" USING btree ("market_code","status");--> statement-breakpoint
CREATE INDEX "leads_created_idx" ON "leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "leads_vehicle_idx" ON "leads" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "rental_bookings_vehicle_idx" ON "rental_bookings" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "rental_bookings_status_idx" ON "rental_bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vehicle_media_vehicle_idx" ON "vehicle_media" USING btree ("vehicle_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_market_slug_idx" ON "vehicles" USING btree ("market_code","slug");--> statement-breakpoint
CREATE INDEX "vehicles_market_status_idx" ON "vehicles" USING btree ("market_code","status");--> statement-breakpoint
CREATE INDEX "vehicles_make_model_idx" ON "vehicles" USING btree ("make","model");--> statement-breakpoint
CREATE INDEX "vehicles_price_idx" ON "vehicles" USING btree ("price_minor");--> statement-breakpoint
CREATE INDEX "vehicles_year_idx" ON "vehicles" USING btree ("year");