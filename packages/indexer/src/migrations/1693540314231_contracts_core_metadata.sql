-- Up Migration

ALTER TABLE "collections" ADD COLUMN "symbol" TEXT;
ALTER TABLE "collections" ADD COLUMN "name" TEXT;

-- Down Migration

ALTER TABLE "collections" DROP COLUMN "symbol";
ALTER TABLE "collections" DROP COLUMN "name";
