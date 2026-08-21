-- Vehicles featured in a broadcast.
--
-- Stored as ids rather than as a copy of the listing, so the email is built
-- from whatever the vehicle looks like at send time — the price, the photo and
-- the specification are resolved in the same breath as the message goes out,
-- and cannot be a stale duplicate of a row that has since been edited.
--
-- A jsonb array rather than a join table: this is an ordered list chosen by
-- hand, never queried across, and the order the sender picked is the order
-- they appear in. A join table would need a position column to say the same
-- thing and would buy nothing else.
ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "vehicle_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "campaigns"
  DROP CONSTRAINT IF EXISTS "campaigns_vehicle_ids_is_array";
ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_vehicle_ids_is_array"
  CHECK (jsonb_typeof("vehicle_ids") = 'array' AND jsonb_array_length("vehicle_ids") <= 12);
