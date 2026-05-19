-- Blueprint variants + per-blueprint and per-project locale.
--
-- Blueprint gains:
--   parent_blueprint_id (self-FK)  → forms family / variant relationships
--   language                       → ISO 639-1 ("en", "de", …)
--   country                        → ISO 3166-1 alpha-2 ("GB", "CH", …)
--
-- Project gains:
--   language, country              → pre-filled from blueprint on launch;
--                                    editable; used by browse filters.
--
-- All new columns are nullable; existing rows remain valid as
-- single-variant roots / locale-less projects.

ALTER TABLE "blueprints"
  ADD COLUMN "parent_blueprint_id" TEXT,
  ADD COLUMN "language"            TEXT,
  ADD COLUMN "country"             TEXT;

ALTER TABLE "blueprints"
  ADD CONSTRAINT "blueprints_parent_blueprint_id_fkey"
    FOREIGN KEY ("parent_blueprint_id") REFERENCES "blueprints"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "blueprints_parent_blueprint_id_idx" ON "blueprints"("parent_blueprint_id");
CREATE INDEX "blueprints_country_idx"             ON "blueprints"("country");
CREATE INDEX "blueprints_language_idx"            ON "blueprints"("language");

ALTER TABLE "projects"
  ADD COLUMN "language" TEXT,
  ADD COLUMN "country"  TEXT;

CREATE INDEX "projects_country_idx"  ON "projects"("country");
CREATE INDEX "projects_language_idx" ON "projects"("language");
