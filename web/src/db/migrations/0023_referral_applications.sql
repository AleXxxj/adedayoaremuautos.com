-- Turning the referral programme into something with a front door.
--
-- Until now anyone could sign up and was active immediately. That was the
-- right call while a code only tagged an enquiry: it moved no money, so an
-- approval step would have cost referrals and bought nothing.
--
-- Paying people changes it. A partner who will be owed commission is someone
-- the business has agreed terms with, so there is now an application, a
-- decision, and only then a live code.
--
-- Existing partners are untouched and stay active: they were approved by the
-- old rules and re-reviewing them would switch off codes already in use.

ALTER TYPE referral_partner_status ADD VALUE IF NOT EXISTS 'pending';
--> statement-breakpoint
ALTER TYPE referral_partner_status ADD VALUE IF NOT EXISTS 'approved';
--> statement-breakpoint
ALTER TYPE referral_partner_status ADD VALUE IF NOT EXISTS 'declined';
--> statement-breakpoint

ALTER TABLE referral_partners
  -- Who they are, beyond a name and a number. None of this is a government
  -- identifier: the same rule that keeps SSN and BVN off this site applies
  -- here, and a dealership does not need someone's ID number to pay them a
  -- finder's fee.
  ADD COLUMN IF NOT EXISTS business_name     text,
  ADD COLUMN IF NOT EXISTS city              text,
  -- Their case for the partnership, in their own words. This is the part a
  -- human actually reads when deciding.
  ADD COLUMN IF NOT EXISTS proposal          text,
  ADD COLUMN IF NOT EXISTS website           text,

  ADD COLUMN IF NOT EXISTS applied_at        timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by_email text,
  -- Said to the applicant, so a decline is a reason rather than silence.
  ADD COLUMN IF NOT EXISTS decline_reason    text;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS referral_partners_status_idx
  ON referral_partners (status, applied_at DESC);
--> statement-breakpoint

-- A rental can be referred too.
--
-- Commission was only ever recorded against a sale, so a partner who sent a
-- customer who hired a car for a week earned nothing the system could see.
-- Rentals are also where the programme starts, because paying a finder's fee
-- on a US vehicle sale is restricted in several states and needs a lawyer
-- first; hire has no such problem.
ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS referral_partner_id uuid REFERENCES referral_partners(id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS rental_bookings_partner_idx
  ON rental_bookings (referral_partner_id)
  WHERE referral_partner_id IS NOT NULL;
