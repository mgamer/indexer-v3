-- Up Migration

ALTER TABLE "sources_v2" ADD COLUMN "domain_hash" TEXT;

-- Down Migration

ALTER TABLE "sources_v2" DROP COLUMN "domain_hash";