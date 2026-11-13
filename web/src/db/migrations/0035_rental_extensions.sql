-- "Keep it another week": a renter asks for more days from their own booking
-- page, and staff approve or decline.
--
-- A request holds nothing. Approving it is one UPDATE that lengthens the
-- booking's own period, and rental_bookings_no_overlap checks that UPDATE the
-- way it checks every other one. So the rule that stops two renters having
-- one car is still the constraint, never this table and never a check made in
-- application code.
--
-- Nothing is added to rental_bookings: the site reads that table on nearly
-- every rental screen, and a column the code expects before this file is
-- applied would break them all.
CREATE TABLE IF NOT EXISTS rental_extension_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES rental_bookings(id) ON DELETE CASCADE,
  market_code market_code NOT NULL REFERENCES markets(code),
  -- The return date the booking had when the renter asked. Approval is
  -- refused if the booking has moved since, so an old request can never be
  -- applied on top of dates it was not priced for.
  from_end timestamptz NOT NULL,
  new_end timestamptz NOT NULL,
  added_days integer NOT NULL,
  -- What the renter was shown, priced by the tariff functions on the server.
  added_minor bigint NOT NULL,
  added_cover_minor bigint NOT NULL DEFAULT 0,
  new_total_minor bigint NOT NULL,
  currency currency_code NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  decided_at timestamptz,
  decided_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_extension_requests_status_check
    CHECK (status IN ('pending', 'approved', 'declined')),
  CONSTRAINT rental_extension_requests_longer_check
    CHECK (new_end > from_end AND added_days > 0),
  CONSTRAINT rental_extension_requests_amounts_check
    CHECK (
      added_minor >= 0
      AND added_cover_minor >= 0
      AND added_cover_minor <= added_minor
      AND new_total_minor >= added_minor
    ),
  CONSTRAINT rental_extension_requests_decided_check
    CHECK ((status = 'pending') = (decided_at IS NULL))
);
--> statement-breakpoint

-- One open request per booking: a second tap, or a second phone, cannot queue
-- two answers for staff to give.
CREATE UNIQUE INDEX IF NOT EXISTS rental_extension_requests_one_pending_idx
  ON rental_extension_requests (booking_id)
  WHERE status = 'pending';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS rental_extension_requests_booking_idx
  ON rental_extension_requests (booking_id, created_at);
--> statement-breakpoint

-- The reminder two days before return, sent once per return date. The key is
-- what stops a second run of the scheduler mailing the same renter twice.
CREATE TABLE IF NOT EXISTS rental_extension_reminders (
  booking_id uuid NOT NULL REFERENCES rental_bookings(id) ON DELETE CASCADE,
  return_date date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, return_date)
);
