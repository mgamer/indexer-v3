-- Up Migration

CREATE TYPE "attribute_key_kind_t" AS ENUM (
  'string',
  'number',
  'date',
  'range'
);

CREATE TABLE "attribute_keys" (
  "id" BIGSERIAL NOT NULL,
  "collection_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "kind" "attribute_key_kind_t" NOT NULL,
  "rank" INT,
  "attribute_count" INT NOT NULL DEFAULT 0
);

ALTER TABLE "attribute_keys"
  ADD CONSTRAINT "attribute_keys_pk"
  PRIMARY KEY ("id");

CREATE UNIQUE INDEX "attribute_keys_collection_id_key_unique_index"
  ON "attribute_keys" ("collection_id", "key");

CREATE INDEX "attribute_keys_collection_id_rank_key_index"
  ON "attribute_keys" ("collection_id", "rank" DESC)
  WHERE ("rank" IS NOT NULL);

CREATE TABLE "attributes" (
  "id" BIGSERIAL NOT NULL,
  "attribute_key_id" INT NOT NULL,
  "value" TEXT NOT NULL,
  "token_count" INT NOT NULL DEFAULT 0,
  "on_sale_count" INT NOT NULL DEFAULT 0,
  "floor_sell_value" NUMERIC(78, 0),
  "top_buy_value" NUMERIC(78, 0)
);

CREATE UNIQUE INDEX "attributes_attribute_key_id_value_unique_index"
  ON "attributes" ("attribute_key_id", "value");

ALTER TABLE "attributes"
  ADD CONSTRAINT "attributes_pk"
  PRIMARY KEY ("id");

CREATE TABLE "token_attributes" (
  "contract" BYTEA NOT NULL,
  "token_id" NUMERIC(78, 0) NOT NULL,
  "attribute_id" BIGINT NOT NULL,
  "collection_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "sell_updated_at" TIMESTAMPTZ,
  "buy_updated_at" TIMESTAMPTZ
);

ALTER TABLE "token_attributes"
  ADD CONSTRAINT "token_attributes_pk"
  PRIMARY KEY ("contract", "token_id", "attribute_id");

CREATE INDEX "token_attributes_contract_token_id_key_value_index"
  ON "token_attributes" ("contract", "token_id", "key", "value");

CREATE INDEX "attributes_floor_sell_value_index"
  ON "token_attributes" ("floor_sell_value" DESC NULLS LAST)

CREATE INDEX "attributes_top_buy_value_index"
  ON "token_attributes" ("top_buy_value" DESC NULLS LAST)

-- TODO: Look into replacing the current primary key with the below index

CREATE UNIQUE INDEX "token_attributes_attribute_id_contract_token_id_unique_index"
  ON "token_attributes"("attribute_id", "contract", "token_id");

-- Down Migration

DROP TABLE "token_attributes";

DROP TABLE "attributes";

DROP TABLE "attribute_keys";

DROP TYPE "attribute_key_kind_t";