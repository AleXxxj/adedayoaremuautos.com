-- Browsers that have granted permission to be notified.
--
-- One row per browser per device, not per person: the same customer granting
-- it on a phone and a laptop is two rows, and most rows will never have an
-- email attached because the visitor never gave one. That is why this does not
-- hang off newsletter_subscribers.
--
-- endpoint, p256dh and auth are exactly what PushSubscription.toJSON() returns
-- and are stored verbatim. The endpoint is unique per browser per site, which
-- makes it the natural key and the thing the push service answers 410 Gone
-- against when it dies.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint        text NOT NULL,
  p256dh          text NOT NULL,
  auth            text NOT NULL,
  market_code     market_code NOT NULL REFERENCES markets(code),
  user_agent      text,
  failure_count   integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_unique
  ON push_subscriptions (endpoint);

CREATE INDEX IF NOT EXISTS push_subscriptions_market_idx
  ON push_subscriptions (market_code);
