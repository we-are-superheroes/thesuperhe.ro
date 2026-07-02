-- Harden invariants that were previously app-enforced only.
-- Verified before landing: zero XOR violations and zero duplicate
-- project-level contributions in both staging and production.

-- A StepSkill belongs to exactly one of a blueprint step or a project step.
ALTER TABLE "step_skills"
  ADD CONSTRAINT "step_skills_exactly_one_parent"
  CHECK (("blueprint_step_id" IS NULL) <> ("project_step_id" IS NULL));

-- Postgres treats NULLs as distinct in unique indexes, so the composite
-- @@unique(userId, projectId, projectStepId) never guarded project-level
-- rows (projectStepId NULL). This partial index closes that hole; the
-- manual findFirst checks in the actions stay as friendly-error guards.
CREATE UNIQUE INDEX "contributions_project_level_unique"
  ON "contributions" ("user_id", "project_id")
  WHERE "project_step_id" IS NULL;

-- Composite index for the hot membership lookups (every project page and
-- most actions filter contributions by user + project).
CREATE INDEX "contributions_user_id_project_id_idx"
  ON "contributions" ("user_id", "project_id");

-- Step-level contributions die with their step (was NO ACTION, forcing
-- manual deletes before removing a step — those stay as belt-and-braces).
ALTER TABLE "contributions"
  DROP CONSTRAINT "contributions_project_step_id_fkey";
ALTER TABLE "contributions"
  ADD CONSTRAINT "contributions_project_step_id_fkey"
  FOREIGN KEY ("project_step_id") REFERENCES "project_steps" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
