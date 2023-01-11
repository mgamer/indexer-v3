-- Up Migration

ALTER TABLE "sources_v2" ADD COLUMN "created_at" TIMESTAMPTZ;
ALTER TABLE "sources_v2" ALTER "created_at" SET DEFAULT now();

-- Down Migration

ALTER TABLE "sources_v2" DROP COLUMN "created_at";
