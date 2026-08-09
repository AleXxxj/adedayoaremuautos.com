-- Finance ledger invariants.

-- ── 1. Currency is bound to the market, as everywhere else ─────────────────
ALTER TABLE "finance_agreements"
  ADD CONSTRAINT "agreements_currency_matches_market"
  CHECK (
    (market_code = 'us' AND currency = 'USD') OR
    (market_code = 'ng' AND currency = 'NGN')
  );
--> statement-breakpoint

-- ── 2. Terms must be sane ──────────────────────────────────────────────────
ALTER TABLE "finance_agreements"
  ADD CONSTRAINT "agreements_terms_sane"
  CHECK (
    principal_minor > 0 AND
    apr_bps BETWEEN 0 AND 10000 AND
    term_months BETWEEN 1 AND 120 AND
    regular_payment_minor > 0 AND
    total_interest_minor >= 0
  );
--> statement-breakpoint

-- ── 3. Instalment arithmetic ───────────────────────────────────────────────
--
-- Each row must be internally consistent: what the customer pays is the
-- interest plus the principal, with nothing unaccounted for. Enforced per row
-- so a bad write cannot produce a schedule that does not foot.
ALTER TABLE "instalments"
  ADD CONSTRAINT "instalments_amount_is_interest_plus_principal"
  CHECK (amount_minor = interest_minor + principal_minor);
--> statement-breakpoint

ALTER TABLE "instalments"
  ADD CONSTRAINT "instalments_non_negative"
  CHECK (
    number > 0 AND
    amount_minor >= 0 AND
    interest_minor >= 0 AND
    principal_minor >= 0 AND
    balance_after_minor >= 0 AND
    paid_minor >= 0
  );
--> statement-breakpoint

-- A customer cannot pay more into one instalment than it is worth; surplus
-- belongs to the next instalment. Without this, an over-allocation silently
-- hides arrears elsewhere in the schedule.
ALTER TABLE "instalments"
  ADD CONSTRAINT "instalments_no_overpayment"
  CHECK (paid_minor <= amount_minor);
--> statement-breakpoint

-- State and money must agree. A row marked paid with money outstanding is the
-- bug that makes a ledger untrustworthy.
ALTER TABLE "instalments"
  ADD CONSTRAINT "instalments_state_matches_money"
  CHECK (
    (state = 'paid'    AND paid_minor = amount_minor) OR
    (state = 'partial' AND paid_minor > 0 AND paid_minor < amount_minor) OR
    (state IN ('due', 'late') AND paid_minor < amount_minor) OR
    (state = 'written_off')
  );
--> statement-breakpoint

-- ── 4. Payments ────────────────────────────────────────────────────────────
ALTER TABLE "finance_payments"
  ADD CONSTRAINT "finance_payments_positive"
  CHECK (amount_minor > 0);
--> statement-breakpoint

-- ── 5. Settlement integrity ────────────────────────────────────────────────
ALTER TABLE "finance_agreements"
  ADD CONSTRAINT "agreements_settled_has_date"
  CHECK (status <> 'settled' OR settled_at IS NOT NULL);
--> statement-breakpoint

CREATE TRIGGER finance_agreements_set_updated_at
  BEFORE UPDATE ON "finance_agreements"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
