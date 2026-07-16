-- The member's preferred UI language (ISO 639-1: en/fr/de/es/it/ru/uk/pt).
-- Null means "no explicit choice" — the request falls back to the
-- superhero-locale cookie, then Accept-Language, then English.
-- Validated in application code (setLocaleAction), not by a CHECK, so
-- adding a locale later is a code change only.
ALTER TABLE "users" ADD COLUMN "locale" TEXT;
