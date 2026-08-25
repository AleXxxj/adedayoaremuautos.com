-- ─────────────────────────────────────────────────────────────────────────
-- The terms that vary per rental agreement.
--
-- The agreement the business drew up by hand left the rate, the total and the
-- deposit as blank lines to be written in — while the booking that produced it
-- already knew all three. Everything below is the rest of what the document
-- states but the booking did not yet hold, so the whole page can be produced
-- from the record instead of retyped for each renter.
-- ─────────────────────────────────────────────────────────────────────────

-- The name on the licence, which is not always the name someone books under:
-- the booking said "Telly Mccoy" and the agreement had to read "TELLY SAVALAS
-- MCCOY JR". A contract names the person, not their shorthand.
ALTER TABLE "rental_bookings"
  ADD COLUMN IF NOT EXISTS "renter_legal_name" text;

-- "DoorDash / gig delivery and personal use". This one matters more than it
-- looks: it is what clause 4 hangs on, because personal motor policies commonly
-- exclude delivery and rideshare work, and the renter is being asked to confirm
-- cover for the use actually written here.
ALTER TABLE "rental_bookings"
  ADD COLUMN IF NOT EXISTS "authorized_use" text;

ALTER TABLE "rental_bookings"
  ADD COLUMN IF NOT EXISTS "mileage_allowance_per_day" integer;

ALTER TABLE "rental_bookings"
  ADD COLUMN IF NOT EXISTS "excess_mile_rate_minor" bigint;

ALTER TABLE "rental_bookings"
  ADD COLUMN IF NOT EXISTS "pickup_location" text;

-- Recorded at handover and at return. Blank on the printed page until they
-- exist, because the point of those two lines is that somebody physically
-- looked at the dashboard — but once entered they are what excess mileage is
-- billed from, and that arithmetic should not live on a scrap of paper.
ALTER TABLE "rental_bookings"
  ADD COLUMN IF NOT EXISTS "start_odometer" integer;

ALTER TABLE "rental_bookings"
  ADD COLUMN IF NOT EXISTS "end_odometer" integer;

ALTER TABLE "rental_bookings"
  DROP CONSTRAINT IF EXISTS "rental_bookings_agreement_sane";
ALTER TABLE "rental_bookings"
  ADD CONSTRAINT "rental_bookings_agreement_sane" CHECK (
    ("mileage_allowance_per_day" IS NULL OR "mileage_allowance_per_day" >= 0)
    AND ("excess_mile_rate_minor" IS NULL OR "excess_mile_rate_minor" >= 0)
    AND ("start_odometer" IS NULL OR "start_odometer" >= 0)
    AND ("end_odometer" IS NULL OR "end_odometer" >= 0)
    -- A car cannot come back having travelled backwards.
    AND (
      "start_odometer" IS NULL
      OR "end_odometer" IS NULL
      OR "end_odometer" >= "start_odometer"
    )
  );
