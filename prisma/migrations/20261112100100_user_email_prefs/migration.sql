-- Per-user email preferences for notification delivery.
--   email_notifications  — master on/off for "email me about activity".
--   email_unsub_token    — opaque token behind the one-click unsubscribe link
--                          in those emails; every row (existing and new) gets
--                          one from the DB default so neither the app nor the
--                          Clerk webhook has to populate it.

-- gen_random_uuid() lives in pgcrypto. Supabase enables it by default; make
-- the dependency explicit so a fresh database applies this cleanly.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "users"
  ADD COLUMN "email_notifications" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "email_unsub_token" TEXT NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX "users_email_unsub_token_key"
  ON "users" ("email_unsub_token");
