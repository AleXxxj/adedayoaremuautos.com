-- Holding a car for sale with a small refundable deposit.
--
-- One row per attempt. A row starts as 'checkout' when the buyer is sent to
-- Stripe's hosted page, and only a payment Stripe itself confirms can turn it
-- into a hold. No card detail is stored: provider_ref is Stripe's id for the
-- checkout and payment_ref its id for the payment, which is what the admin
-- links to. The app never refunds; deposit_state is a record of what a member
-- of staff did in Stripe.
--
--   checkout   at Stripe's page, not paid
--   abandoned  the checkout ran out unpaid (kept a few days in case Stripe
--              reports a late payment, then deleted)
--   active     paid, and the car is held until held_until
--   expired    the time ran out
--   released   staff ended it early; the car went back on sale
--   completed  the deposit went toward the sale; the car stays pending
--   conflict   paid, but the car could not be held: staff must refund

CREATE TABLE IF NOT EXISTS sale_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles (id) ON DELETE RESTRICT,
  market_code market_code NOT NULL REFERENCES markets (code),
  status text NOT NULL DEFAULT 'checkout'
    CHECK (status IN ('checkout', 'abandoned', 'active', 'expired', 'released', 'completed', 'conflict')),

  buyer_name text NOT NULL,
  buyer_phone text NOT NULL,
  buyer_email text,

  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency currency_code NOT NULL,
  hold_hours integer NOT NULL CHECK (hold_hours > 0),

  -- Which wording the buyer agreed to, and when.
  terms_version text NOT NULL,
  terms_accepted_at timestamptz NOT NULL,

  provider payment_provider NOT NULL DEFAULT 'stripe',
  provider_ref text,
  payment_ref text,
  livemode boolean,

  paid_at timestamptz,
  held_until timestamptz,
  ended_at timestamptz,
  ended_by uuid REFERENCES staff (id),

  deposit_state text CHECK (deposit_state IN ('held', 'refunded', 'applied')),
  deposit_marked_at timestamptz,
  deposit_marked_by uuid REFERENCES staff (id),

  lead_id uuid REFERENCES leads (id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Paid rows say when and where the money is; unpaid rows say neither.
  CONSTRAINT sale_holds_paid_is_recorded CHECK (
    (status IN ('checkout', 'abandoned')) = (paid_at IS NULL)
    AND (paid_at IS NULL) = (deposit_state IS NULL)
  ),
  CONSTRAINT sale_holds_active_has_end CHECK (status <> 'active' OR held_until IS NOT NULL)
);
--> statement-breakpoint

-- One hold per car. The rule the whole feature rests on, so the database
-- keeps it: a second paid hold on the same car is refused here, whatever the
-- code above it does.
CREATE UNIQUE INDEX IF NOT EXISTS sale_holds_one_active_per_vehicle
  ON sale_holds (vehicle_id) WHERE status = 'active';
--> statement-breakpoint

-- One buyer at the checkout per car, so two people are not both sent to pay
-- for the same hold.
CREATE UNIQUE INDEX IF NOT EXISTS sale_holds_one_checkout_per_vehicle
  ON sale_holds (vehicle_id) WHERE status = 'checkout';
--> statement-breakpoint

-- Stripe delivers the same event more than once; a checkout is one row.
CREATE UNIQUE INDEX IF NOT EXISTS sale_holds_provider_ref_unique
  ON sale_holds (provider, provider_ref) WHERE provider_ref IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS sale_holds_status_idx ON sale_holds (status, held_until);
