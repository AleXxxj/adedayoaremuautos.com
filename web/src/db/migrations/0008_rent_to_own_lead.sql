-- A rent-to-own enquiry is a different conversation from a hire: different
-- paperwork, different money, different follow-up. Giving it its own lead type
-- means it is distinguishable in the inbox rather than buried among rentals.
ALTER TYPE "public"."lead_type" ADD VALUE IF NOT EXISTS 'rent_to_own';
