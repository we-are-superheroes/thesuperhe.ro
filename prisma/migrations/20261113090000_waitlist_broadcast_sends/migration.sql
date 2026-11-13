-- Sent-log for launch broadcasts to the waitlist. One row per
-- (broadcast, subscriber) that the e-mail provider accepted. broadcast_key is
-- a hash of the broadcast's subject + body, so re-running a broadcast after a
-- partial failure or a timeout only reaches subscribers who have not had it.

CREATE TABLE "waitlist_broadcast_sends" (
  "broadcast_key" TEXT NOT NULL,
  "subscriber_id" TEXT NOT NULL,
  "sent_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "waitlist_broadcast_sends_pkey" PRIMARY KEY ("broadcast_key", "subscriber_id"),
  CONSTRAINT "waitlist_broadcast_sends_subscriber_id_fkey"
    FOREIGN KEY ("subscriber_id") REFERENCES "waitlist_subscribers" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "waitlist_broadcast_sends_subscriber_id_idx"
  ON "waitlist_broadcast_sends" ("subscriber_id");
