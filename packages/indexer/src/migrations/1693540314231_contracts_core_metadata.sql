-- Up Migration

ALTER TABLE "contracts" ADD COLUMN "symbol" TEXT;
ALTER TABLE "contracts" ADD COLUMN "name" TEXT;
ALTER TABLE "contracts" ADD COLUMN "created_at" TIMESTAMPTZ

-- Down Migration

ALTER TABLE "contracts" DROP COLUMN "symbol";
ALTER TABLE "contracts" DROP COLUMN "name";
ALTER TABLE "contracts" DROP COLUMN "created_at";