-- Up Migration

CREATE TABLE "tokens" (
  "contract" BYTEA NOT NULL,
  "token_id" NUMERIC(78, 0) NOT NULL,
  "name" TEXT,
  "description" TEXT,
  "image" TEXT,
  "collection_id" TEXT,
  "metadata_indexed" BOOLEAN,
  "floor_sell_id" TEXT,
  "floor_sell_value" NUMERIC(78, 0),
  "floor_sell_maker" BYTEA,
  "floor_sell_valid_between" TSTZRANGE,
  "top_buy_id" TEXT,
  "top_buy_value" NUMERIC(78, 0),
  "top_buy_maker" BYTEA,
  "top_buy_valid_between" TSTZRANGE,
  "last_sell_timestamp" INT,
  "last_sell_value" NUMERIC(78, 0),
  "last_buy_timestamp" INT,
  "last_buy_value" NUMERIC(78, 0),
  "created_at" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL
);

ALTER TABLE "tokens"
  ADD CONSTRAINT "tokens_pk"
  PRIMARY KEY ("contract", "token_id");

CREATE INDEX "tokens_contract_token_id_floor_sell_value"
  ON "tokens" ("contract", "token_id", "floor_sell_value");

CREATE INDEX "tokens_contract_token_id_top_buy_value"
  ON "tokens" ("contract", "token_id", "top_buy_value" DESC NULLS LAST);

-- https://www.lob.com/blog/supercharge-your-postgresql-performance
-- https://klotzandrew.com/blog/posgres-per-table-autovacuum-management
ALTER TABLE "tokens" SET
  "autovacuum_vacuum_scale_factor" = 0.0,
  "autovacuum_vacuum_threshold" = 5000,
  "autovacuum_analyze_scale_factor" = 0.0,
  "autovacuum_analyze_threshold" = 5000;

-- Down Migration

DROP TABLE "tokens";