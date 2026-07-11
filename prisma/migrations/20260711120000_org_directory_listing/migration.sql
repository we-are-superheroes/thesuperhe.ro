-- Organisations can opt in to the public directory on /organisations.
-- Off by default: existing orgs stay unlisted until an admin flips it.
ALTER TABLE "organisations" ADD COLUMN "listed" BOOLEAN NOT NULL DEFAULT false;
