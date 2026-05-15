-- CreateEnum
CREATE TYPE "ProjectJoinPolicy" AS ENUM ('open', 'approval_required');

-- AlterTable: add the new column with default 'open'.
ALTER TABLE "projects"
  ADD COLUMN "join_policy" "ProjectJoinPolicy" NOT NULL DEFAULT 'open';

-- Copy data from the old boolean.
UPDATE "projects"
SET "join_policy" = CASE
  WHEN "join_approval_required" = TRUE THEN 'approval_required'::"ProjectJoinPolicy"
  ELSE 'open'::"ProjectJoinPolicy"
END;

-- Drop the old boolean column.
ALTER TABLE "projects" DROP COLUMN "join_approval_required";
