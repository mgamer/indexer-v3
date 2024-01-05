-- Up Migration

ALTER TABLE "tokens" ADD COLUMN "decimals" INT;

-- Down Migration

ALTER TABLE "tokens" DROP COLUMN "decimals";