-- Step-workflow simplification, EXPAND phase (contract follows in a later
-- commit once this code is live everywhere). Enums are deliberately left
-- untouched here: old serverless instances keep writing old values during
-- the deploy window, and a Prisma client whose enum lacks a value crashes
-- deserialising rows that still carry it. The contract migration re-runs
-- these remaps and rebuilds the enum types.

-- 1. "Needs help" becomes an orthogonal flag: a step can be in progress
--    AND asking for more hands (impossible while it was a status).
ALTER TABLE "project_steps" ADD COLUMN "help_wanted" BOOLEAN NOT NULL DEFAULT false;

-- 2. Remap step statuses. 'defining' merges into 'open'; 'needs_help'
--    splits by whether anyone is actually on the step.
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

-- 3. Blueprint step defaults collapse to 'open' (the column is write-only
--    dead weight — fork code hardcodes 'open' — and is dropped in contract).
UPDATE "blueprint_steps" SET "status_default" = 'open' WHERE "status_default" <> 'open';

-- 4. Contribution 'completed' was a denormalised mirror of step status
--    (only ever written by the step-status sync). Derive from the step
--    instead; the rows are, by construction, active joiners of a
--    completed step.
UPDATE "contributions" SET "status" = 'active' WHERE "status" = 'completed';

-- 5. advisor/observer were never set anywhere; belt-and-braces before the
--    contract-phase enum rebuild.
UPDATE "contributions" SET "role" = 'contributor' WHERE "role" IN ('advisor', 'observer');

-- 6. Declined join requests now notify the applicant.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'project_join_declined';
