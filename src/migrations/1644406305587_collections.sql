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
  "token_count" INT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ
);

ALTER TABLE "collections"
  ADD CONSTRAINT "collections_pk"
  PRIMARY KEY ("id");

CREATE INDEX "collections_contract_token_id_range_index"
  ON "collections" ("contract", "token_id_range")
  INCLUDE ("id");

CREATE INDEX "collections_community_index"
  ON "collections" ("community");

-- Down Migration

DROP TABLE "collections";