-- Pre-launch guest mailing list (double opt-in). Separate from `users`:
-- these people have no account, and their consent is marketing consent that
-- signing up would never imply. A row starts `pending` and becomes
-- `confirmed` only once the confirmation link is clicked. We own the list;
-- Resend is only the delivery pipe.

CREATE TABLE "waitlist_subscribers" (
  "id"               TEXT NOT NULL,
  -- Stored lowercased; the unique index below makes re-subscribes idempotent.
  "email"            TEXT NOT NULL,
  -- pending → confirmed → unsubscribed (validated in application code).
  "status"           TEXT NOT NULL DEFAULT 'pending',
  -- Captured at signup so confirmation + launch emails go out in the guest's
  -- language — there is no account preference to read.
  "locale"           TEXT,
  -- Light attribution: where the signup happened (e.g. 'home').
  "source"           TEXT,
  -- Single-use token in the confirmation email; cleared on confirm.
  "confirm_token"    TEXT,
  -- Stable one-click unsubscribe token (List-Unsubscribe header + link).
  "unsubscribe_token" TEXT NOT NULL,
  -- Consent proof: snapshot of the exact wording agreed to, and when.
  "consent_text"     TEXT,
  "consented_at"     TIMESTAMP(3),
  "confirmed_at"     TIMESTAMP(3),
  "unsubscribed_at"  TIMESTAMP(3),
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "waitlist_subscribers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "waitlist_subscribers_email_key"
  ON "waitlist_subscribers" ("email");
CREATE UNIQUE INDEX "waitlist_subscribers_confirm_token_key"
  ON "waitlist_subscribers" ("confirm_token");
CREATE UNIQUE INDEX "waitlist_subscribers_unsubscribe_token_key"
  ON "waitlist_subscribers" ("unsubscribe_token");
CREATE INDEX "waitlist_subscribers_status_idx"
  ON "waitlist_subscribers" ("status");
