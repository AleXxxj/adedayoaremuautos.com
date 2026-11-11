-- How many free car checks each visitor has run today: a keyed, monthly-
-- rotated hash of the IP address and a count. No VIN, no address.
CREATE TABLE IF NOT EXISTS vin_check_usage (
  visitor text NOT NULL,
  day date NOT NULL,
  lookups integer NOT NULL DEFAULT 0 CHECK (lookups >= 0),
  PRIMARY KEY (visitor, day)
);
