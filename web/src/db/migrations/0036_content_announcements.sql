-- Which guides and articles have been announced to subscribers, and when.
--
-- Staff announce a new guide (US) or article (Nigeria) from the Broadcasts
-- screen. The email goes out as an ordinary campaign; this table is the
-- record that says "this one has been announced", so the screen can stop
-- offering it and a second press cannot send it twice.
--
-- No customer data: a market, a slug, the words that were sent, a link to the
-- campaign that carried them, and which member of staff pressed Send.
CREATE TABLE IF NOT EXISTS content_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code market_code NOT NULL REFERENCES markets(code),
  content_type text NOT NULL CHECK (content_type IN ('guide', 'article')),
  slug text NOT NULL,
  -- As announced. The guide's title can change later; this is what went out.
  title text NOT NULL,
  -- The one line staff may edit. The rest of the email is the guide's own words.
  intro text NOT NULL,
  -- The email campaign that carried it. NULL when it went by notification only.
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  -- Notification results. NULL when no notification was sent.
  push_sent integer CHECK (push_sent IS NULL OR push_sent >= 0),
  push_failed integer CHECK (push_failed IS NULL OR push_failed >= 0),
  -- True only when staff chose "Send again" on something already announced.
  send_again boolean NOT NULL DEFAULT false,
  announced_by uuid,
  announced_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- One first announcement per guide per market, enforced by the database: two
-- people pressing Send at the same moment produce one send, not two. A
-- deliberate "Send again" is a separate row and is not limited.
CREATE UNIQUE INDEX IF NOT EXISTS content_announcements_once
  ON content_announcements (market_code, content_type, slug)
  WHERE NOT send_again;
--> statement-breakpoint
-- The sender asks "is this campaign an announcement" for every batch.
CREATE INDEX IF NOT EXISTS content_announcements_campaign_idx
  ON content_announcements (campaign_id);
