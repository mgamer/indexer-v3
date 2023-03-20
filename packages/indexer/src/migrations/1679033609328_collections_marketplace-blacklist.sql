-- Up Migration

ALTER TABLE "collections" ADD COLUMN "marketplace_blacklists" JSONB;

-- Down Migration

ALTER TABLE "collections" DROP COLUMN "marketplace_blacklists";