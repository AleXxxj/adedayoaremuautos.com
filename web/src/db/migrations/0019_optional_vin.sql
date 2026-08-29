-- Make the VIN optional in both markets.
--
-- The rule was: a US listing must carry a valid 17-character VIN, and a
-- Nigerian one must carry a chassis number or a VIN. In practice that stopped
-- sales staff entering stock at all — a car is often on the forecourt and
-- being photographed well before anyone has walked round to read the plate,
-- and refusing the whole record until then means it is not entered.
--
-- What is kept is the shape of the number when there is one. A VIN that is
-- present must still be seventeen characters from the VIN alphabet (I, O and Q
-- are excluded because they are too easily confused with 1 and 0), so a
-- half-typed one is still refused. An absent VIN is now simply absent.
--
-- The unique index on VIN already excludes nulls, so any number of vehicles
-- may have none while two can still never share one.

ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_identity_matches_market;

ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_vin_well_formed
  CHECK (vin IS NULL OR vin ~ '^[A-HJ-NPR-Z0-9]{17}$');
