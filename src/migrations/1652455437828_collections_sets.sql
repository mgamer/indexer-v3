-- Up Migration

CREATE TABLE "collections_sets" (
  "id" BIGSERIAL NOT NULL,
  "community" TEXT
);

ALTER TABLE "collections_sets"
  ADD CONSTRAINT "collections_sets_pk"
  PRIMARY KEY ("id");

CREATE UNIQUE INDEX "collections_sets_community_unique_index"
  ON "collections_sets" ("community");

CREATE TABLE "collections_sets_collections" (
  "collections_sets_id" BIGINT NOT NULL,
  "collections_id" TEXT NOT NULL
);

ALTER TABLE "collections_sets_collections"
  ADD CONSTRAINT "collections_sets_collections_pk"
  PRIMARY KEY ("collections_sets_id", "collections_id");

-- Down Migration

DROP TABLE "collections_sets_collections";

DROP TABLE "collections_sets";