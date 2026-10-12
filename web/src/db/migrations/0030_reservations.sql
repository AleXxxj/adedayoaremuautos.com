-- Reserving a car without paying for it yet.
--
-- Both paths already existed in form: request the car, then optionally pay.
-- What did not exist was the half that matters — the unpaid request held
-- nothing. The exclusion constraint covers confirmed bookings and a quote
-- that is mid-checkout, so a customer who "reserved" a car and drove over to
-- look at it could arrive to find it booked by somebody else. A reservation
-- that reserves nothing is worse than no reservation, because the customer
-- made a journey on the strength of it.
--
-- Some people will not pay for a car they have not seen. That is not a flaw
-- in them, and the answer is not to insist: it is to hold the car for long
-- enough that they can come and look, and take payment when they are standing
-- in front of it.
--
-- The hold is the existing payment_hold_until column, deliberately. It already
-- means "this quote holds its dates", the exclusion constraint already reads
-- it, and the sweep that releases expired ones already exists. A second column
-- meaning almost the same thing is how the two drift apart and a car ends up
-- held by one and free by the other.
--
-- Time-limited, because a free hold that never expires lets one person who
-- changes their mind block a paying customer indefinitely. It expires on its
-- own, and staff can extend it when somebody rings to say they are coming
-- Saturday.

-- How a customer gets back to their own booking to pay for it.
--
-- Random rather than the booking id: the id appears in staff URLs and logs,
-- and this one travels by email and may be forwarded or left open on a phone.
-- It unlocks a page showing the vehicle, the dates and the amount — never the
-- renter's name, licence or documents.
ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS reservation_token text;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS rental_bookings_reservation_token_idx
  ON rental_bookings (reservation_token)
  WHERE reservation_token IS NOT NULL;
--> statement-breakpoint

-- When the customer was told the hold runs out. Stored separately from
-- payment_hold_until, which moves: starting a checkout extends the hold, and
-- an abandoned checkout must not leave the customer with less time than the
-- email promised them.
ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS reserved_until timestamptz;
--> statement-breakpoint

-- The counter queue: cars being held for someone who has not paid, soonest to
-- expire first. This is the list worth looking at before promising a car to
-- anybody on the phone.
CREATE INDEX IF NOT EXISTS rental_bookings_reserved_idx
  ON rental_bookings (reserved_until)
  WHERE reserved_until IS NOT NULL AND status = 'quote';
