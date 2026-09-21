-- Where a campaign came from.
--
-- Everything so far was written by a person in the composer. The weekly digest
-- writes campaigns too, and they need to be told apart for two reasons: the
-- history should say which is which, and the digest has to be able to ask "has
-- one already gone out this week" before sending another. Matching on the
-- subject line would work until somebody edited the wording.

CREATE TYPE campaign_kind AS ENUM ('manual', 'weekly_digest');

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS kind campaign_kind NOT NULL DEFAULT 'manual';

-- The digest asks "was there one for this market recently", which is this.
CREATE INDEX IF NOT EXISTS campaigns_kind_market_idx
  ON campaigns (kind, market_code, created_at DESC);
