-- The signed agreement.
--
-- An approval on its own is a dead end: the partner has been told yes and has
-- nothing to do next. This is the step between approved and active — they are
-- emailed a private link, read the terms, and either accept or decline.
--
-- The acceptance is recorded rather than assumed. If a commission is ever
-- disputed, the question is which wording the partner agreed to and when, and
-- "they clicked a button once" is not an answer. Version, timestamp and the
-- address it came from make it one.

ALTER TABLE referral_partners
  -- Random, single-purpose, and cleared once used. Not derived from the id:
  -- a guessable agreement link is a stranger accepting terms in someone
  -- else's name.
  ADD COLUMN IF NOT EXISTS agreement_token    text,
  ADD COLUMN IF NOT EXISTS agreement_sent_at  timestamptz,
  -- Which wording. Terms change; what they accepted does not.
  ADD COLUMN IF NOT EXISTS agreement_version  text,
  ADD COLUMN IF NOT EXISTS agreed_at          timestamptz,
  ADD COLUMN IF NOT EXISTS agreement_ip       text,
  ADD COLUMN IF NOT EXISTS agreement_declined_at timestamptz;
--> statement-breakpoint

-- Looked up on every visit to an agreement link, which is the one place a
-- stranger controls the input. Unique so a token can never match two rows.
CREATE UNIQUE INDEX IF NOT EXISTS referral_partners_agreement_token_idx
  ON referral_partners (agreement_token)
  WHERE agreement_token IS NOT NULL;
