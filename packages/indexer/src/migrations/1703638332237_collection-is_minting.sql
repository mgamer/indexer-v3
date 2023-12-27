-- Up Migration

ALTER TABLE "collections" ADD COLUMN "is_minting" INT;

-- Down Migration

ALTER TABLE "collections" DROP COLUMN "is_minting";