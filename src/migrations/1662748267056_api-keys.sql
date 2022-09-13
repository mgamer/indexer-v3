-- Up Migration

ALTER TABLE "api_keys" ADD COLUMN "tier" INT;

-- Down Migration