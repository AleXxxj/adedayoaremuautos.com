-- Two rates, because hire and sales are not the same business.
--
-- One rate was the original site's assumption, and it only held while the
-- programme was a marketing panel. 5% of a week's hire is a sensible finder's
-- fee; 5% of a $30,000 car is $1,500, which is a different kind of decision
-- entirely. So sales go back to the 1.5% the business has always advertised
-- and hire is the one that pays 5%.
--
-- `commission_bps` stays as the SALE rate rather than being renamed. The
-- column has meant exactly that since it was created — the original copy read
-- "1.5% of every sale you refer" — and renaming a live column to gain a prefix
-- costs a rewrite of every reader for no change in meaning.
--
-- Nothing retrospective. Every partner_earnings row carries the rate that
-- applied when it was earned, so neither of these defaults can reach back and
-- restate what a partner was already told they were owed.

ALTER TABLE referral_partners
  ADD COLUMN IF NOT EXISTS rental_commission_bps integer NOT NULL DEFAULT 500;
--> statement-breakpoint

ALTER TABLE referral_partners
  ADD CONSTRAINT referral_partners_rental_bps_sane
    CHECK (rental_commission_bps BETWEEN 0 AND 2000);
--> statement-breakpoint

-- Back to 1.5% for sales. The previous migration moved everybody to 5% when
-- that was the single programme rate; this is the half of it that was only
-- ever meant to apply to hire.
ALTER TABLE referral_partners
  ALTER COLUMN commission_bps SET DEFAULT 150;
--> statement-breakpoint

UPDATE referral_partners
   SET commission_bps = 150
 WHERE commission_bps = 500;
