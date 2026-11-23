-- Automatic translations of map places.
--
-- One row per place and platform language, holding a machine translation of
-- the place's free texts (summary, description, notes, price-list texts).
-- `source_hash` ties the row to the texts it was made from: the app shows a
-- translation only while the hash still matches, so an edited place falls
-- back to its original text until it is translated again.
-- Additive only: one new table, nothing existing changes.

CREATE TABLE "place_translations" (
  "id"              TEXT NOT NULL,
  "place_id"        TEXT NOT NULL,
  -- Target language: one of SUPPORTED_LOCALES in lib/locale-shared.ts.
  "locale"          TEXT NOT NULL,
  "source_hash"     TEXT NOT NULL,
  -- ISO 639 code of the source texts: the place's own, else detected.
  "source_language" TEXT,
  -- { "fields": { "summary": … }, "terms": { "<source text>": "<translation>" } }.
  -- Empty when the place is already written in this language.
  "texts"           JSONB NOT NULL,
  "model"           TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "place_translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "place_translations_place_id_locale_key"
  ON "place_translations" ("place_id", "locale");

ALTER TABLE "place_translations"
  ADD CONSTRAINT "place_translations_place_id_fkey"
  FOREIGN KEY ("place_id") REFERENCES "places" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
