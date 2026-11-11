-- Payments taken in person, at the counter.
--
-- Every real rental so far has been paid in person, and the system could not
-- record a single one: payment_provider allowed only the two online
-- processors. So the money the business actually takes was invisible to it,
-- and a referral partner whose renter paid cash could never earn — partner
-- commission is calculated from recorded payments (src/lib/partnerEarnings.ts),
-- and the agreement promises it on what the customer actually pays, whatever
-- the channel.
--
-- A counter payment is a rental_payments row like any other: status 'paid',
-- the amount, the currency. What it adds is how the money was taken and who
-- took it. Card details are never recorded — "card" means a card machine at
-- the counter, not a number typed into this system — and there is no field
-- for an account number of any kind.
--
-- provider_ref holds a key the staff member's browser generates for each
-- payment. The existing unique (provider, provider_ref) index then makes a
-- form resent over bad counter Wi-Fi record the money once, not twice.

ALTER TYPE payment_provider ADD VALUE IF NOT EXISTS 'counter';
--> statement-breakpoint

ALTER TABLE rental_payments
  ADD COLUMN method payment_method,
  ADD COLUMN recorded_by uuid REFERENCES staff (id);
--> statement-breakpoint

-- Compared as text on purpose. Postgres will not let a transaction use an
-- enum value it has just added, and the migrator applies every pending
-- migration in one transaction; `provider::text` reads the label without
-- using the new value, so this file applies in a single run.
-- Both or neither: a counter payment says how it was taken and who took it;
-- an online payment says neither, so nothing paid by card online can be
-- passed off as cash someone at the counter received.
ALTER TABLE rental_payments
  ADD CONSTRAINT rental_payments_counter_is_attributed
  CHECK (
    CASE WHEN provider::text = 'counter'
      THEN method IS NOT NULL AND recorded_by IS NOT NULL
      ELSE method IS NULL AND recorded_by IS NULL
    END
  );
--> statement-breakpoint

-- Cash, a card machine, or something else written on the note (a payment app,
-- say). Never a bank transfer or a check recorded as if it had cleared:
-- those take days, and this records money in hand.
ALTER TABLE rental_payments
  ADD CONSTRAINT rental_payments_counter_methods
  CHECK (method IS NULL OR method IN ('cash', 'card', 'other'));
