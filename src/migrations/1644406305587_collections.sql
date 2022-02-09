-- Up Migration

CREATE TABLE "collections" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "metadata" JSONB,
  "royalties" JSONB,
  "community" TEXT,
  "contract" BYTEA NOT NULL,
  "token_id_range" NUMRANGE NOT NULL,
  "token_set_id" TEXT,
  "created_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ
);

ALTER TABLE "collections"
  ADD CONSTRAINT "collections_pk"
  PRIMARY KEY ("id");

CREATE INDEX "collections_contract_token_id_range_index"
  ON "collections" ("contract", "token_id_range")
  INCLUDE ("id");

-- Down Migration

DROP TABLE "collections";