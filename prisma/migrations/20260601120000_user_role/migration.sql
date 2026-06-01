-- Platform role on users. The "UserRole" enum type already exists (created
-- in the init migration), so we only add the column.
ALTER TABLE "users"
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'member';

-- Bootstrap the first admin. Idempotent: re-running sets the same value.
-- If the row doesn't exist yet (account not created), this is a no-op and the
-- grant must be applied again once the user has signed in.
UPDATE "users" SET "role" = 'admin' WHERE "email" = 'matthew@leve.tt';
