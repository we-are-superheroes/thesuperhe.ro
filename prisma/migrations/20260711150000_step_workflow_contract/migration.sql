-- Step-workflow simplification, CONTRACT phase. The expand migration
-- (20260710090000) remapped the data and the new code has been live since;
-- verified zero legacy values on staging and production before landing this.
-- Enum rebuild pattern follows 20260519145500_status_overhaul. Any
-- unexpected straggler fails the USING cast loudly and rolls the whole
-- migration back unrecorded — rerun after fixing the data.

-- 0. Re-map stragglers written during the expand rollout window (no-ops on
--    clean databases; repeats the expand remaps verbatim).
UPDATE "project_steps" SET "status" = 'open' WHERE "status" = 'defining';

UPDATE "project_steps" ps
SET "status" = 'in_progress', "help_wanted" = true
WHERE ps."status" = 'needs_help'
  AND EXISTS (
    SELECT 1 FROM "contributions" c
    WHERE c."project_step_id" = ps."id" AND c."status" = 'active'
  );

UPDATE "project_steps"
SET "status" = 'open', "help_wanted" = true
WHERE "status" = 'needs_help';

UPDATE "blueprint_steps" SET "status_default" = 'open' WHERE "status_default" <> 'open';
UPDATE "contributions" SET "status" = 'active' WHERE "status" = 'completed';
UPDATE "contributions" SET "role" = 'contributor' WHERE "role" IN ('advisor', 'observer');

-- 1. StepStatus → open | in_progress | completed
CREATE TYPE "StepStatus_new" AS ENUM ('open', 'in_progress', 'completed');

ALTER TABLE "project_steps"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "StepStatus_new" USING (
    CASE "status"::text
      WHEN 'defining'   THEN 'open'
      WHEN 'needs_help' THEN 'in_progress'
      ELSE "status"::text
    END
  )::"StepStatus_new";

-- status_default was write-only dead weight: fork code always hardcoded
-- 'open' and nothing ever read the column.
ALTER TABLE "blueprint_steps" DROP COLUMN "status_default";

DROP TYPE "StepStatus";
ALTER TYPE "StepStatus_new" RENAME TO "StepStatus";
ALTER TABLE "project_steps" ALTER COLUMN "status" SET DEFAULT 'open'::"StepStatus";

-- 2. ContributionStatus → pending | active | withdrawn
CREATE TYPE "ContributionStatus_new" AS ENUM ('pending', 'active', 'withdrawn');
ALTER TABLE "contributions"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "ContributionStatus_new" USING (
    CASE "status"::text WHEN 'completed' THEN 'active' ELSE "status"::text END
  )::"ContributionStatus_new";
DROP TYPE "ContributionStatus";
ALTER TYPE "ContributionStatus_new" RENAME TO "ContributionStatus";
ALTER TABLE "contributions" ALTER COLUMN "status" SET DEFAULT 'pending'::"ContributionStatus";

-- 3. ContributionRole → lead | contributor
CREATE TYPE "ContributionRole_new" AS ENUM ('lead', 'contributor');
ALTER TABLE "contributions"
  ALTER COLUMN "role" TYPE "ContributionRole_new" USING (
    CASE "role"::text
      WHEN 'advisor'  THEN 'contributor'
      WHEN 'observer' THEN 'contributor'
      ELSE "role"::text
    END
  )::"ContributionRole_new";
DROP TYPE "ContributionRole";
ALTER TYPE "ContributionRole_new" RENAME TO "ContributionRole";
