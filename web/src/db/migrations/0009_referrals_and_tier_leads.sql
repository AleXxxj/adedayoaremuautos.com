-- ─────────────────────────────────────────────────────────────────────────
-- Rent-to-own applications, and a referral programme that can actually pay.
-- ─────────────────────────────────────────────────────────────────────────

-- Which category someone applied under. The vehicle carries its own tier, but
-- an application can be made against a category before a particular car is
-- chosen, and the tier's rates are what the applicant was shown — so the
-- answer must be recorded rather than re-derived later from a vehicle that may
-- since have been re-tiered or sold.
ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "rental_tier_id" uuid
  REFERENCES "rental_tiers"("id") ON DELETE SET NULL;


-- The homepage has promised 1.5% commission and "track your referrals easily"
-- since the original site. Neither existed: there were no partners, no codes
-- and no attribution, so a commission could only ever be settled from memory.
DO $$ BEGIN
  CREATE TYPE "public"."referral_partner_status" AS ENUM ('active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "referral_partners" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "market_code" "market_code" NOT NULL REFERENCES "markets"("code"),

  -- What the partner shares. Short and speakable, because it gets read down a
  -- phone and written on the back of a receipt.
  "code" text NOT NULL,

  "full_name" text NOT NULL,
  "email" text,
  "phone" text NOT NULL,
  "whatsapp" text,

  -- Deliberately no bank or payout details. A public form that collects
  -- account numbers turns this table into something worth stealing, and the
  -- business already has to speak to a partner before paying them. Payment
  -- arrangements stay off the website, exactly as SSN and BVN do.

  "status" "referral_partner_status" NOT NULL DEFAULT 'active',

  -- Basis points, so 150 = 1.5% — the rate the site advertises. Per partner
  -- rather than a constant: a dealership will want to offer more to someone
  -- sending real volume, and changing it must not rewrite history.
  "commission_bps" integer NOT NULL DEFAULT 150,

  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "referral_partners_code_unique" UNIQUE ("code"),
  -- Uppercase letters, digits and dashes only. The code appears in a URL and
  -- is dictated aloud; anything else invites transcription errors.
  CONSTRAINT "referral_partners_code_shape" CHECK ("code" ~ '^[A-Z0-9-]{4,20}$'),
  CONSTRAINT "referral_partners_commission_sane"
    CHECK ("commission_bps" >= 0 AND "commission_bps" <= 2000)
);

-- Who introduced this enquiry.
ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "referral_partner_id" uuid
  REFERENCES "referral_partners"("id") ON DELETE SET NULL;

-- And who gets paid for the sale. Recorded on the deal as well as the lead,
-- because that is the row that says money changed hands: the rate can be
-- renegotiated and a lead can be reassigned, but what was owed on a completed
-- sale must not move afterwards.
ALTER TABLE "deals"
  ADD COLUMN IF NOT EXISTS "referral_partner_id" uuid
  REFERENCES "referral_partners"("id") ON DELETE SET NULL;

ALTER TABLE "deals"
  ADD COLUMN IF NOT EXISTS "referral_commission_minor" bigint NOT NULL DEFAULT 0;

ALTER TABLE "deals"
  DROP CONSTRAINT IF EXISTS "deals_referral_commission_non_negative";
ALTER TABLE "deals"
  ADD CONSTRAINT "deals_referral_commission_non_negative"
  CHECK ("referral_commission_minor" >= 0);

CREATE INDEX IF NOT EXISTS "leads_referral_partner_idx"
  ON "leads" ("referral_partner_id");
CREATE INDEX IF NOT EXISTS "deals_referral_partner_idx"
  ON "deals" ("referral_partner_id");
CREATE INDEX IF NOT EXISTS "vehicles_rental_tier_idx"
  ON "vehicles" ("rental_tier_id");
