-- Up Migration

CREATE TABLE "collections_sets" (
  "id" BIGSERIAL NOT NULL,
  "collections_hash" TEXT
);

ALTER TABLE "collections_sets"
  ADD CONSTRAINT "collections_sets_pk"
  PRIMARY KEY ("id");

CREATE UNIQUE INDEX "collections_sets_collections_hash_unique_index"
  ON "collections_sets" ("collections_hash");

CREATE TABLE "collections_sets_collections" (
  "collections_sets_id" TEXT NOT NULL,
  "collections_id" TEXT NOT NULL
);

ALTER TABLE "collections_sets_collections"
  ADD CONSTRAINT "collections_sets_collections_pk"
  PRIMARY KEY ("collections_sets_id", "collections_id");

-- Down Migration

DROP TABLE "collections_sets_collections";

DROP TABLE "collections_sets";