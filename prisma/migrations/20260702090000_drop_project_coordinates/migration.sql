-- Contract phase of the coordinates removal: the app stopped reading and
-- writing these columns in the previous deploy (location simplification),
-- so dropping them is now safe.
ALTER TABLE "projects"
  DROP COLUMN "latitude",
  DROP COLUMN "longitude";
