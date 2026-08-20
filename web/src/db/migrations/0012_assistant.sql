-- ─────────────────────────────────────────────────────────────────────────
-- The website assistant.
--
-- Every conversation is kept, not just the ones that turn into an enquiry.
-- What people ask at 2am when nobody is on the phone is the most honest
-- market research this business will ever get, and a chat that ended without
-- a lead is often the most interesting one — it usually means the answer was
-- no, or the car they wanted was not in stock.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "assistant_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "market_code" "market_code" NOT NULL REFERENCES "markets"("code"),

  -- Where the conversation started. "Asked about the Sonata from the Sonata's
  -- own page" is a different conversation from the same question on the
  -- homepage, and the salesperson should be able to see which it was.
  "landing_path" text,

  -- Written by the model once there is something worth summarising, so the
  -- staff inbox holds a paragraph rather than a transcript to wade through.
  "summary" text,
  -- What the visitor was trying to do, in a few words.
  "intent" text,

  -- Set when the assistant captured contact details and filed an enquiry.
  "lead_id" uuid REFERENCES "leads"("id") ON DELETE SET NULL,

  -- True once a human is needed: the visitor asked for one, or the assistant
  -- hit something it is not allowed to answer.
  "needs_human" boolean NOT NULL DEFAULT false,

  -- Cost control and abuse limiting, counted rather than derived so a long
  -- conversation cannot be extended by deleting messages.
  "message_count" integer NOT NULL DEFAULT 0,

  "ip_hash" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_message_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "assistant_message_count_sane"
    CHECK ("message_count" >= 0 AND "message_count" <= 200)
);

CREATE TABLE IF NOT EXISTS "assistant_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL
    REFERENCES "assistant_conversations"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "assistant_role_valid" CHECK ("role" IN ('user', 'assistant'))
);

CREATE INDEX IF NOT EXISTS "assistant_conversations_recent_idx"
  ON "assistant_conversations" ("last_message_at" DESC);
CREATE INDEX IF NOT EXISTS "assistant_conversations_market_idx"
  ON "assistant_conversations" ("market_code", "needs_human");
CREATE INDEX IF NOT EXISTS "assistant_messages_conversation_idx"
  ON "assistant_messages" ("conversation_id", "created_at");
