-- Up Migration

ALTER TABLE "contracts" ADD COLUMN "marketplace_blacklists" JSONB;

-- Down Migration

ALTER TABLE "contracts" DROP COLUMN "marketplace_blacklists";