-- Fixes the birthday CHECK, which accepted half a birthday.
--
-- The first version read:
--
--   (birth_day IS NULL AND birth_month IS NULL)
--   OR (birth_day BETWEEN 1 AND 31 AND birth_month BETWEEN 1 AND 12 AND …)
--
-- With a day and no month that evaluates to `FALSE OR NULL`, because
-- `NULL BETWEEN 1 AND 12` is NULL rather than false. A CHECK constraint only
-- rejects a row when its expression is explicitly FALSE — NULL passes — so a
-- day with no month was stored happily. The application layer refused it, but
-- the point of the constraint is to hold when the application is bypassed.
--
-- Rewritten so no branch can evaluate to NULL: comparing the two IS NULL
-- tests yields a real boolean either way, and the range checks are only
-- reached once both parts are known to be present.
ALTER TABLE "newsletter_subscribers"
  DROP CONSTRAINT IF EXISTS "newsletter_birthday_valid";

ALTER TABLE "newsletter_subscribers"
  ADD CONSTRAINT "newsletter_birthday_valid" CHECK (
    ("birth_day" IS NULL) = ("birth_month" IS NULL)
    AND (
      "birth_day" IS NULL
      OR (
        "birth_day" BETWEEN 1 AND 31
        AND "birth_month" BETWEEN 1 AND 12
        AND NOT ("birth_month" = 2 AND "birth_day" > 29)
        AND NOT ("birth_month" IN (4, 6, 9, 11) AND "birth_day" > 30)
      )
    )
  );
