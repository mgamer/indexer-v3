-- Up Migration

ALTER TYPE "fill_events_2" ADD COLUMN "kind" TEXT;

-- Down Migration

ALTER TYPE "fill_events_2" DROP COLUMN "kind";