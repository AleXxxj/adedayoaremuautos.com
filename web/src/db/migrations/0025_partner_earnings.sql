-- What a partner is owed, and how they ask for it.
--
-- The site promises "track your referrals easily" and until now the admin
-- worked out commission on the fly by multiplying delivered deal values by a
-- rate. That is fine for a figure on a screen and useless as a record: it
-- recomputes history every time the rate changes, it cannot express a
-- commission that was paid and then charged back, and it cannot tell anybody
-- what has actually been handed over.
--
-- So earnings become rows. One row per booking or deal, written when the money
-- clears, carrying the rate that applied at that moment.
--
-- Deliberately NOT a wallet. The partner-facing wording is "earnings" and
-- "request a payout", never a balance they top up or withdraw from, because
-- holding customer funds on someone's behalf is money transmission and in the
-- United States that is a licensing question nobody wants to have answered for
-- them. The figure here is a record of a debt the business owes, which is an
-- ordinary trade payable.
--
-- No bank or payout details, here or anywhere. A payout request says how much;
-- how it is actually paid is arranged with the partner directly, the same rule
-- that keeps account numbers, SSN and BVN off this site entirely.

CREATE TYPE partner_payout_state AS ENUM (
  'requested',  -- the partner has asked
  'approved',   -- agreed, not yet sent
  'paid',       -- money gone, reference recorded
  'rejected'    -- declined, with a reason
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS partner_payouts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id      uuid NOT NULL REFERENCES referral_partners(id) ON DELETE CASCADE,
  market_code     market_code NOT NULL REFERENCES markets(code),

  amount_minor    bigint NOT NULL CHECK (amount_minor > 0),
  currency        currency_code NOT NULL,
  state           partner_payout_state NOT NULL DEFAULT 'requested',

  -- Whatever the partner wants to say about it. Explicitly not a field for
  -- account details: the form that feeds it says so, and the admin shows it
  -- as a note rather than as payment instructions.
  note            text,

  requested_at    timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz,
  decided_by_email text,
  paid_at         timestamptz,
  -- The business's own reference for the transfer, typed in by whoever made
  -- it. This is what turns "we paid you" into something checkable.
  reference       text,
  reject_reason   text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- A paid payout with no date, or a date and no payment, is a row that lies
  -- about whether somebody has their money.
  CONSTRAINT partner_payouts_paid_has_date
    CHECK ((state = 'paid') = (paid_at IS NOT NULL)),
  CONSTRAINT partner_payouts_rejected_has_reason
    CHECK (state <> 'rejected' OR reject_reason IS NOT NULL)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS partner_payouts_partner_idx
  ON partner_payouts (partner_id, requested_at DESC);
--> statement-breakpoint

-- The owner's queue: everything waiting on a decision, oldest first.
CREATE INDEX IF NOT EXISTS partner_payouts_open_idx
  ON partner_payouts (requested_at)
  WHERE state IN ('requested', 'approved');
--> statement-breakpoint

CREATE TRIGGER partner_payouts_set_updated_at
  BEFORE UPDATE ON partner_payouts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

CREATE TYPE partner_earning_source AS ENUM ('rental', 'sale');
--> statement-breakpoint

CREATE TYPE partner_earning_state AS ENUM (
  'pending',    -- the deal is on, the money has not cleared
  'confirmed',  -- earned, payable
  'cancelled',  -- the booking or sale fell through, or was refunded
  'paid'        -- settled through a payout
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS partner_earnings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id      uuid NOT NULL REFERENCES referral_partners(id) ON DELETE CASCADE,
  market_code     market_code NOT NULL REFERENCES markets(code),

  source          partner_earning_source NOT NULL,
  -- Exactly one of these. A commission that points at both a booking and a
  -- sale, or at neither, is not a commission anybody can check.
  rental_booking_id uuid REFERENCES rental_bookings(id) ON DELETE SET NULL,
  deal_id         uuid REFERENCES deals(id) ON DELETE SET NULL,

  -- What the customer paid, and the rate as it stood at that moment. Stored
  -- rather than looked up: raising a partner's rate must not retrospectively
  -- increase what they were owed on last month's bookings.
  basis_minor     bigint NOT NULL CHECK (basis_minor >= 0),
  commission_bps  integer NOT NULL CHECK (commission_bps BETWEEN 0 AND 2000),
  amount_minor    bigint NOT NULL CHECK (amount_minor >= 0),
  currency        currency_code NOT NULL,

  state           partner_earning_state NOT NULL DEFAULT 'pending',
  payout_id       uuid REFERENCES partner_payouts(id) ON DELETE SET NULL,

  -- Said to the partner on their own dashboard, so a cancelled commission is
  -- a reason rather than a figure that quietly shrank.
  note            text,

  confirmed_at    timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT partner_earnings_one_source CHECK (
    (rental_booking_id IS NOT NULL)::int + (deal_id IS NOT NULL)::int = 1
  ),
  -- The source column and the thing it points at have to agree, or a rental
  -- commission can be filed under sales and the split by source is fiction.
  CONSTRAINT partner_earnings_source_matches CHECK (
    (source = 'rental' AND rental_booking_id IS NOT NULL)
    OR (source = 'sale' AND deal_id IS NOT NULL)
  ),
  -- Only settled money belongs to a payout. Attaching a pending commission to
  -- one is how a partner gets paid for a booking that never happened.
  CONSTRAINT partner_earnings_payout_only_when_paid CHECK (
    payout_id IS NULL OR state = 'paid'
  ),
  CONSTRAINT partner_earnings_confirmed_has_date CHECK (
    state NOT IN ('confirmed', 'paid') OR confirmed_at IS NOT NULL
  ),
  CONSTRAINT partner_earnings_cancelled_has_date CHECK (
    (state = 'cancelled') = (cancelled_at IS NOT NULL)
  )
);
--> statement-breakpoint

-- One commission per booking and per deal, enforced by the database.
--
-- This is the constraint that matters most. The webhook that confirms a rental
-- payment is delivered more than once by design, and the admin can mark a deal
-- delivered, undo it and do it again. Without these, each of those pays the
-- partner twice.
CREATE UNIQUE INDEX IF NOT EXISTS partner_earnings_booking_unique
  ON partner_earnings (rental_booking_id)
  WHERE rental_booking_id IS NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS partner_earnings_deal_unique
  ON partner_earnings (deal_id)
  WHERE deal_id IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS partner_earnings_partner_idx
  ON partner_earnings (partner_id, state, created_at DESC);
--> statement-breakpoint

CREATE TRIGGER partner_earnings_set_updated_at
  BEFORE UPDATE ON partner_earnings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- The partner's own login.
--
-- A Supabase auth user, the same as staff, but staff membership is a row in
-- `staff` and partnership is this column — so being one has never implied
-- being the other. A partner who finds /admin is not staff and gets nowhere.
ALTER TABLE referral_partners
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS account_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS referral_partners_user_idx
  ON referral_partners (user_id)
  WHERE user_id IS NOT NULL;
