-- Up Migration

ALTER TABLE "collections" ADD COLUMN "metadata_refresh_version" INT DEFAULT 0

-- Down Migration

ALTER TABLE "collections" DROP COLUMN "metadata_refresh_version";
