-- New values on existing enums for the public map of places.
--
-- Kept in a migration of its own: Postgres does not let a new enum value be
-- used in the transaction that adds it, so nothing here reads or writes the
-- new values. The tables come in the next migration.

-- Curators add and edit map places directly and review proposals from other
-- members. Platform admins count as curators. Granted from /admin/curators.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'curator';

-- Sent to the member who proposed a place (or a change to one) once a
-- curator has decided.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'place_proposal_approved';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'place_proposal_rejected';
