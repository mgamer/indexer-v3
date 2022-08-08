-- Up Migration
ALTER TABLE "tokens" ADD COLUMN "is_flagged" INT;
ALTER TABLE "tokens" ADD COLUMN "last_flag_update" TIMESTAMPTZ;

-- Down Migration