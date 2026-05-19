-- Step + project status overhaul.
--
-- Step statuses:   not_started → open,  done → completed,  skipped → completed,
--                  in_progress / needs_help unchanged. New value: 'defining'.
-- Project statuses: draft → defining, active → in_progress, archived → completed,
--                   completed unchanged. New value: 'needs_help'.
--
-- Approach: create new enum, cast existing columns with a remap, drop the old
-- enum, then rename the new one back.

-- ─── StepStatus ───────────────────────────────────────────────────────────
CREATE TYPE "StepStatus_new" AS ENUM ('open', 'defining', 'in_progress', 'needs_help', 'completed');

ALTER TABLE "project_steps"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "StepStatus_new" USING (
    CASE "status"::text
      WHEN 'not_started' THEN 'open'
      WHEN 'done'        THEN 'completed'
      WHEN 'skipped'     THEN 'completed'
      ELSE "status"::text
    END
  )::"StepStatus_new";

ALTER TABLE "blueprint_steps"
  ALTER COLUMN "status_default" DROP DEFAULT,
  ALTER COLUMN "status_default" TYPE "StepStatus_new" USING (
    CASE "status_default"::text
      WHEN 'not_started' THEN 'open'
      WHEN 'done'        THEN 'completed'
      WHEN 'skipped'     THEN 'completed'
      ELSE "status_default"::text
    END
  )::"StepStatus_new";

DROP TYPE "StepStatus";
ALTER TYPE "StepStatus_new" RENAME TO "StepStatus";

ALTER TABLE "project_steps"   ALTER COLUMN "status"         SET DEFAULT 'open'::"StepStatus";
ALTER TABLE "blueprint_steps" ALTER COLUMN "status_default" SET DEFAULT 'open'::"StepStatus";

-- ─── ProjectStatus ────────────────────────────────────────────────────────
CREATE TYPE "ProjectStatus_new" AS ENUM ('defining', 'needs_help', 'in_progress', 'completed');

ALTER TABLE "projects"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "ProjectStatus_new" USING (
    CASE "status"::text
      WHEN 'draft'    THEN 'defining'
      WHEN 'active'   THEN 'in_progress'
      WHEN 'archived' THEN 'completed'
      ELSE "status"::text
    END
  )::"ProjectStatus_new";

DROP TYPE "ProjectStatus";
ALTER TYPE "ProjectStatus_new" RENAME TO "ProjectStatus";

ALTER TABLE "projects" ALTER COLUMN "status" SET DEFAULT 'defining'::"ProjectStatus";
