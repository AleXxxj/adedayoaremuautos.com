-- Price-drop alerts: who asked to be told when one car's price goes down.
--
-- One row per person per car. A "person" is either one browser (its push
-- subscription, stored here exactly as PushSubscription.toJSON() returns it)
-- or one email address that has confirmed through the link we sent it.
--
-- The push details live in this table and not in push_subscriptions on
-- purpose: that table is the audience for every broadcast ("Just arrived"),
-- and somebody who asked about one car's price did not ask for those.
--
-- Stopping deletes the row. Nothing about a watcher is kept afterwards.
-- When a car sells or is unlisted its rows are marked ended (nothing more is
-- sent) and deleted 30 days later. Deleting the car deletes them at once.

CREATE TABLE IF NOT EXISTS price_alerts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id              uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  market_code             market_code NOT NULL REFERENCES markets(code),
  channel                 text NOT NULL,
  push_endpoint           text,
  push_p256dh             text,
  push_auth               text,
  email                   text,
  price_minor_at_watch    bigint NOT NULL,
  last_alert_price_minor  bigint,
  last_alert_at           timestamptz,
  stop_token              text NOT NULL,
  confirm_token           text,
  confirm_sent_at         timestamptz,
  confirmed_at            timestamptz,
  ended_at                timestamptz,
  failure_count           integer NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT price_alerts_channel_known CHECK (channel IN ('push', 'email')),
  CONSTRAINT price_alerts_price_positive CHECK (price_minor_at_watch > 0),
  -- Exactly one way to reach them, and all of it.
  CONSTRAINT price_alerts_one_destination CHECK (
    (channel = 'push'
       AND push_endpoint IS NOT NULL AND push_p256dh IS NOT NULL AND push_auth IS NOT NULL
       AND email IS NULL)
    OR
    (channel = 'email'
       AND email IS NOT NULL AND email = lower(email)
       AND push_endpoint IS NULL AND push_p256dh IS NULL AND push_auth IS NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS price_alerts_vehicle_push_unique
  ON price_alerts (vehicle_id, push_endpoint) WHERE push_endpoint IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS price_alerts_vehicle_email_unique
  ON price_alerts (vehicle_id, email) WHERE email IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS price_alerts_stop_token_unique
  ON price_alerts (stop_token);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS price_alerts_confirm_token_unique
  ON price_alerts (confirm_token) WHERE confirm_token IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS price_alerts_email_idx
  ON price_alerts (email) WHERE email IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS price_alerts_push_endpoint_idx
  ON price_alerts (push_endpoint) WHERE push_endpoint IS NOT NULL;
