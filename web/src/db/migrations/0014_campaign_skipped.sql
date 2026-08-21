-- Lets a recipient be recorded as deliberately skipped.
--
-- Someone can unsubscribe between the moment a campaign's audience is frozen
-- and the moment their batch is reached. They must not be emailed — but with
-- only pending/sent/failed available there was nowhere to record that, so the
-- row stayed pending forever: the campaign could never finish, and "Continue
-- sending" would offer itself again on every press with nothing left to do.
--
-- Skipped is not a failure. Nothing went wrong; the person opted out, and the
-- system honoured it. Counting it as failed would mark clean campaigns as
-- broken and hide real delivery problems among them.
ALTER TABLE "campaign_recipients"
  DROP CONSTRAINT IF EXISTS "campaign_recipient_status_valid";

ALTER TABLE "campaign_recipients"
  ADD CONSTRAINT "campaign_recipient_status_valid"
  CHECK ("status" IN ('pending', 'sent', 'failed', 'skipped'));
