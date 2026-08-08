-- Deal-flow invariants enforced by the database.

-- ── 1. One vehicle cannot be on two test drives at once ────────────────────
--
-- Same reasoning as rentals: checking availability in application code is a
-- race. Two salespeople booking the same car for 2pm Saturday both pass a
-- "is it free?" query before either writes, and two customers turn up.
--
-- Cancelled and no-show appointments are excluded so dead bookings never block
-- a real one.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_vehicle_overlap"
  EXCLUDE USING gist (
    "vehicle_id" WITH =,
    "period"     WITH &&
  ) WHERE (status IN ('scheduled', 'confirmed') AND vehicle_id IS NOT NULL);
--> statement-breakpoint

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_period_not_empty"
  CHECK (NOT isempty("period") AND lower("period") < upper("period"));
--> statement-breakpoint

-- ── 2. Deals are bound to their market's currency ──────────────────────────
ALTER TABLE "deals"
  ADD CONSTRAINT "deals_currency_matches_market"
  CHECK (
    (market_code = 'us' AND currency = 'USD') OR
    (market_code = 'ng' AND currency = 'NGN')
  );
--> statement-breakpoint

-- ── 3. Money sanity ────────────────────────────────────────────────────────
--
-- Every amount is non-negative EXCEPT nothing here: negative equity is
-- represented by payoff exceeding allowance, both of which stay positive.
-- A negative price or fee is always a data-entry error.
ALTER TABLE "deals"
  ADD CONSTRAINT "deals_money_non_negative"
  CHECK (
    vehicle_price_minor        >= 0 AND
    trade_in_allowance_minor   >= 0 AND
    trade_in_payoff_minor      >= 0 AND
    down_payment_minor         >= 0 AND
    tax_minor                  >= 0 AND
    total_minor                >= 0 AND
    (amount_financed_minor IS NULL OR amount_financed_minor >= 0) AND
    (monthly_payment_minor IS NULL OR monthly_payment_minor >= 0)
  );
--> statement-breakpoint

-- Rates are basis points. 10000 bps = 100%; anything beyond is a typo
-- (someone entering 7.9 as 790 vs 79000 is the classic slip).
ALTER TABLE "deals"
  ADD CONSTRAINT "deals_rates_sane"
  CHECK (
    tax_rate_bps BETWEEN 0 AND 10000 AND
    (apr_bps IS NULL OR apr_bps BETWEEN 0 AND 10000) AND
    (term_months IS NULL OR term_months BETWEEN 1 AND 120)
  );
--> statement-breakpoint

-- ── 4. Stage integrity ─────────────────────────────────────────────────────
--
-- A delivered deal must have been contracted first. Without this, a mis-click
-- can mark a car delivered with no signed paperwork behind it — and delivery
-- is what marks the vehicle sold and moves the public sold counter.
ALTER TABLE "deals"
  ADD CONSTRAINT "deals_delivery_requires_contract"
  CHECK (status <> 'delivered' OR contracted_at IS NOT NULL);
--> statement-breakpoint

ALTER TABLE "deals"
  ADD CONSTRAINT "deals_financed_requires_terms"
  CHECK (
    NOT is_financed OR (apr_bps IS NOT NULL AND term_months IS NOT NULL)
  );
--> statement-breakpoint

ALTER TABLE "deals"
  ADD CONSTRAINT "deals_lost_requires_reason"
  CHECK (status <> 'lost' OR lost_reason IS NOT NULL);
--> statement-breakpoint

-- ── 5. updated_at maintains itself ─────────────────────────────────────────
CREATE TRIGGER deals_set_updated_at
  BEFORE UPDATE ON "deals"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

CREATE TRIGGER appointments_set_updated_at
  BEFORE UPDATE ON "appointments"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
