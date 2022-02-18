-- Up Migration

CREATE TABLE "fill_events_2" (
  "address" BYTEA NOT NULL,
  "block" INT NOT NULL,
  "block_hash" BYTEA NOT NULL,
  "tx_hash" BYTEA NOT NULL,
  "tx_index" INT NOT NULL,
  "log_index" INT NOT NULL,
  "timestamp" INT NOT NULL,
  "batch_index" INT NOT NULL,
  "order_kind" order_kind_t NOT NULL,
  "order_id" TEXT NOT NULL,
  "order_side" order_side_t NOT NULL,
  "maker" BYTEA NOT NULL,
  "taker" BYTEA NOT NULL,
  "price" NUMERIC(78, 0) NOT NULL,
  "contract" BYTEA NOT NULL,
  "token_id" NUMERIC(78, 0) NOT NULL,
  "amount" NUMERIC(78, 0) NOT NULL
);

ALTER TABLE "fill_events_2"
  ADD CONSTRAINT "fill_events_2_pk"
  PRIMARY KEY ("tx_hash", "log_index", "batch_index");

CREATE INDEX "fill_events_2_block_index"
  ON "fill_events_2" ("block" DESC);

CREATE INDEX "fill_events_2_block_hash_index"
  ON "fill_events_2" ("block_hash");

-- Down Migration

DROP TABLE "fill_events_2";