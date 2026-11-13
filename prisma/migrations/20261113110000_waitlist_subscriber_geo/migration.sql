-- Rough location of a waitlist signup, so launch e-mails can be sent only to
-- the countries a project is relevant for. Both come from the signup request
-- itself (the hosting platform's country lookup and the browser's language
-- list); the IP address is never stored. Additive and nullable: subscribers
-- from before this migration simply have no known country.

ALTER TABLE "waitlist_subscribers"
  ADD COLUMN "country" TEXT,
  ADD COLUMN "accept_language" TEXT;

CREATE INDEX "waitlist_subscribers_status_country_idx"
  ON "waitlist_subscribers" ("status", "country");
