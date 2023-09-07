-- Up Migration

CREATE TABLE "gas_estimations" (
  "tag_id" TEXT NOT NULL,
  "tags" JSONB NOT NULL,
  "gas" NUMERIC(78, 0),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "gas_estimations"
  ADD CONSTRAINT "gas_estimations_pk"
  PRIMARY KEY ("tag_id");

CREATE INDEX "gas_estimations_tags_index"
  ON "gas_estimations" ("tags");

-- Down Migration

DROP TABLE "gas_estimations";