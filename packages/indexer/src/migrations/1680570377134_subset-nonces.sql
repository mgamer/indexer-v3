-- Up Migration

CREATE TABLE "subset_nonce_events" (
  "address" BYTEA NOT NULL,
  "block" INT NOT NULL,
  "block_hash" BYTEA NOT NULL,
  "tx_hash" BYTEA NOT NULL,
  "tx_index" INT NOT NULL,
  "log_index" INT NOT NULL,
  "timestamp" INT NOT NULL,
  "batch_index" INT NOT NULL,
  "order_kind" order_kind_t NOT NULL,
  "maker" BYTEA NOT NULL,
  "nonce" NUMERIC(78, 0) NOT NULL
);

ALTER TABLE "subset_nonce_events"
  ADD CONSTRAINT "subset_nonce_events_pk"
  PRIMARY KEY ("tx_hash", "log_index", "batch_index");

CREATE INDEX "subset_nonce_events_block_block_hash_index"
  ON "subset_nonce_events" ("block", "block_hash");

CREATE INDEX "subset_nonce_events_order_kind_maker_nonce_index"
  ON "subset_nonce_events" ("order_kind", "maker", "nonce");

-- Down Migration

DROP TABLE "subset_nonce_events";