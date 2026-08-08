CREATE TYPE "public"."appointment_kind" AS ENUM('test_drive', 'inspection', 'delivery', 'handover');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('scheduled', 'confirmed', 'completed', 'no_show', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."deal_status" AS ENUM('draft', 'negotiating', 'agreed', 'financing', 'contracted', 'delivered', 'lost');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_code" "market_code" NOT NULL,
	"lead_id" uuid,
	"vehicle_id" uuid,
	"staff_id" uuid,
	"kind" "appointment_kind" DEFAULT 'test_drive' NOT NULL,
	"status" "appointment_status" DEFAULT 'scheduled' NOT NULL,
	"period" "tstzrange" NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_email" text,
	"from_status" text,
	"to_status" text NOT NULL,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_code" "market_code" NOT NULL,
	"lead_id" uuid,
	"vehicle_id" uuid,
	"salesperson_id" uuid,
	"status" "deal_status" DEFAULT 'draft' NOT NULL,
	"deal_number" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_email" text,
	"currency" "currency_code" NOT NULL,
	"vehicle_price_minor" bigint NOT NULL,
	"trade_in_description" text,
	"trade_in_allowance_minor" bigint DEFAULT 0 NOT NULL,
	"trade_in_payoff_minor" bigint DEFAULT 0 NOT NULL,
	"down_payment_minor" bigint DEFAULT 0 NOT NULL,
	"fees" jsonb DEFAULT '[]'::jsonb,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint DEFAULT 0 NOT NULL,
	"is_financed" boolean DEFAULT false NOT NULL,
	"apr_bps" integer,
	"term_months" integer,
	"amount_financed_minor" bigint,
	"monthly_payment_minor" bigint,
	"contracted_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"lost_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_market_code_markets_code_fk" FOREIGN KEY ("market_code") REFERENCES "public"."markets"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_events" ADD CONSTRAINT "deal_events_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_market_code_markets_code_fk" FOREIGN KEY ("market_code") REFERENCES "public"."markets"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_salesperson_id_staff_id_fk" FOREIGN KEY ("salesperson_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_vehicle_idx" ON "appointments" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "appointments_staff_idx" ON "appointments" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "appointments_status_idx" ON "appointments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deal_events_deal_idx" ON "deal_events" USING btree ("deal_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "deals_number_idx" ON "deals" USING btree ("deal_number");--> statement-breakpoint
CREATE INDEX "deals_market_status_idx" ON "deals" USING btree ("market_code","status");--> statement-breakpoint
CREATE INDEX "deals_vehicle_idx" ON "deals" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "deals_created_idx" ON "deals" USING btree ("created_at");