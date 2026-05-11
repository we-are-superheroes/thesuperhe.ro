-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM (
  'project_join',
  'project_join_request',
  'project_leave',
  'project_updated',
  'project_status_changed',
  'step_claimed',
  'step_unclaimed',
  'step_completed',
  'step_needs_help',
  'step_assigned',
  'blueprint_forked',
  'skill_match',
  'reminder_step_idle',
  'message_received',
  'mention',
  'invite_received',
  'project_milestone',
  'welcome'
);

-- AlterTable
ALTER TABLE "projects" ADD COLUMN "join_approval_required" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "notifications" (
  "id"             TEXT NOT NULL,
  "user_id"        TEXT NOT NULL,
  "type"           "NotificationType" NOT NULL,
  "actor_id"       TEXT,
  "project_id"     TEXT,
  "step_id"        TEXT,
  "blueprint_id"   TEXT,
  "title"          TEXT NOT NULL,
  "body"           TEXT,
  "data"           JSONB,
  "read_at"        TIMESTAMP(3),
  "emailed_at"     TIMESTAMP(3),
  "resolved_at"    TIMESTAMP(3),
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications" ("user_id", "created_at" DESC);
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications" ("user_id", "read_at");

-- AddForeignKey
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
