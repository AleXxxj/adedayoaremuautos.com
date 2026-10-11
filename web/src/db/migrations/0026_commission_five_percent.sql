-- The programme rate becomes 5%.
--
-- 1.5% was inherited from the original site, where it was a number on a
-- marketing panel with no programme behind it. 5% is the rate the business is
-- actually offering now that there is one.
--
-- Two separate things change, and only one of them is the default:
--
--   * The column default, which decides what a NEW application starts on.
--   * The rate on the partners who already exist, who would otherwise stay on
--     1.5% for ever while the page they signed up from advertised 5%.
--
-- Existing partners are moved only if they are still on the old default. A
-- rate the owner has deliberately set — a volume partner on 7%, say — is that
-- owner's decision and a migration has no business overwriting it.
--
-- Nothing retrospective happens to money. Every partner_earnings row stores
-- the rate that applied when it was earned, precisely so that changing this
-- cannot rewrite what somebody was already told they were owed.

ALTER TABLE referral_partners
  ALTER COLUMN commission_bps SET DEFAULT 500;
--> statement-breakpoint

UPDATE referral_partners
   SET commission_bps = 500
 WHERE commission_bps = 150;
