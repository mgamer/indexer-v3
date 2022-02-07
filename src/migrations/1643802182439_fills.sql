-- Up Migration

CREATE TABLE "fill_events" (
  "address" BYTEA NOT NULL,
  "block" INT NOT NULL,
  "block_hash" BYTEA NOT NULL,
  "tx_hash" BYTEA NOT NULL,
  "tx_index" INT NOT NULL,
  "log_index" INT NOT NULL,
  "timestamp" INT NOT NULL,
  "buy_order_id" TEXT NOT NULL,
  "sell_order_id" TEXT NOT NULL,
  "maker" BYTEA NOT NULL,
  "taker" BYTEA NOT NULL,
  "price" NUMERIC(78, 0)
);

ALTER TABLE "fill_events"
  ADD CONSTRAINT "fill_events_pk"
  PRIMARY KEY ("block_hash", "tx_hash", "log_index");

CREATE INDEX "fill_events_block_index"
  ON "fill_events" ("block" DESC);

-- Down Migration

DROP TABLE "fill_events";