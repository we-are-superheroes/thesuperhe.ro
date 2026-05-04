-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('member', 'admin');
CREATE TYPE "OrgType" AS ENUM ('ngo', 'academic', 'corporate', 'government', 'community', 'other');
CREATE TYPE "OrgRole" AS ENUM ('owner', 'admin', 'member');
CREATE TYPE "Proficiency" AS ENUM ('beginner', 'intermediate', 'expert');
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'active', 'completed', 'archived');
CREATE TYPE "StepStatus" AS ENUM ('not_started', 'in_progress', 'needs_help', 'done', 'skipped');
CREATE TYPE "ContributionStatus" AS ENUM ('pending', 'active', 'completed', 'withdrawn');
CREATE TYPE "ContributionRole" AS ENUM ('lead', 'contributor', 'advisor', 'observer');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "bio" TEXT,
    "location" TEXT,
    "timezone" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "skills" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

CREATE TABLE "user_skills" (
    "user_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "proficiency" "Proficiency" NOT NULL,
    "is_seeking" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "user_skills_pkey" PRIMARY KEY ("user_id", "skill_id")
);

CREATE TABLE "organisations" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "OrgType" NOT NULL,
    "description" TEXT,
    "logo_url" TEXT,
    "website" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organisations_slug_key" ON "organisations"("slug");

CREATE TABLE "user_organisations" (
    "user_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "user_organisations_pkey" PRIMARY KEY ("user_id", "org_id")
);

CREATE TABLE "project_types" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    CONSTRAINT "project_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_types_name_key" ON "project_types"("name");

CREATE TABLE "blueprints" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "created_by" TEXT NOT NULL,
    "project_type_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "estimated_hrs" INTEGER,
    "reuse_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "blueprints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "blueprint_steps" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "blueprint_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "estimated_hrs" INTEGER,
    "status_default" "StepStatus" NOT NULL DEFAULT 'not_started',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "blueprint_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "projects" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "organisation_id" TEXT,
    "blueprint_id" TEXT,
    "project_type_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "location" TEXT,
    "remote_ok" BOOLEAN NOT NULL DEFAULT true,
    "time_commitment_hrs" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_steps" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "project_id" TEXT NOT NULL,
    "blueprint_step_id" TEXT,
    "assigned_to" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "estimated_hrs" INTEGER,
    "status" "StepStatus" NOT NULL DEFAULT 'not_started',
    "due_date" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "project_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "step_skills" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "skill_id" TEXT NOT NULL,
    "blueprint_step_id" TEXT,
    "project_step_id" TEXT,
    "context" TEXT,
    CONSTRAINT "step_skills_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contributions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "project_step_id" TEXT,
    "role" "ContributionRole" NOT NULL,
    "status" "ContributionStatus" NOT NULL DEFAULT 'pending',
    "hours_contributed" INTEGER NOT NULL DEFAULT 0,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "contributions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "contributions_user_id_project_id_project_step_id_key" ON "contributions"("user_id", "project_id", "project_step_id");

-- AddForeignKey
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE;
ALTER TABLE "user_organisations" ADD CONSTRAINT "user_organisations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "user_organisations" ADD CONSTRAINT "user_organisations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE;
ALTER TABLE "blueprints" ADD CONSTRAINT "blueprints_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id");
ALTER TABLE "blueprints" ADD CONSTRAINT "blueprints_project_type_id_fkey" FOREIGN KEY ("project_type_id") REFERENCES "project_types"("id");
ALTER TABLE "blueprint_steps" ADD CONSTRAINT "blueprint_steps_blueprint_id_fkey" FOREIGN KEY ("blueprint_id") REFERENCES "blueprints"("id") ON DELETE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id");
ALTER TABLE "projects" ADD CONSTRAINT "projects_blueprint_id_fkey" FOREIGN KEY ("blueprint_id") REFERENCES "blueprints"("id");
ALTER TABLE "projects" ADD CONSTRAINT "projects_project_type_id_fkey" FOREIGN KEY ("project_type_id") REFERENCES "project_types"("id");
ALTER TABLE "project_steps" ADD CONSTRAINT "project_steps_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "project_steps" ADD CONSTRAINT "project_steps_blueprint_step_id_fkey" FOREIGN KEY ("blueprint_step_id") REFERENCES "blueprint_steps"("id");
ALTER TABLE "project_steps" ADD CONSTRAINT "project_steps_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id");
ALTER TABLE "step_skills" ADD CONSTRAINT "step_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE;
ALTER TABLE "step_skills" ADD CONSTRAINT "step_skills_blueprint_step_id_fkey" FOREIGN KEY ("blueprint_step_id") REFERENCES "blueprint_steps"("id") ON DELETE CASCADE;
ALTER TABLE "step_skills" ADD CONSTRAINT "step_skills_project_step_id_fkey" FOREIGN KEY ("project_step_id") REFERENCES "project_steps"("id") ON DELETE CASCADE;
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_project_step_id_fkey" FOREIGN KEY ("project_step_id") REFERENCES "project_steps"("id");
