-- Constraints that cannot be expressed in the Drizzle schema DSL.
--
-- These encode business rules at the database level so they hold regardless of
-- application bugs, concurrent requests, admin panel mistakes, or anyone poking
-- at the tables directly. Correctness that lives only in application code is
-- correctness you lose the first time two requests arrive at once.

-- ── 1. Rental double-booking is structurally impossible ────────────────────
--
-- btree_gist lets a GiST index mix an equality column (vehicle_id) with a range
-- overlap operator (&&). Without it, this constraint cannot be created.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- Two confirmed or active bookings for the SAME vehicle whose periods OVERLAP
-- are rejected by Postgres itself.
--
-- The alternative — SELECT to check availability, then INSERT — is a race: two
-- customers booking the same car for the same week can both pass the check
-- before either writes. That failure mode is invisible in testing and shows up
-- as two people arriving for one car.
--
-- Quotes and cancellations are excluded from the constraint so that speculative
-- and dead bookings never block real ones.
ALTER TABLE "rental_bookings"
  ADD CONSTRAINT "rental_bookings_no_overlap"
  EXCLUDE USING gist (
    "vehicle_id" WITH =,
    "period"     WITH &&
  ) WHERE (status IN ('confirmed', 'active'));
--> statement-breakpoint

-- A booking must cover a real, forward-going span of time.
ALTER TABLE "rental_bookings"
  ADD CONSTRAINT "rental_bookings_period_not_empty"
  CHECK (NOT isempty("period") AND lower("period") < upper("period"));
--> statement-breakpoint

-- ── 2. Vehicle identity matches the market ─────────────────────────────────
--
-- US listings carry a 17-character VIN (excluding I, O and Q, which the VIN
-- standard omits to avoid confusion with 1 and 0). Nigerian listings use a
-- chassis number with no public decoder and no fixed format.
ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_identity_matches_market"
  CHECK (
    (market_code = 'us' AND vin IS NOT NULL AND vin ~ '^[A-HJ-NPR-Z0-9]{17}$')
    OR
    (market_code = 'ng' AND (chassis_no IS NOT NULL OR vin IS NOT NULL))
  );
--> statement-breakpoint

-- VINs are globally unique. Enforce it where one is present.
CREATE UNIQUE INDEX "vehicles_vin_unique_idx"
  ON "vehicles" ("vin") WHERE "vin" IS NOT NULL;
--> statement-breakpoint

-- ── 3. Currency always matches the market ──────────────────────────────────
--
-- This is the schema-level expression of the rule that markets are disjoint.
-- A Nigerian vehicle priced in USD is not a supported state: it is the exact
-- mistake the legacy site made when it FX-converted Lagos prices into dollars
-- and presented the result as a purchasable price.
ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_currency_matches_market"
  CHECK (
    (market_code = 'us' AND currency = 'USD') OR
    (market_code = 'ng' AND currency = 'NGN')
  );
--> statement-breakpoint

ALTER TABLE "rental_bookings"
  ADD CONSTRAINT "rental_bookings_currency_matches_market"
  CHECK (
    (market_code = 'us' AND currency = 'USD') OR
    (market_code = 'ng' AND currency = 'NGN')
  );
--> statement-breakpoint

-- ── 4. Money is never negative ─────────────────────────────────────────────
ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_price_non_negative"
  CHECK (price_minor IS NULL OR price_minor >= 0);
--> statement-breakpoint

ALTER TABLE "rental_rates"
  ADD CONSTRAINT "rental_rates_non_negative"
  CHECK (
    daily_minor >= 0 AND deposit_minor >= 0
    AND (weekly_minor IS NULL OR weekly_minor >= 0)
    AND (monthly_minor IS NULL OR monthly_minor >= 0)
  );
--> statement-breakpoint

ALTER TABLE "rental_bookings"
  ADD CONSTRAINT "rental_bookings_totals_non_negative"
  CHECK (total_minor >= 0 AND deposit_minor >= 0);
--> statement-breakpoint

-- ── 5. A published vehicle must be complete enough to publish ──────────────
--
-- Stops half-finished drafts reaching the public site — and stops a listing
-- going live without a price, which is the fastest way to lose a buyer's trust.
ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_available_requires_price"
  CHECK (status <> 'available' OR price_minor IS NOT NULL);
--> statement-breakpoint

-- ── 6. Exactly one primary photo per vehicle ───────────────────────────────
CREATE UNIQUE INDEX "vehicle_media_one_primary_idx"
  ON "vehicle_media" ("vehicle_id") WHERE "is_primary" = true;
--> statement-breakpoint

-- ── 7. updated_at maintains itself ─────────────────────────────────────────
--
-- Relying on the application to set updated_at means it is wrong the first time
-- anyone writes from psql or the Supabase table editor.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER vehicles_set_updated_at
  BEFORE UPDATE ON "vehicles"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

CREATE TRIGGER leads_set_updated_at
  BEFORE UPDATE ON "leads"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

CREATE TRIGGER rental_bookings_set_updated_at
  BEFORE UPDATE ON "rental_bookings"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

CREATE TRIGGER finance_applications_set_updated_at
  BEFORE UPDATE ON "finance_applications"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
