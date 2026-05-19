-- Multi-joiner step model + per-entry time logging.
--
-- 1. Rename project_steps.assigned_to → coordinator_id. Semantics shift from
--    "the one person on this step" to "the coordinator" — joiners are now
--    tracked many-to-many via contributions(project_step_id).
-- 2. Change contributions.hours_contributed from int → double precision so
--    fractional-hour time logs can be summed onto it.
-- 3. New time_logs table.

-- 1. Rename the column + its FK constraint
ALTER TABLE "project_steps" RENAME COLUMN "assigned_to" TO "coordinator_id";
ALTER TABLE "project_steps" RENAME CONSTRAINT "project_steps_assigned_to_fkey" TO "project_steps_coordinator_id_fkey";

-- 2. Widen the cached hours sum
ALTER TABLE "contributions" ALTER COLUMN "hours_contributed" TYPE DOUBLE PRECISION;

-- 3. time_logs table
CREATE TABLE "time_logs" (
  "id"              TEXT NOT NULL,
  "user_id"         TEXT NOT NULL,
  "project_step_id" TEXT NOT NULL,
  "hours"           DOUBLE PRECISION NOT NULL,
  "note"            TEXT,
  "logged_on"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "time_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "time_logs_user_id_logged_on_idx"          ON "time_logs"("user_id", "logged_on" DESC);
CREATE INDEX "time_logs_project_step_id_logged_on_idx" ON "time_logs"("project_step_id", "logged_on" DESC);

ALTER TABLE "time_logs"
  ADD CONSTRAINT "time_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "time_logs_project_step_id_fkey"
    FOREIGN KEY ("project_step_id") REFERENCES "project_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
