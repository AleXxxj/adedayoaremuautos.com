-- ─────────────────────────────────────────────────────────────────────────
-- Broadcasts to the mailing list.
--
-- A message to every customer is the least reversible thing this admin can
-- do, so it is recorded per recipient rather than fired and forgotten. That
-- record is what makes sending resumable when a serverless function runs out
-- of time halfway through a list, and it is what stops the same person being
-- emailed twice when it resumes.
-- ─────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "public"."campaign_status" AS ENUM ('draft', 'sending', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "market_code" "market_code" NOT NULL REFERENCES "markets"("code"),

  "subject" text NOT NULL,
  "body" text NOT NULL,

  "status" "campaign_status" NOT NULL DEFAULT 'draft',

  -- Who sent it. Kept as an email as well as an id because the point of this
  -- column is to answer "who sent that?" months later, and a staff row can be
  -- deactivated or a person can leave.
  "created_by" uuid REFERENCES "staff"("id") ON DELETE SET NULL,
  "created_by_email" text,

  "recipient_count" integer NOT NULL DEFAULT 0,
  "sent_count" integer NOT NULL DEFAULT 0,
  "failed_count" integer NOT NULL DEFAULT 0,

  "created_at" timestamptz NOT NULL DEFAULT now(),
  "started_at" timestamptz,
  "completed_at" timestamptz,

  CONSTRAINT "campaigns_subject_present" CHECK (length(btrim("subject")) > 0),
  CONSTRAINT "campaigns_body_present" CHECK (length(btrim("body")) > 0),
  CONSTRAINT "campaigns_counts_sane" CHECK (
    "recipient_count" >= 0 AND "sent_count" >= 0 AND "failed_count" >= 0
  )
);

CREATE TABLE IF NOT EXISTS "campaign_recipients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,

  -- The subscriber may later be deleted; the record of having been emailed
  -- must survive that, so the address is denormalised alongside the link.
  "subscriber_id" uuid REFERENCES "newsletter_subscribers"("id") ON DELETE SET NULL,
  "email" text NOT NULL,

  "status" text NOT NULL DEFAULT 'pending',
  "error" text,
  "sent_at" timestamptz,

  CONSTRAINT "campaign_recipient_status_valid"
    CHECK ("status" IN ('pending', 'sent', 'failed')),

  -- The safety rail. Resuming an interrupted send re-reads pending rows, and
  -- without this a retry could email the same person twice.
  CONSTRAINT "campaign_recipient_once" UNIQUE ("campaign_id", "email")
);

CREATE INDEX IF NOT EXISTS "campaign_recipients_pending_idx"
  ON "campaign_recipients" ("campaign_id", "status");
CREATE INDEX IF NOT EXISTS "campaigns_recent_idx"
  ON "campaigns" ("created_at" DESC);
