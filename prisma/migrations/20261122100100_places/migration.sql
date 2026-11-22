-- Public map of sustainable places (/map).
--
-- One row per pin, whether it is an independent place (a farm shop, a toad
-- patrol) or a project started on The Superhero whose lead chose to show it.
-- Additive only: three new tables, nothing existing changes.

-- ── Enums ────────────────────────────────────────────────────────────────

-- Whether the place itself is open. `active` shows nothing in the UI.
CREATE TYPE "PlaceOperatingStatus" AS ENUM ('active', 'temporarily_closed', 'permanently_closed');

-- Moderation switch, separate from whether the place is open. `hidden` is
-- the kill switch: gone from the map, the list and its own page.
CREATE TYPE "PlaceListingStatus" AS ENUM ('published', 'hidden');

CREATE TYPE "PlaceProposalKind" AS ENUM ('new', 'edit', 'remove');
CREATE TYPE "PlaceProposalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- ── Places ───────────────────────────────────────────────────────────────

CREATE TABLE "places" (
  "id"                   TEXT NOT NULL,
  "slug"                 TEXT NOT NULL,
  -- Set = a Superhero project (the lead opted in); null = independent place.
  -- A project switched to members-only is filtered out at read time
  -- (lib/places.ts publicPlacesWhere), so the row can stay.
  "project_id"           TEXT,
  "created_by_id"        TEXT,

  "name"                 TEXT NOT NULL,
  "summary"              TEXT NOT NULL,
  "description"          TEXT,
  -- ISO 639-1 language the texts above are written in.
  "language"             TEXT,
  -- Key from PLACE_CATEGORIES in lib/places-shared.ts (labels are translated
  -- in the message catalogs, so a new category needs no migration).
  "category"             TEXT NOT NULL,

  "latitude"             DOUBLE PRECISION NOT NULL,
  "longitude"            DOUBLE PRECISION NOT NULL,
  -- For activities without a fixed public address: shown as an area.
  "location_approximate" BOOLEAN NOT NULL DEFAULT false,
  "address"              TEXT,
  "city"                 TEXT,
  "country"              TEXT,
  -- IANA zone derived from the coordinates on save; needed for "open now".
  "timezone"             TEXT,

  "website"              TEXT,
  "contact"              TEXT,
  "practical_note"       TEXT,

  -- Versioned JSON, validated in lib/opening-hours.ts. Read, edited and
  -- proposed as one unit, never queried row by row.
  "opening_hours"        JSONB,
  "opening_note"         TEXT,

  "operating_status"     "PlaceOperatingStatus" NOT NULL DEFAULT 'active',
  "status_note"          TEXT,
  "reopens_on"           DATE,
  "closed_at"            TIMESTAMP(3),

  -- ISO 4217 code for the price list; one currency per place.
  "currency"             TEXT,
  "cover_image_url"      TEXT,

  "listing_status"       "PlaceListingStatus" NOT NULL DEFAULT 'published',
  "last_verified_at"     TIMESTAMP(3),
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "places_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "places_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
  CONSTRAINT "places_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180)
);

CREATE UNIQUE INDEX "places_slug_key" ON "places" ("slug");
CREATE UNIQUE INDEX "places_project_id_key" ON "places" ("project_id");
-- Bounding-box lookups for "places near here".
CREATE INDEX "places_latitude_longitude_idx" ON "places" ("latitude", "longitude");
CREATE INDEX "places_country_idx" ON "places" ("country");

ALTER TABLE "places"
  ADD CONSTRAINT "places_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "places"
  ADD CONSTRAINT "places_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Price list ───────────────────────────────────────────────────────────

CREATE TABLE "place_products" (
  "id"          TEXT NOT NULL,
  "place_id"    TEXT NOT NULL,
  "sort_order"  INTEGER NOT NULL DEFAULT 0,
  "name"        TEXT NOT NULL,
  "note"        TEXT,
  -- Whole minor units of the place's currency (cents, Rappen). Null = the
  -- product is listed without a price.
  "price_minor" INTEGER,
  -- Short free text: "per kg", "6 eggs", "1 litre".
  "unit"        TEXT,
  "available"   BOOLEAN NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "place_products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "place_products_price_check" CHECK ("price_minor" IS NULL OR "price_minor" >= 0)
);

CREATE INDEX "place_products_place_id_sort_order_idx"
  ON "place_products" ("place_id", "sort_order");

ALTER TABLE "place_products"
  ADD CONSTRAINT "place_products_place_id_fkey"
  FOREIGN KEY ("place_id") REFERENCES "places" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Proposals: review queue and change history ───────────────────────────

-- Every change to a place is a row here. A member's proposal waits as
-- `pending`; a curator's (or project lead's) direct change is written
-- already `approved`. So the table doubles as the who/when/what record.
CREATE TABLE "place_proposals" (
  "id"              TEXT NOT NULL,
  "kind"            "PlaceProposalKind" NOT NULL,
  -- Null for `new` until approved. Kept (set null) if the place is deleted.
  "place_id"        TEXT,
  -- `new`: every field. `edit`: only the changed fields. `remove`: empty.
  "payload"         JSONB NOT NULL,
  -- The proposer's reason or source ("why this fits").
  "note"            TEXT,
  -- The place's updated_at when the proposal was made, so the reviewer can
  -- be warned that the place has changed since.
  "base_updated_at" TIMESTAMP(3),
  "status"          "PlaceProposalStatus" NOT NULL DEFAULT 'pending',
  "proposer_id"     TEXT,
  "reviewer_id"     TEXT,
  "reviewed_at"     TIMESTAMP(3),
  "review_note"     TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "place_proposals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "place_proposals_status_created_at_idx"
  ON "place_proposals" ("status", "created_at");
CREATE INDEX "place_proposals_place_id_idx" ON "place_proposals" ("place_id");
CREATE INDEX "place_proposals_proposer_id_status_idx"
  ON "place_proposals" ("proposer_id", "status");

ALTER TABLE "place_proposals"
  ADD CONSTRAINT "place_proposals_place_id_fkey"
  FOREIGN KEY ("place_id") REFERENCES "places" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "place_proposals"
  ADD CONSTRAINT "place_proposals_proposer_id_fkey"
  FOREIGN KEY ("proposer_id") REFERENCES "users" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "place_proposals"
  ADD CONSTRAINT "place_proposals_reviewer_id_fkey"
  FOREIGN KEY ("reviewer_id") REFERENCES "users" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
