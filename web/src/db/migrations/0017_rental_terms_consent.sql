-- What the renter accepted, and when.
--
-- The booking form asked for dates, a name and a phone number and nothing
-- else: a customer could request a vehicle without ever being shown the terms
-- they would be held to. Consent that was never collected cannot be evidenced,
-- and clause 4 in particular — the renter confirming their own insurance covers
-- delivery work — is worth nothing if nobody can show it was put to them.
--
-- The version is stored, not just the timestamp. Terms change; the question
-- months later is never "what do the terms say" but "what did this person
-- agree to", and only a recorded version answers that.
ALTER TABLE "rental_bookings"
  ADD COLUMN IF NOT EXISTS "terms_version" text;

ALTER TABLE "rental_bookings"
  ADD COLUMN IF NOT EXISTS "terms_accepted_at" timestamptz;

-- Recorded together or not at all. A timestamp with no version cannot be
-- resolved to any wording, and a version with no timestamp is not consent.
ALTER TABLE "rental_bookings"
  DROP CONSTRAINT IF EXISTS "rental_bookings_terms_pair";
ALTER TABLE "rental_bookings"
  ADD CONSTRAINT "rental_bookings_terms_pair" CHECK (
    ("terms_version" IS NULL) = ("terms_accepted_at" IS NULL)
  );
