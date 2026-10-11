-- Eligibility documents, and the damage waiver.
--
-- Until now a hire needed no documents at all: the licence photo and the
-- licence number were both optional, and the terms had the renter *represent*
-- that they held insurance — a sentence nobody ever checked. A renter could
-- book, pay online, and the webhook would mark the booking confirmed without
-- a human having seen anything.
--
-- Two things change.
--
-- 1. Proof. A licence document and, for renters using their own cover, proof
--    of insurance. Both land in the same private bucket the licence already
--    used, viewable only through a signed link that expires in minutes.
--
-- 2. A choice, priced. Either the renter shows their own insurance, or they
--    take our damage waiver and pay a daily fee for it.
--
-- The waiver is deliberately NOT called insurance. Selling insurance in the
-- United States requires a licence — North Carolina has a limited lines
-- licence for rental companies — whereas a damage waiver is a contract term:
-- the business agreeing not to pursue the renter for damage to its own
-- vehicle. The customer-facing wording says in plain words that it is not
-- insurance, and proof of the renter's own liability cover is still required
-- either way, because a waiver protects our car and not a third party.

-- Per vehicle, beside the rest of the tariff, so staff set it where they
-- already set the daily rate.
--
-- NULL means the waiver is not offered on this vehicle, and that is the
-- deliberate default: a vehicle whose fee nobody has set must not quietly
-- hand out free cover. Fail closed.
ALTER TABLE rental_rates
  ADD COLUMN IF NOT EXISTS waiver_daily_minor bigint
    CHECK (waiver_daily_minor IS NULL OR waiver_daily_minor > 0);
--> statement-breakpoint

CREATE TYPE rental_insurance_choice AS ENUM (
  'own',    -- the renter shows their own policy
  'waiver'  -- the renter takes our damage waiver and pays for it
);
--> statement-breakpoint

ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS insurance_choice rental_insurance_choice,

  -- The rate as it stood when the booking was made, and the total it came to.
  -- Stored rather than recomputed for the same reason commission is: changing
  -- the fee next month must not restate what this customer agreed to pay.
  ADD COLUMN IF NOT EXISTS waiver_daily_minor bigint,
  ADD COLUMN IF NOT EXISTS waiver_total_minor bigint NOT NULL DEFAULT 0,

  -- Proof of the renter's own cover. A storage key, never a URL — the same
  -- rule the licence follows, because a stored URL is either permanently
  -- public or permanently broken, and the first is somebody's policy document
  -- on an address anyone could guess.
  ADD COLUMN IF NOT EXISTS insurance_storage_key text,
  ADD COLUMN IF NOT EXISTS insurance_uploaded_at timestamptz,
  -- Typed alternatives, for a renter who would rather read them out than
  -- photograph the certificate. Not a substitute for the document at pickup.
  ADD COLUMN IF NOT EXISTS insurance_provider text,
  ADD COLUMN IF NOT EXISTS insurance_policy_no text,

  -- The verification gate.
  --
  -- Payment confirms the dates; it does not confirm the person. Without this,
  -- requiring documents is decorative: money arrives, the booking goes
  -- confirmed, and nobody has established that the licence is real or current.
  -- Keys are not handed over until this is set.
  ADD COLUMN IF NOT EXISTS documents_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS documents_verified_by_email text,
  ADD COLUMN IF NOT EXISTS documents_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS documents_rejected_reason text;
--> statement-breakpoint

-- A waiver booking has to carry the rate it was priced at, or the amount on
-- the invoice cannot be explained to the person who paid it.
ALTER TABLE rental_bookings
  ADD CONSTRAINT rental_bookings_waiver_has_rate
    CHECK (insurance_choice <> 'waiver' OR waiver_daily_minor IS NOT NULL);
--> statement-breakpoint

-- Charged for the waiver exactly when the waiver was taken. This is the one
-- that stops a renter using their own insurance being billed for cover they
-- declined, and stops a waiver being handed out free.
ALTER TABLE rental_bookings
  ADD CONSTRAINT rental_bookings_waiver_charge_matches_choice
    CHECK (
      (insurance_choice = 'waiver' AND waiver_total_minor > 0)
      OR (insurance_choice IS DISTINCT FROM 'waiver' AND waiver_total_minor = 0)
    );
--> statement-breakpoint

ALTER TABLE rental_bookings
  ADD CONSTRAINT rental_bookings_waiver_total_sane
    CHECK (waiver_total_minor >= 0);
--> statement-breakpoint

-- A rejection needs a reason, because it is said to the customer. A booking
-- cannot be both checked and refused.
ALTER TABLE rental_bookings
  ADD CONSTRAINT rental_bookings_rejection_has_reason
    CHECK ((documents_rejected_at IS NULL) = (documents_rejected_reason IS NULL));
--> statement-breakpoint

ALTER TABLE rental_bookings
  ADD CONSTRAINT rental_bookings_not_verified_and_rejected
    CHECK (documents_verified_at IS NULL OR documents_rejected_at IS NULL);
--> statement-breakpoint

-- The staff queue: paid and waiting on a document check, oldest first. This is
-- the list somebody works through each morning.
CREATE INDEX IF NOT EXISTS rental_bookings_awaiting_docs_idx
  ON rental_bookings (created_at)
  WHERE documents_verified_at IS NULL
    AND documents_rejected_at IS NULL
    AND status IN ('confirmed', 'active');
