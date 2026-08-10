CREATE TABLE "rental_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_code" "market_code" NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text,
	"position" integer DEFAULT 0 NOT NULL,
	"daily_minor" bigint NOT NULL,
	"weekly_minor" bigint,
	"monthly_minor" bigint,
	"ownership_threshold_minor" bigint,
	"deposit_minor" bigint DEFAULT 0 NOT NULL,
	"currency" "currency_code" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rental_tiers" ADD CONSTRAINT "rental_tiers_market_code_markets_code_fk" FOREIGN KEY ("market_code") REFERENCES "public"."markets"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "rental_tiers_market_slug_unique" ON "rental_tiers" USING btree ("market_code","slug");
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "rental_tier_id" uuid;
--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_rental_tier_id_rental_tiers_id_fk" FOREIGN KEY ("rental_tier_id") REFERENCES "public"."rental_tiers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Prices and thresholds are money: never negative, and a threshold of zero
-- would hand over a vehicle for nothing.
ALTER TABLE "rental_tiers" ADD CONSTRAINT "rental_tiers_prices_positive" CHECK (
  "daily_minor" > 0
  AND ("weekly_minor" IS NULL OR "weekly_minor" > 0)
  AND ("monthly_minor" IS NULL OR "monthly_minor" > 0)
  AND "deposit_minor" >= 0
  AND ("ownership_threshold_minor" IS NULL OR "ownership_threshold_minor" > 0)
);
--> statement-breakpoint
-- A weekly rate that costs more than seven separate days, or a monthly that
-- costs more than four weeks, is a pricing mistake rather than a strategy: the
-- customer would simply book the cheaper way and the headline rate would be a
-- lie. The database refuses it.
ALTER TABLE "rental_tiers" ADD CONSTRAINT "rental_tiers_longer_is_cheaper" CHECK (
  ("weekly_minor" IS NULL OR "weekly_minor" <= "daily_minor" * 7)
  AND ("monthly_minor" IS NULL OR "weekly_minor" IS NULL OR "monthly_minor" <= "weekly_minor" * 4)
);
