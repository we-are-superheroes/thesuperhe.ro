-- Optional precise location on Project — a human-readable address and/or a
-- lat/lng pair. Used to build the "Open in Google Maps" link on the project
-- page. Coarse "City, Country" stays on projects.location for the browse-page
-- filters.

ALTER TABLE "projects"
  ADD COLUMN "address"   TEXT,
  ADD COLUMN "latitude"  DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION;
