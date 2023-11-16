-- Up Migration
ALTER TABLE "tokens" ADD COLUMN "image_version_updated_at" TIMESTAMPTZ;


-- Down Migration

ALTER TABLE "tokens" DROP COLUMN "image_version_updated_at";