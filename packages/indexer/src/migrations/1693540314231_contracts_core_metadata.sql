-- Up Migration

ALTER TABLE "collections" ADD COLUMN "symbol" TEXT;
ALTER TABLE "collections" ADD COLUMN "name" TEXT;

-- Down Migration
