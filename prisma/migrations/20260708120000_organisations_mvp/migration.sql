-- Organisations MVP (see organisations-mvp-spec.md).
-- The organisations + user_organisations tables have been schema-only since
-- init; verified zero rows in both staging and production before this
-- rewrite, so the enum swap is safe.

-- ── Enums ────────────────────────────────────────────────────────────────

-- Two org types, one product surface (spec D1). Type is a billing/vetting
-- attribute set by the operator, never a feature fork.
ALTER TABLE "organisations" ALTER COLUMN "type" TYPE TEXT;
DROP TYPE "OrgType";
CREATE TYPE "OrgType" AS ENUM ('nonprofit', 'company');
UPDATE "organisations" SET "type" = 'nonprofit'; -- no rows; belt-and-braces
ALTER TABLE "organisations"
  ALTER COLUMN "type" TYPE "OrgType" USING "type"::"OrgType";

-- Lifecycle: request form creates `pending`; operator approval flips to
-- `active`; `suspended` is the kill switch (page hidden, memberships frozen).
CREATE TYPE "OrgStatus" AS ENUM ('pending', 'active', 'suspended');

-- Visibility is a property of the project, not the org relationship (D3).
CREATE TYPE "ProjectVisibility" AS ENUM ('public', 'org_members');

-- ── Organisations ────────────────────────────────────────────────────────

ALTER TABLE "organisations"
  ADD COLUMN "status" "OrgStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "banner_url" TEXT;

-- ── Memberships ──────────────────────────────────────────────────────────

ALTER TABLE "user_organisations"
  -- Whether this member's contributions to non-org public projects count in
  -- this org's aggregates/exports (D5). Own-project hours always count.
  ADD COLUMN "share_contributions" BOOLEAN NOT NULL DEFAULT true,
  -- Soft leave (D6): null = active member. Historical hours stay in org
  -- aggregates; the person drops out of member-level views.
  ADD COLUMN "left_at" TIMESTAMP(3);

CREATE INDEX "user_organisations_user_id_left_at_idx"
  ON "user_organisations" ("user_id", "left_at");
CREATE INDEX "user_organisations_org_id_left_at_idx"
  ON "user_organisations" ("org_id", "left_at");

-- ── Invites ──────────────────────────────────────────────────────────────

CREATE TABLE "organisation_invites" (
  "id"            TEXT NOT NULL,
  "org_id"        TEXT NOT NULL,
  "code"          TEXT NOT NULL,
  -- If set: targeted invite for that address; if null: open shareable code.
  "email"         TEXT,
  "invited_by_id" TEXT NOT NULL,
  "max_uses"      INTEGER,
  "use_count"     INTEGER NOT NULL DEFAULT 0,
  "expires_at"    TIMESTAMP(3),
  "revoked_at"    TIMESTAMP(3),
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "organisation_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organisation_invites_code_key" ON "organisation_invites" ("code");
CREATE INDEX "organisation_invites_org_id_idx" ON "organisation_invites" ("org_id");

ALTER TABLE "organisation_invites"
  ADD CONSTRAINT "organisation_invites_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organisations" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organisation_invites"
  ADD CONSTRAINT "organisation_invites_invited_by_id_fkey"
  FOREIGN KEY ("invited_by_id") REFERENCES "users" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Projects ─────────────────────────────────────────────────────────────

ALTER TABLE "projects"
  ADD COLUMN "visibility" "ProjectVisibility" NOT NULL DEFAULT 'public';

-- A members-only project must belong to an org (spec invariant 1).
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_org_visibility_check"
  CHECK ("visibility" = 'public' OR "organisation_id" IS NOT NULL);

CREATE INDEX "projects_organisation_id_visibility_idx"
  ON "projects" ("organisation_id", "visibility");
