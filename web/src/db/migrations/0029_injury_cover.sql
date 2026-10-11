-- What the business actually insures, and what it does not.
--
-- The previous migration modelled this as a damage waiver: the renter's own
-- insurance versus the business agreeing not to pursue them for damage to its
-- vehicle. That was a reasonable guess and it was the wrong product.
--
-- What the business actually has is a policy that covers the vehicle — if it
-- is hit, or hits something, that is insured. What it does not cover is the
-- renter's own injury. In North Carolina, an at-fault state with no mandatory
-- personal injury protection, a renter hurt in a crash they caused has nothing
-- from this policy paying their medical bills.
--
-- So there are three positions a renter can be in, not two:
--
--   own       they have their own insurance, and show it
--   company   they pay extra to be covered by ours for injury
--   declined  they have neither and accept that, knowingly
--
-- `declined` is a real, allowed choice and is expected to be the common one.
-- It is recorded rather than inferred from an absence, because the whole
-- value of the disclosure is being able to show afterwards that this person
-- was told and chose. An empty column proves nothing.
--
-- The columns are renamed rather than reused. Nothing in production had
-- written to them — no booking carried a choice and no vehicle carried a fee
-- — and leaving "waiver" in the name of a thing that is not a waiver is how
-- somebody later builds on a word that was never true.

ALTER TABLE rental_rates
  RENAME COLUMN waiver_daily_minor TO injury_cover_daily_minor;
--> statement-breakpoint

ALTER TABLE rental_bookings
  RENAME COLUMN waiver_daily_minor TO injury_cover_daily_minor;
--> statement-breakpoint

ALTER TABLE rental_bookings
  RENAME COLUMN waiver_total_minor TO injury_cover_total_minor;
--> statement-breakpoint

-- The old constraints name the old product; they are replaced below.
ALTER TABLE rental_bookings
  DROP CONSTRAINT IF EXISTS rental_bookings_waiver_has_rate,
  DROP CONSTRAINT IF EXISTS rental_bookings_waiver_charge_matches_choice,
  DROP CONSTRAINT IF EXISTS rental_bookings_waiver_total_sane;
--> statement-breakpoint

-- Rebuilt rather than extended. `waiver` describes a product the business does
-- not sell, and no row has ever held it, so there is nothing to preserve.
ALTER TABLE rental_bookings
  ALTER COLUMN insurance_choice DROP DEFAULT;
--> statement-breakpoint

ALTER TABLE rental_bookings
  ALTER COLUMN insurance_choice TYPE text USING insurance_choice::text;
--> statement-breakpoint

DROP TYPE IF EXISTS rental_insurance_choice;
--> statement-breakpoint

CREATE TYPE rental_insurance_choice AS ENUM (
  'own',      -- the renter shows their own policy
  'company',  -- the renter pays to be covered by ours for injury
  'declined'  -- the renter has neither and accepts that, knowingly
);
--> statement-breakpoint

ALTER TABLE rental_bookings
  ALTER COLUMN insurance_choice TYPE rental_insurance_choice
    USING insurance_choice::rental_insurance_choice;
--> statement-breakpoint

-- Charged exactly when the cover was bought. Stops a renter who is paying for
-- nothing, and stops cover being handed out free.
ALTER TABLE rental_bookings
  ADD CONSTRAINT rental_bookings_injury_charge_matches_choice
    CHECK (
      (insurance_choice = 'company' AND injury_cover_total_minor > 0)
      OR (insurance_choice IS DISTINCT FROM 'company' AND injury_cover_total_minor = 0)
    );
--> statement-breakpoint

ALTER TABLE rental_bookings
  ADD CONSTRAINT rental_bookings_injury_has_rate
    CHECK (insurance_choice <> 'company' OR injury_cover_daily_minor IS NOT NULL);
--> statement-breakpoint

ALTER TABLE rental_bookings
  ADD CONSTRAINT rental_bookings_injury_total_sane
    CHECK (injury_cover_total_minor >= 0);
--> statement-breakpoint

-- When they were told, in so many words, that their own injury is not covered.
--
-- Separate from `terms_accepted_at`, which covers the contract as a whole. A
-- disclosure buried in a list of twelve clauses is one nobody read; this is
-- its own tick on its own notice, and the timestamp is what makes it possible
-- to say so later. The wording itself is versioned by terms_version.
ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS injury_notice_ack_at timestamptz;
--> statement-breakpoint

-- The inline CHECK from the previous migration was auto-named after the old
-- column and keeps that name through a rename. A constraint whose name says
-- "waiver" on a product that is not a waiver is the error message somebody
-- reads at 11pm and misunderstands.
ALTER TABLE rental_rates
  RENAME CONSTRAINT rental_rates_waiver_daily_minor_check
                 TO rental_rates_injury_cover_daily_minor_check;
