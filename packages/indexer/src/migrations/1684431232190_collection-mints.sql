-- Up Migration

CREATE TABLE "collection_mints" (
  "collection_id" TEXT NOT NULL,
  "max_supply" NUMERIC(78, 0),
  "mint_details" JSONB,
  "currency" BYTEA NOT NULL,
  "price" NUMERIC(78, 0) NOT NULL
);

ALTER TABLE "collection_mints"
  ADD CONSTRAINT "collection_mints_pk"
  PRIMARY KEY ("collection_id");

-- Down Migration