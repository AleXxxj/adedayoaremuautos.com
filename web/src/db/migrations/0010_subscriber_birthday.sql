-- Birthday, so the business can send a greeting and an offer.
--
-- Day and month only. The request was for date of birth, but the year is not
-- needed to wish someone a happy birthday and carrying it is a materially
-- different proposition: name + email + full date of birth is one of the
-- standard building blocks of identity theft, it pulls the site into stricter
-- data-protection territory in both markets, and learning that a subscriber is
-- under 13 creates obligations under COPPA that nobody here wants. Day and
-- month gives the whole benefit at a fraction of the risk.
--
-- Both nullable: the field is optional, and a newsletter box that demands a
-- birthday collects fewer addresses than one that does not.
ALTER TABLE "newsletter_subscribers"
  ADD COLUMN IF NOT EXISTS "birth_day" integer;

ALTER TABLE "newsletter_subscribers"
  ADD COLUMN IF NOT EXISTS "birth_month" integer;

-- A first name, so a greeting can be addressed to a person rather than opening
-- "Hi there". Optional for the same reason.
ALTER TABLE "newsletter_subscribers"
  ADD COLUMN IF NOT EXISTS "first_name" text;

ALTER TABLE "newsletter_subscribers"
  DROP CONSTRAINT IF EXISTS "newsletter_birthday_valid";

-- Either both parts are present or neither is. Half a birthday cannot be acted
-- on, and storing it would leave the greeting job filtering out rows forever.
-- 29 February is deliberately allowed; which day to greet in a common year is
-- a decision for whoever sends the mail, not a reason to reject the date.
ALTER TABLE "newsletter_subscribers"
  ADD CONSTRAINT "newsletter_birthday_valid" CHECK (
    ("birth_day" IS NULL AND "birth_month" IS NULL)
    OR (
      "birth_day" BETWEEN 1 AND 31
      AND "birth_month" BETWEEN 1 AND 12
      AND NOT ("birth_month" = 2 AND "birth_day" > 29)
      AND NOT ("birth_month" IN (4, 6, 9, 11) AND "birth_day" > 30)
    )
  );

-- The greeting job asks "whose birthday is today", so month and day lead.
CREATE INDEX IF NOT EXISTS "newsletter_birthday_idx"
  ON "newsletter_subscribers" ("birth_month", "birth_day");
