-- Where the renter's licence image lives.
--
-- A storage key, never a URL. The bucket is private, so the only way to view
-- the file is a short-lived signed link minted for a signed-in member of
-- staff — a stored URL would either be permanently public or permanently
-- broken, and the first of those is a photograph of someone's identity
-- document sitting on an address anyone can guess.
--
-- The typed licence number stays. Some renters will not have a photograph to
-- hand, and refusing the booking over it would cost the business the rental.
ALTER TABLE "rental_bookings"
  ADD COLUMN IF NOT EXISTS "licence_storage_key" text;

ALTER TABLE "rental_bookings"
  ADD COLUMN IF NOT EXISTS "licence_uploaded_at" timestamptz;

ALTER TABLE "rental_bookings"
  DROP CONSTRAINT IF EXISTS "rental_bookings_licence_pair";
ALTER TABLE "rental_bookings"
  ADD CONSTRAINT "rental_bookings_licence_pair" CHECK (
    ("licence_storage_key" IS NULL) = ("licence_uploaded_at" IS NULL)
  );
