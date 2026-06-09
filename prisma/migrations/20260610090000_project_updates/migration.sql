-- Project updates — lead-authored posts on the project page, public or
-- members-only. author_id is SET NULL on user deletion so the update
-- survives and renders as "Former member" (same pattern as messages.sender_id).

CREATE TYPE "UpdateVisibility" AS ENUM ('public', 'members');

CREATE TABLE "project_updates" (
  "id"         TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "author_id"  TEXT,
  "body"       TEXT NOT NULL,
  "visibility" "UpdateVisibility" NOT NULL DEFAULT 'members',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "edited_at"  TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "project_updates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_updates_project_id_created_at_idx"
  ON "project_updates" ("project_id", "created_at" DESC);

-- Foreign keys
ALTER TABLE "project_updates"
  ADD CONSTRAINT "project_updates_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_updates"
  ADD CONSTRAINT "project_updates_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
