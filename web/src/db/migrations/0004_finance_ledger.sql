CREATE TYPE "public"."agreement_status" AS ENUM('active', 'settled', 'defaulted', 'written_off');--> statement-breakpoint
CREATE TYPE "public"."instalment_state" AS ENUM('due', 'paid', 'partial', 'late', 'written_off');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'bank_transfer', 'card', 'cheque', 'other');--> statement-breakpoint
CREATE TABLE "finance_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_code" "market_code" NOT NULL,
	"deal_id" uuid,
	"agreement_number" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"currency" "currency_code" NOT NULL,
	"principal_minor" bigint NOT NULL,
	"apr_bps" integer DEFAULT 0 NOT NULL,
	"term_months" integer NOT NULL,
	"regular_payment_minor" bigint NOT NULL,
	"total_interest_minor" bigint DEFAULT 0 NOT NULL,
	"first_due_date" timestamp with time zone NOT NULL,
	"status" "agreement_status" DEFAULT 'active' NOT NULL,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agreement_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"method" "payment_method" DEFAULT 'bank_transfer' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text,
	"note" text,
	"recorded_by" uuid,
	"recorded_by_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instalments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agreement_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"amount_minor" bigint NOT NULL,
	"interest_minor" bigint NOT NULL,
	"principal_minor" bigint NOT NULL,
	"balance_after_minor" bigint NOT NULL,
	"paid_minor" bigint DEFAULT 0 NOT NULL,
	"state" "instalment_state" DEFAULT 'due' NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "finance_agreements" ADD CONSTRAINT "finance_agreements_market_code_markets_code_fk" FOREIGN KEY ("market_code") REFERENCES "public"."markets"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_agreements" ADD CONSTRAINT "finance_agreements_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payments" ADD CONSTRAINT "finance_payments_agreement_id_finance_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."finance_agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payments" ADD CONSTRAINT "finance_payments_recorded_by_staff_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instalments" ADD CONSTRAINT "instalments_agreement_id_finance_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."finance_agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agreements_number_idx" ON "finance_agreements" USING btree ("agreement_number");--> statement-breakpoint
CREATE INDEX "agreements_market_status_idx" ON "finance_agreements" USING btree ("market_code","status");--> statement-breakpoint
CREATE INDEX "agreements_deal_idx" ON "finance_agreements" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "finance_payments_agreement_idx" ON "finance_payments" USING btree ("agreement_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "instalments_agreement_number_idx" ON "instalments" USING btree ("agreement_id","number");--> statement-breakpoint
CREATE INDEX "instalments_due_idx" ON "instalments" USING btree ("due_date","state");