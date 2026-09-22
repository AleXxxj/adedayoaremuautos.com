-- Paying for a rental online.
--
-- Two things are needed: somewhere to record each payment attempt, and a way
-- to hold the dates while the customer is at the checkout.
--
-- The hold is the important half. Until now the exclusion constraint covered
-- only confirmed and active bookings, which was right when a human confirmed
-- availability. Taking money changes it: a customer is away on a payment page
-- for minutes, and without a hold a second customer can confirm the same week
-- in the meantime. The business would then have taken money for a car it
-- cannot supply — the single worst outcome this system can produce, and the
-- one that a refund does not really fix.
--
-- No new status value. Extending booking_status would mean ALTER TYPE followed
-- by a constraint referencing the new value, and Postgres will not let a value
-- added in a transaction be used in that same transaction. A column the
-- predicate can read avoids the problem entirely and says the same thing.

ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS payment_hold_until timestamptz;

COMMENT ON COLUMN rental_bookings.payment_hold_until IS
  'While set, this quote holds its dates against other bookings. Cleared when payment completes, fails, or the hold expires.';

-- Recreated rather than altered: a predicate is part of the constraint.
ALTER TABLE rental_bookings DROP CONSTRAINT IF EXISTS rental_bookings_no_overlap;

ALTER TABLE rental_bookings
  ADD CONSTRAINT rental_bookings_no_overlap
  EXCLUDE USING gist (
    vehicle_id WITH =,
    period     WITH &&
  ) WHERE (
    status IN ('confirmed', 'active')
    OR (status = 'quote' AND payment_hold_until IS NOT NULL)
  );

-- Finding holds that have run out, to release them.
CREATE INDEX IF NOT EXISTS rental_bookings_hold_idx
  ON rental_bookings (payment_hold_until)
  WHERE payment_hold_until IS NOT NULL;


-- Every payment attempt, successful or not.
--
-- Separate from the booking because a booking can be paid for more than once:
-- a first attempt abandoned at the checkout, a second that succeeds, a refund
-- later. Collapsing that into columns on the booking loses the history exactly
-- when somebody is asking what happened to their money.
CREATE TYPE payment_provider AS ENUM ('stripe', 'paystack');
CREATE TYPE payment_status   AS ENUM ('pending', 'paid', 'failed', 'expired', 'refunded');

CREATE TABLE IF NOT EXISTS rental_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      uuid NOT NULL REFERENCES rental_bookings(id) ON DELETE CASCADE,
  market_code     market_code NOT NULL REFERENCES markets(code),

  provider        payment_provider NOT NULL,
  -- The provider's own id for this attempt: a Stripe session or a Paystack
  -- reference. Unique, because it is what a webhook arrives carrying, and a
  -- webhook is delivered more than once by design.
  provider_ref    text NOT NULL,

  amount_minor    bigint NOT NULL CHECK (amount_minor > 0),
  currency        currency_code NOT NULL,
  status          payment_status NOT NULL DEFAULT 'pending',

  paid_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rental_payments_provider_ref_unique
  ON rental_payments (provider, provider_ref);

CREATE INDEX IF NOT EXISTS rental_payments_booking_idx
  ON rental_payments (booking_id, created_at DESC);

CREATE TRIGGER rental_payments_set_updated_at
  BEFORE UPDATE ON rental_payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
