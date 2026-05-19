-- Presence ping — used to surface "Online" indicators in messaging.
ALTER TABLE "users" ADD COLUMN "last_seen_at" TIMESTAMP(3);

-- CreateTable: conversations
CREATE TABLE "conversations" (
  "id"               TEXT NOT NULL,
  "participants_key" TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversations_participants_key_key"
  ON "conversations" ("participants_key");

CREATE INDEX "conversations_updated_at_idx"
  ON "conversations" ("updated_at" DESC);

-- CreateTable: conversation_participants
CREATE TABLE "conversation_participants" (
  "conversation_id" TEXT NOT NULL,
  "user_id"         TEXT NOT NULL,
  "joined_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_read_at"    TIMESTAMP(3),
  "muted_at"        TIMESTAMP(3),
  "archived_at"     TIMESTAMP(3),

  CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversation_id", "user_id")
);

CREATE INDEX "conversation_participants_user_id_archived_at_idx"
  ON "conversation_participants" ("user_id", "archived_at");

-- CreateTable: messages
CREATE TABLE "messages" (
  "id"              TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "sender_id"       TEXT,
  "body"            TEXT NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "edited_at"       TIMESTAMP(3),
  "deleted_at"      TIMESTAMP(3),

  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "messages_conversation_id_created_at_idx"
  ON "messages" ("conversation_id", "created_at" DESC);

-- Foreign keys
ALTER TABLE "conversation_participants"
  ADD CONSTRAINT "conversation_participants_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversation_participants"
  ADD CONSTRAINT "conversation_participants_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
