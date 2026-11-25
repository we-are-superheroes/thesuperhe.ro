-- Who runs a map place: a non-profit, a cooperative, a public body or a
-- business. Optional: null means "not known", which is what every existing
-- place gets.
--
-- Plain text like "category": the allowed keys are PLACE_OPERATORS in
-- lib/places-shared.ts and are checked there (validatePlaceInput), so a new
-- kind of operator needs no migration.
--
-- Additive only: one nullable column, nothing existing changes.

ALTER TABLE "places" ADD COLUMN IF NOT EXISTS "operator" TEXT;
